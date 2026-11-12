"""Logique d'authentification : inscription, connexion, jetons à usage unique, réinitialisation, Google."""
import datetime
from dataclasses import dataclass

import httpx
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import appsettings, flags, mail, notifications, twofactor
from app.core.completeness import compute_completeness
from app.core.config import get_settings
from app.core.errors import AppError, bad_request, conflict, unauthorized
from app.core.ids import utcnow
import hmac
import secrets

from app.core.security import dummy_hash, hash_ip, hash_password, hmac_hex, random_token, sha256, verify_password
from app.models.models import (
    Account, EmailCode, Entitlement, NotificationPreference, Preference, Profile, Session, User, VerificationToken,
)

CODE_MAX_ATTEMPTS = 5
RESEND_COOLDOWN = datetime.timedelta(seconds=30)

MAX_FAILED = 5
LOCK_MINUTES = 15
TWO_FACTOR_TTL = datetime.timedelta(minutes=5)


class TwoFactorRequired(Exception):
    """Mot de passe (ou lien magique) accepté, mais le compte a la double authentification : on renvoie un défi (jeton de 5 min) au lieu d'ouvrir une session."""

    def __init__(self, challenge: str):
        self.challenge = challenge


@dataclass
class ReqCtx:
    ip: str | None = None
    user_agent: str | None = None
    country: str | None = None  # code ISO du pays de connexion (jamais l'adresse IP)


def _st(u: User) -> str:
    return getattr(u.status, "value", u.status)


SHORT_SESSION = datetime.timedelta(hours=24)
MAGIC_TTL = datetime.timedelta(minutes=15)
MAGIC_RESEND_AFTER = datetime.timedelta(seconds=60)


async def create_session(db: AsyncSession, user_id: str, ctx: ReqCtx, remember: bool = True) -> tuple[str, datetime.datetime]:
    """Session de SESSION_TTL_DAYS jours si « Restez connecté », sinon 24 h (et le cookie disparaît à la fermeture du navigateur)."""
    token = random_token(32)
    expires = utcnow() + (datetime.timedelta(days=get_settings().session_ttl_days) if remember else SHORT_SESSION)
    db.add(Session(userId=user_id, tokenHash=sha256(token), expiresAt=expires, userAgent=(ctx.user_agent or None) and ctx.user_agent[:255], ipHash=hash_ip(ctx.ip)))
    previous = (await db.execute(select(User.lastCountry, User.email).where(User.id == user_id))).first() if ctx.country else None
    if ctx.country:
        await db.execute(update(User).where(User.id == user_id).values(lastCountry=ctx.country))
    await db.commit()
    if previous and previous[0] and previous[0] != ctx.country:
        await _alert_new_country(db, user_id, previous[1], ctx.country)
    return token, expires


async def _alert_new_country(db: AsyncSession, user_id: str, email: str | None, country: str) -> None:
    """Connexion depuis un autre pays que la précédente : notification dans l'application + e-mail. Jamais bloquant : un échec d'envoi n'empêche pas la connexion.
    Aucun blocage ni verrouillage : un membre en voyage ou de la diaspora reste un membre honnête (voir geo.py)."""
    try:
        await notifications.create(db, user_id, "SECURITY_ALERT", {"event": "new_country", "country": country})
        if email:
            name = (await db.execute(select(Profile.displayName).where(Profile.userId == user_id))).scalar_one_or_none() or ""
            await mail.send_login_alert(email, name, country)
    except Exception:  # noqa: BLE001
        await db.rollback()


async def _issue_token(db: AsyncSession, user_id: str, type_: str, ttl: datetime.timedelta) -> str:
    await db.execute(update(VerificationToken).where(VerificationToken.userId == user_id, VerificationToken.type == type_, VerificationToken.usedAt.is_(None)).values(usedAt=utcnow()))
    token = random_token(32)
    db.add(VerificationToken(userId=user_id, type=type_, tokenHash=sha256(token), expiresAt=utcnow() + ttl))
    await db.commit()
    return token




async def _create_user_with_profile(db: AsyncSession, *, email: str, password_hash: str | None, email_verified: bool, profile: dict, account: tuple[str, str] | None = None) -> User:
    from app.core import launch

    await launch.assert_open(db, profile.get("country"))  # inscription limitée aux pays ouverts par l'administration
    await launch.assert_city_open(db, profile.get("city"))  # … et, si l'administration en a listé, aux villes ouvertes
    now = utcnow()
    user = User(email=email, passwordHash=password_hash, acceptedTermsAt=now, emailVerifiedAt=now if email_verified else None)
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise conflict("EMAIL_TAKEN", "Cette adresse e-mail est déjà utilisée") from None
    db.add_all([Profile(userId=user.id, **profile), Preference(userId=user.id), NotificationPreference(userId=user.id), Entitlement(userId=user.id)])
    if account:
        db.add(Account(userId=user.id, provider=account[0], providerAccountId=account[1]))
    await db.commit()
    return user


async def register(db: AsyncSession, inp, ctx: ReqCtx) -> tuple[User, tuple[str, datetime.datetime]]:
    if (await db.execute(select(User.id).where(User.email == inp.email))).first():
        raise conflict("EMAIL_TAKEN", "Cette adresse e-mail est déjà utilisée")
    pw = await hash_password(inp.password)
    completeness = compute_completeness(bio="", occupation=None, interest_count=0, photo_count=0, intent="UNSURE")
    user = await _create_user_with_profile(db, email=inp.email, password_hash=pw, email_verified=False, profile=dict(
        displayName=inp.displayName, birthDate=inp.birthDate, gender=inp.gender, country=inp.country, city=inp.city, completeness=completeness))
    from app.core import referral  # fourni par le fork B

    await referral.attach(db, user.id, inp.referralCode)
    await send_confirmation(db, user, inp.displayName)
    return user, await create_session(db, user.id, ctx)


async def login(db: AsyncSession, inp, ctx: ReqCtx):
    user = (await db.execute(select(User).where(User.email == inp.email))).scalar_one_or_none()
    if user and user.lockedUntil and user.lockedUntil > utcnow():
        raise AppError(429, "ACCOUNT_LOCKED", "Trop de tentatives. Réessayez dans quelques minutes.")
    hashed = (user.passwordHash if user else None) or await dummy_hash()
    ok = await verify_password(hashed, inp.password)
    if not user or not user.passwordHash or not ok or _st(user) in ("DELETED", "BANNED"):
        if user and user.passwordHash:
            failed = user.failedLogins + 1
            if failed >= MAX_FAILED:
                user.failedLogins, user.lockedUntil = 0, utcnow() + datetime.timedelta(minutes=LOCK_MINUTES)
            else:
                user.failedLogins = failed
            await db.commit()
        raise unauthorized("INVALID_CREDENTIALS", "E-mail ou mot de passe incorrect")
    user.failedLogins, user.lockedUntil = 0, None
    await db.commit()
    if user.totpEnabledAt:  # double authentification : pas de session avant le code
        raise TwoFactorRequired(await _issue_token(db, user.id, "TWO_FACTOR", TWO_FACTOR_TTL))
    user.lastActiveAt = utcnow()
    await db.commit()
    return user, await create_session(db, user.id, ctx, getattr(inp, "remember", True))


async def complete_two_factor(db: AsyncSession, challenge: str, code: str, remember: bool, ctx: ReqCtx):
    """Deuxième étape de la connexion : défi + code (TOTP ou de secours) → session. Les mauvais codes comptent comme des échecs de connexion (même verrouillage)."""
    t = await _valid_token(db, challenge, "TWO_FACTOR")
    user = await db.get(User, t.userId)
    if not user or _st(user) in ("DELETED", "BANNED") or not user.totpEnabledAt:
        raise bad_request("INVALID_TOKEN", "Lien invalide ou expiré")
    if user.lockedUntil and user.lockedUntil > utcnow():
        raise AppError(429, "ACCOUNT_LOCKED", "Trop de tentatives. Réessayez dans quelques minutes.")
    if not await twofactor.check_code(db, user.id, code):
        failed = user.failedLogins + 1
        if failed >= MAX_FAILED:
            user.failedLogins, user.lockedUntil = 0, utcnow() + datetime.timedelta(minutes=LOCK_MINUTES)
            await db.execute(update(VerificationToken).where(VerificationToken.id == t.id).values(usedAt=utcnow()))  # le défi est brûlé
        else:
            user.failedLogins = failed
        await db.commit()
        raise AppError(401, "INVALID_2FA_CODE", "Code incorrect")
    claimed = await db.execute(update(VerificationToken).where(VerificationToken.id == t.id, VerificationToken.usedAt.is_(None)).values(usedAt=utcnow()))
    if claimed.rowcount == 0:  # défi déjà utilisé en parallèle
        await db.rollback()
        raise bad_request("INVALID_TOKEN", "Lien invalide ou expiré")
    user.failedLogins, user.lockedUntil, user.lastActiveAt = 0, None, utcnow()
    await db.commit()
    return user, await create_session(db, user.id, ctx, remember)


async def logout(db: AsyncSession, session_id: str) -> None:
    await db.execute(update(Session).where(Session.id == session_id).values(revokedAt=utcnow()))
    await db.commit()


async def _valid_token(db: AsyncSession, token: str, type_: str) -> VerificationToken:
    t = (await db.execute(select(VerificationToken).where(VerificationToken.tokenHash == sha256(token)))).scalar_one_or_none()
    if not t or t.type.value != type_ or t.usedAt or t.expiresAt < utcnow():
        raise bad_request("INVALID_TOKEN", "Lien invalide ou expiré")
    return t


async def verify_email(db: AsyncSession, token: str) -> None:
    t = await _valid_token(db, token, "EMAIL_VERIFY")
    now = utcnow()
    # « Réclamation » atomique : deux requêtes simultanées ne consomment pas le même jeton deux fois.
    claimed = await db.execute(update(VerificationToken).where(VerificationToken.id == t.id, VerificationToken.usedAt.is_(None)).values(usedAt=now))
    if claimed.rowcount == 0:
        await db.rollback()
        raise bad_request("INVALID_TOKEN", "Lien invalide ou expiré")
    await db.execute(update(User).where(User.id == t.userId).values(emailVerifiedAt=now))
    await db.commit()
    # Le profil peut déjà être complet : cadeau de profil et parrainage dépendent aussi de la vérification.
    try:
        from app.core import gift

        await gift.gift_tokens_if_eligible(db, t.userId)
    except Exception:  # Silence assumé : un échec du cadeau ne doit pas faire échouer la vérification (rejouable plus tard).
        await db.rollback()


def _code_hash(user_id: str, code: str) -> str:
    """HMAC (jamais le code en clair) lié au compte : un code volé d'une base ne sert à rien sans le secret du serveur."""
    return hmac_hex(get_settings().ip_hash_salt, f"{user_id}:{code}")


async def send_confirmation(db: AsyncSession, user: User, name: str) -> None:
    """Émet un nouveau code (les précédents sont invalidés) ET un lien, et envoie un seul e-mail contenant les deux."""
    minutes = await appsettings.get(db, "signup.code_ttl_minutes")
    now = utcnow()
    await db.execute(update(EmailCode).where(EmailCode.userId == user.id, EmailCode.consumedAt.is_(None)).values(consumedAt=now))
    code = get_settings().fixed_email_code or f"{secrets.randbelow(1_000_000):06d}"  # code fixe : développement local uniquement
    db.add(EmailCode(userId=user.id, codeHash=_code_hash(user.id, code), expiresAt=now + datetime.timedelta(minutes=minutes)))
    await db.commit()
    token = await _issue_token(db, user.id, "EMAIL_VERIFY", datetime.timedelta(hours=24))
    await mail.send_verification(user.email, name, token, code, minutes)


async def _mark_verified(db: AsyncSession, user_id: str) -> None:
    await db.execute(update(User).where(User.id == user_id, User.emailVerifiedAt.is_(None)).values(emailVerifiedAt=utcnow()))
    await db.commit()
    # Le profil peut déjà être complet : cadeau de profil et parrainage dépendent aussi de la vérification.
    try:
        from app.core import gift

        await gift.gift_tokens_if_eligible(db, user_id)
    except Exception:  # Silence assumé : un échec du cadeau ne doit pas faire échouer la vérification (rejouable plus tard).
        await db.rollback()


async def verify_code(db: AsyncSession, user_id: str, code: str) -> None:
    """Confirme l'e-mail avec le code reçu. Après 5 essais faux, le code est annulé : il faut en demander un nouveau."""
    user = await db.get(User, user_id)
    if user is None:
        raise unauthorized()
    if user.emailVerifiedAt:
        return
    row = (await db.execute(select(EmailCode).where(EmailCode.userId == user_id, EmailCode.consumedAt.is_(None)).order_by(EmailCode.createdAt.desc()).limit(1))).scalar_one_or_none()
    now = utcnow()
    if row is None or row.expiresAt <= now:
        raise bad_request("CODE_EXPIRED", "Ce code a expiré : demandez-en un nouveau")
    if row.attempts >= CODE_MAX_ATTEMPTS:
        raise AppError(429, "CODE_LOCKED", "Trop d'essais : demandez un nouveau code")
    if not hmac.compare_digest(row.codeHash, _code_hash(user_id, code)):
        row.attempts += 1
        left = CODE_MAX_ATTEMPTS - row.attempts
        if left <= 0:
            row.consumedAt = now  # code épuisé
        await db.commit()
        raise AppError(400, "INVALID_CODE", "Code incorrect", {"remaining": max(left, 0)})
    claimed = await db.execute(update(EmailCode).where(EmailCode.id == row.id, EmailCode.consumedAt.is_(None)).values(consumedAt=now))
    if claimed.rowcount == 0:  # deux saisies simultanées : une seule consomme le code
        await db.rollback()
        raise bad_request("CODE_EXPIRED", "Ce code a expiré : demandez-en un nouveau")
    await db.commit()
    await _mark_verified(db, user_id)


async def resend_verification(db: AsyncSession, user_id: str) -> int:
    """Nouveau code. Au plus un envoi toutes les 30 secondes (évite d'inonder une boîte e-mail) ; renvoie le délai avant le prochain envoi possible."""
    u = await db.get(User, user_id)
    if not u or u.emailVerifiedAt:
        return 0
    last = (await db.execute(select(EmailCode.createdAt).where(EmailCode.userId == user_id).order_by(EmailCode.createdAt.desc()).limit(1))).scalar_one_or_none()
    if last and utcnow() - last < RESEND_COOLDOWN:
        wait = int((RESEND_COOLDOWN - (utcnow() - last)).total_seconds()) + 1
        raise AppError(429, "RESEND_TOO_SOON", "Patientez un instant avant de redemander un code", {"retryAfter": wait})
    p = (await db.execute(select(Profile.displayName).where(Profile.userId == user_id))).scalar_one_or_none()
    await send_confirmation(db, u, p or "")
    return int(RESEND_COOLDOWN.total_seconds())


async def verification_state(db: AsyncSession, user_id: str) -> dict:
    """État de l'étape de confirmation : adresse masquée, délais et date de suppression automatique d'un compte non confirmé."""
    u = await db.get(User, user_id)
    cfg = await appsettings.all_values(db)
    last = (await db.execute(select(EmailCode.createdAt).where(EmailCode.userId == user_id).order_by(EmailCode.createdAt.desc()).limit(1))).scalar_one_or_none()
    name, _, domain = u.email.partition("@")
    masked = f"{name[:2]}{'•' * max(len(name) - 2, 1)}@{domain}"
    wait = max(0, int((RESEND_COOLDOWN - (utcnow() - last)).total_seconds()) + 1) if last else 0
    purge_at = u.createdAt + datetime.timedelta(hours=cfg["signup.unverified_ttl_hours"])
    return {"verified": bool(u.emailVerifiedAt), "email": masked, "codeMinutes": cfg["signup.code_ttl_minutes"], "resendIn": wait if wait <= 31 else 0,
            "devCode": get_settings().fixed_email_code, "deleteAfterHours": cfg["signup.unverified_ttl_hours"], "deleteAt": purge_at.isoformat(timespec="milliseconds") + "Z", "maxAttempts": CODE_MAX_ATTEMPTS}


async def purge_unverified(db: AsyncSession, now: datetime.datetime | None = None) -> int:
    """Supprime les comptes jamais confirmés après la durée réglée par l'administration (`signup.unverified_ttl_hours`). Ne touche ni aux comptes confirmés,
    ni au personnel, ni aux comptes déjà supprimés ou bannis."""
    from sqlalchemy import delete as sa_delete

    from app.core import storage
    from app.core.profile_card import thumb_key
    from app.models.models import ProfilePhoto, SystemSetting

    now = now or utcnow()
    hours = await appsettings.get(db, "signup.unverified_ttl_hours")
    ids = list((await db.execute(select(User.id).where(User.emailVerifiedAt.is_(None), User.status == "ACTIVE", User.role == "USER", User.passwordHash.is_not(None),
                                                       User.createdAt < now - datetime.timedelta(hours=hours)))).scalars().all())
    if not ids:
        return 0
    keys = list((await db.execute(select(ProfilePhoto.key).join(Profile, Profile.id == ProfilePhoto.profileId).where(Profile.userId.in_(ids)))).scalars().all())
    await db.execute(sa_delete(User).where(User.id.in_(ids)))  # les clés étrangères en cascade retirent profil, préférences, sessions, codes…
    total = await db.get(SystemSetting, "stats.unverified_purged")
    if total:
        total.value = int(total.value) + len(ids)
    else:
        db.add(SystemSetting(key="stats.unverified_purged", value=len(ids)))
    await db.commit()
    for k in keys:
        await storage.delete(k)
        await storage.delete(thumb_key(k))
    return len(ids)


async def forgot_password(db: AsyncSession, email: str) -> None:
    """Réponse identique que l'adresse existe ou non (pas d'énumération de comptes)."""
    u = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not u or _st(u) in ("DELETED", "BANNED"):
        return
    p = (await db.execute(select(Profile.displayName).where(Profile.userId == u.id))).scalar_one_or_none()
    token = await _issue_token(db, u.id, "PASSWORD_RESET", datetime.timedelta(hours=1))
    await mail.send_password_reset(u.email, p or "", token)


async def reset_password(db: AsyncSession, token: str, password: str) -> None:
    t = await _valid_token(db, token, "PASSWORD_RESET")
    pw = await hash_password(password)
    now = utcnow()
    claimed = await db.execute(update(VerificationToken).where(VerificationToken.id == t.id, VerificationToken.usedAt.is_(None)).values(usedAt=now))
    if claimed.rowcount == 0:
        await db.rollback()
        raise bad_request("INVALID_TOKEN", "Lien invalide ou expiré")
    await db.execute(update(User).where(User.id == t.userId).values(passwordHash=pw, failedLogins=0, lockedUntil=None, emailVerifiedAt=now))
    await db.execute(update(Session).where(Session.userId == t.userId, Session.revokedAt.is_(None)).values(revokedAt=now))
    await db.commit()
    await notifications.create(db, t.userId, "SECURITY_ALERT", {"event": "password_reset"})


async def change_password(db: AsyncSession, user_id: str, current: str, new: str, keep_session_id: str) -> None:
    u = await db.get(User, user_id)
    if not u or not u.passwordHash or not await verify_password(u.passwordHash, current):
        raise unauthorized("INVALID_CREDENTIALS", "Mot de passe actuel incorrect")
    u.passwordHash = await hash_password(new)
    await db.execute(update(Session).where(Session.userId == user_id, Session.revokedAt.is_(None), Session.id != keep_session_id).values(revokedAt=utcnow()))
    await db.commit()
    await notifications.create(db, user_id, "SECURITY_ALERT", {"event": "password_changed"})


async def google(db: AsyncSession, id_token: str, extra, ctx: ReqCtx):
    """Connexion Google : le jeton d'identité est vérifié auprès de Google (audience = notre client ID)."""
    client_id = get_settings().google_client_id
    if not client_id:
        raise AppError(501, "OAUTH_NOT_CONFIGURED", "Connexion Google non configurée")
    async with httpx.AsyncClient(timeout=10) as http:
        r = await http.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": id_token})
    if r.status_code != 200:
        raise unauthorized("INVALID_OAUTH_TOKEN")
    p = r.json()
    if (p.get("aud") != client_id or p.get("iss") not in ("accounts.google.com", "https://accounts.google.com") or not p.get("sub") or not p.get("email")
            or str(p.get("email_verified")).lower() != "true" or int(p.get("exp") or 0) < int(utcnow().replace(tzinfo=datetime.timezone.utc).timestamp())):
        raise unauthorized("INVALID_OAUTH_TOKEN")
    email = p["email"].lower()
    linked = (await db.execute(select(Account).where(Account.provider == "google", Account.providerAccountId == p["sub"]))).scalar_one_or_none()
    user = await db.get(User, linked.userId) if linked else (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user and not linked:
        db.add(Account(userId=user.id, provider="google", providerAccountId=p["sub"]))
        if not user.emailVerifiedAt:
            # Compte créé avec cette adresse mais jamais confirmé : quelqu'un d'autre a pu choisir le mot de passe (pré-détournement).
            # Google prouve que l'adresse appartient à la personne qui se connecte : on retire l'ancien mot de passe et toutes les sessions.
            user.emailVerifiedAt = utcnow()
            user.passwordHash = None
            await db.execute(delete(Session).where(Session.userId == user.id))
        await db.commit()
    if not user:
        await flags.assert_on(db, "registration_open")  # la connexion d'un compte existant reste possible, pas la création
        if not (extra.birthDate and extra.gender and extra.country and extra.city and extra.acceptTerms):
            raise AppError(409, "PROFILE_DETAILS_REQUIRED", "Informations complémentaires requises")
        user = await _create_user_with_profile(db, email=email, password_hash=None, email_verified=True, account=("google", p["sub"]), profile=dict(
            displayName=(p.get("name") or email.split("@")[0])[:40], birthDate=extra.birthDate, gender=extra.gender, country=extra.country, city=extra.city,
            completeness=compute_completeness(bio="", occupation=None, interest_count=0, photo_count=0, intent="UNSURE")))
    if _st(user) in ("DELETED", "BANNED"):
        raise unauthorized("INVALID_CREDENTIALS")
    if user.totpEnabledAt:  # le membre a choisi la double authentification : elle vaut pour TOUTES les méthodes de connexion, Google compris
        raise TwoFactorRequired(await _issue_token(db, user.id, "TWO_FACTOR", TWO_FACTOR_TTL))
    return user, await create_session(db, user.id, ctx, extra.remember)


async def request_magic_link(db: AsyncSession, email: str, remember: bool = True) -> None:
    """Envoie un lien de connexion à usage unique (15 min). Réponse identique que l'adresse existe ou non (pas d'énumération) ;
    un second lien n'est pas renvoyé dans la minute qui suit (anti-harcèlement d'une boîte mail)."""
    u = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not u or _st(u) in ("DELETED", "BANNED"):
        return
    recent = (await db.execute(select(VerificationToken.id).where(
        VerificationToken.userId == u.id, VerificationToken.type == "MAGIC_LINK", VerificationToken.createdAt > utcnow() - MAGIC_RESEND_AFTER,
    ))).first()
    if recent:
        return
    p = (await db.execute(select(Profile.displayName).where(Profile.userId == u.id))).scalar_one_or_none()
    token = await _issue_token(db, u.id, "MAGIC_LINK", MAGIC_TTL)
    await mail.send_magic_link(u.email, p or "", token, remember)


async def login_with_magic_link(db: AsyncSession, token: str, remember: bool, ctx: ReqCtx):
    """Consomme le lien (usage unique, atomique) et ouvre une session. Lire sa boîte mail prouve aussi l'adresse e-mail."""
    t = await _valid_token(db, token, "MAGIC_LINK")
    claimed = await db.execute(update(VerificationToken).where(VerificationToken.id == t.id, VerificationToken.usedAt.is_(None)).values(usedAt=utcnow()))
    if claimed.rowcount == 0:
        await db.rollback()
        raise bad_request("INVALID_TOKEN", "Lien invalide ou expiré")
    user = await db.get(User, t.userId)
    if not user or _st(user) in ("DELETED", "BANNED"):
        await db.commit()
        raise bad_request("INVALID_TOKEN", "Lien invalide ou expiré")
    newly_verified = user.emailVerifiedAt is None
    now = utcnow()
    if newly_verified:
        user.emailVerifiedAt = now
    user.lastActiveAt = now
    await db.commit()
    if user.totpEnabledAt:  # le lien prouve la boîte e-mail, pas la possession du téléphone : le code reste demandé
        raise TwoFactorRequired(await _issue_token(db, user.id, "TWO_FACTOR", TWO_FACTOR_TTL))
    if newly_verified:
        try:
            from app.core import gift

            await gift.gift_tokens_if_eligible(db, user.id)
        except Exception:  # Silence assumé : un échec du cadeau ne doit pas empêcher la connexion (rejouable plus tard).
            await db.rollback()
    return user, await create_session(db, user.id, ctx, remember)

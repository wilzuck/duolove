"""Accès payant obligatoire (« modèle B ») : un interrupteur d'administration. Activé, un membre sans formule payante peut créer et soigner son profil,
mais ne voit personne, ne like pas et n'écrit pas tant qu'il n'a pas pris une formule (402 ACCESS_PAYWALL).

Garde-fous : le personnel (modération, administration) n'est jamais bloqué ; les membres inscrits AVANT l'activation gardent l'accès pendant un délai de grâce ;
si le paiement n'est pas opérationnel (fonction coupée, ou simulation en production), le blocage est suspendu : on ne bloque jamais quelqu'un qui ne peut pas payer."""
from __future__ import annotations

import datetime
import time
from dataclasses import dataclass

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import entitlements, flags, mail, payment_config
from app.core.config import get_settings
from app.core.ids import utcnow
from app.models.models import Payment, Profile, ProfilePhoto, SystemSetting, User

KEY = "access.config"
TTL = 30.0
DEFAULT_GRACE_DAYS = 30
DEFAULT_TRIAL_DAYS = 14
DEFAULT_WOMEN_THRESHOLD = 200
DEFAULT_DISCOUNT_MONTHS = 3
MIN_APPROVED_PHOTOS = 2  # photos validées par la modération pour la réduction « profil vérifié »
# Chemins qui restent ouverts à un membre bloqué : compte, profil à soi, paiement, notifications, parrainage, pages publiques.
ALLOWED_PREFIXES = ("/api/auth", "/api/users", "/api/profiles/me", "/api/subscriptions", "/api/checkout", "/api/payments", "/api/plans", "/api/access",
                    "/api/notifications", "/api/referral", "/api/places", "/api/installs", "/api/contact", "/api/blog")


@dataclass(frozen=True)
class Config:
    enabled: bool = False
    activated_at: datetime.datetime | None = None
    grace_days: int = DEFAULT_GRACE_DAYS          # anciens membres (inscrits avant l'activation)
    trial_days: int = DEFAULT_TRIAL_DAYS          # essai gratuit de chaque nouvel inscrit, à partir de son inscription
    verified_discount_percent: int = 0            # réduction à l'abonnement pour un profil vérifié avec photos validées (0 = aucune)
    verified_discount_months: int = DEFAULT_DISCOUNT_MONTHS  # la réduction porte sur les N premiers mois payés (0 = sans limite)
    verified_discount_cap: int = 0                # nombre maximum de membres bénéficiaires (0 = sans plafond)
    women_threshold: int = DEFAULT_WOMEN_THRESHOLD  # nombre de femmes actives et vérifiées qui déclenche l'alerte « on peut passer au payant »
    threshold_notified_at: datetime.datetime | None = None


_cache: dict = {"at": 0.0, "cfg": None}


def invalidate() -> None:
    _cache["cfg"] = None


def path_allowed(path: str) -> bool:
    return path.startswith(ALLOWED_PREFIXES)


def _parse(v: dict | None) -> Config:
    if not isinstance(v, dict):
        return Config()
    at, notified = v.get("activatedAt"), v.get("thresholdNotifiedAt")
    return Config(enabled=bool(v.get("enabled")), activated_at=datetime.datetime.fromisoformat(at) if at else None,
                  grace_days=int(v.get("graceDays", DEFAULT_GRACE_DAYS)), trial_days=int(v.get("trialDays", DEFAULT_TRIAL_DAYS)),
                  verified_discount_percent=int(v.get("verifiedDiscountPercent", 0)), verified_discount_months=int(v.get("verifiedDiscountMonths", DEFAULT_DISCOUNT_MONTHS)),
                  verified_discount_cap=int(v.get("verifiedDiscountCap", 0)), women_threshold=int(v.get("womenThreshold", DEFAULT_WOMEN_THRESHOLD)),
                  threshold_notified_at=datetime.datetime.fromisoformat(notified) if notified else None)


async def load(db: AsyncSession) -> Config:
    return _parse((await db.execute(select(SystemSetting.value).where(SystemSetting.key == KEY))).scalar_one_or_none())


async def config() -> Config:
    """Configuration relue en base au plus toutes les 30 s (et tout de suite après un enregistrement)."""
    if _cache["cfg"] is not None and time.monotonic() - _cache["at"] < TTL:
        return _cache["cfg"]
    from app.db.session import session_maker

    try:
        async with session_maker()() as db:
            cfg = await load(db)
    except Exception:  # noqa: BLE001 — base momentanément indisponible : dernière valeur connue, sinon « désactivé » (on n'enferme personne)
        return _cache["cfg"] or Config()
    _cache["cfg"], _cache["at"] = cfg, time.monotonic()
    return cfg


async def payments_ready(db: AsyncSession) -> tuple[bool, str | None]:
    """Le blocage n'a de sens que si l'on peut payer : fonction « paiements » active et, en production, un vrai fournisseur configuré."""
    if not await flags.is_on(db, "payments_enabled"):
        return False, "PAYMENTS_OFF"
    if get_settings().is_prod and (await payment_config.effective()).provider != "kkiapay":
        return False, "PROVIDER_NOT_CONFIGURED"
    return True, None


async def status(db: AsyncSession, user: User, cfg: Config | None = None) -> dict:
    """État d'accès d'un membre : `locked` (bloqué), `graceEndsAt` (fin du délai de grâce des anciens membres, s'il court encore)."""
    cfg = cfg or await config()
    out = {"required": False, "locked": False, "graceEndsAt": None}
    if not cfg.enabled or not (await payments_ready(db))[0] or user.role.value != "USER":
        return out
    out["required"] = True
    if (await entitlements.get(db, user.id))["plan"] != "FREE":
        return out  # formule payante en cours
    # Fin de l'accès offert : anciens membres = activation + délai de grâce ; nouveaux inscrits = fin de leur profil + essai gratuit.
    if cfg.activated_at and user.createdAt < cfg.activated_at:
        end = cfg.activated_at + datetime.timedelta(days=cfg.grace_days)
    else:
        # L'essai démarre quand le profil est terminé (page « Découvrir »), pas à l'inscription ; tant qu'il ne l'est pas, il n'a pas commencé.
        started = (await db.execute(select(Profile.onboardedAt).where(Profile.userId == user.id))).scalar_one_or_none()
        end = (started or utcnow()) + datetime.timedelta(days=cfg.trial_days)
    if utcnow() < end:
        out["graceEndsAt"] = end
        return out
    out["locked"] = True
    return out


def _verified_payments(*extra):
    """Paiements d'abonnement réussis qui ont bénéficié de la réduction « profil vérifiée » (remise sans code promo)."""
    return (Payment.kind == "SUBSCRIPTION", Payment.status == "SUCCEEDED", Payment.discountXof > 0, Payment.promoCodeId.is_(None), *extra)


async def verified_discount(db: AsyncSession, user_id: str, cfg: Config | None = None) -> dict:
    """Réduction « profil vérifié » : badge obtenu (selfie validé) ET au moins 2 photos approuvées par la modération. Ouverte à tous, sans condition de sexe.
    Limites réglables : N premiers mois payés par membre, et nombre maximum de bénéficiaires. Renvoie aussi ce qu'il manque, pour que l'écran le dise."""
    cfg = cfg or await config()
    pct, limit_months = cfg.verified_discount_percent, cfg.verified_discount_months
    p = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one_or_none()
    photos = (await db.execute(select(func.count()).select_from(ProfilePhoto).where(ProfilePhoto.profileId == p.id, ProfilePhoto.moderationStatus == "APPROVED"))).scalar_one() if p else 0
    verified = bool(p and p.verified)
    used = int((await db.execute(select(func.coalesce(func.sum(Payment.months), 0)).where(Payment.userId == user_id, *_verified_payments()))).scalar_one())
    remaining = None if limit_months <= 0 else max(0, limit_months - used)
    cap_reached = False
    if pct > 0 and cfg.verified_discount_cap > 0 and used == 0:  # un bénéficiaire existant garde son droit : le plafond ne vise que les nouveaux
        takers = (await db.execute(select(func.count(func.distinct(Payment.userId))).where(*_verified_payments()))).scalar_one()
        cap_reached = takers >= cfg.verified_discount_cap
    eligible = pct > 0 and verified and photos >= MIN_APPROVED_PHOTOS and remaining != 0 and not cap_reached
    return {"percent": pct, "eligible": eligible, "verified": verified, "approvedPhotos": photos, "photosNeeded": MIN_APPROVED_PHOTOS,
            "months": limit_months, "remainingMonths": remaining, "capReached": cap_reached}


async def discount_xof(db: AsyncSession, user_id: str, amount_xof: int, months: int = 1) -> int:
    """Montant de la réduction sur un achat de `months` mois : seule la part des mois encore couverts par la réduction est remisée (un forfait de 12 mois ne contourne pas la limite)."""
    d = await verified_discount(db, user_id)
    if not d["eligible"]:
        return 0
    covered = months if d["remainingMonths"] is None else min(months, d["remainingMonths"])
    return round(amount_xof * covered / max(1, months) * d["percent"] / 100)


async def women_progress(db: AsyncSession, cfg: Config | None = None) -> dict:
    """Femmes actives (connectées depuis 14 jours), au profil complet et vérifié : le chiffre du seuil, et les villes qui en comptent le plus."""
    cfg = cfg or await config()
    since = utcnow() - datetime.timedelta(days=14)
    where = (User.status == "ACTIVE", User.role == "USER", User.lastActiveAt >= since, Profile.gender == "WOMAN", Profile.verified.is_(True), Profile.onboardedAt.is_not(None))
    base = select(Profile.city, Profile.country, func.count().label("n")).join(User, User.id == Profile.userId).where(*where).group_by(Profile.city, Profile.country)
    rows = (await db.execute(base.order_by(func.count().desc()).limit(5))).all()
    total = (await db.execute(select(func.count()).select_from(Profile).join(User, User.id == Profile.userId).where(*where))).scalar_one()
    return {"count": total, "threshold": cfg.women_threshold, "reached": total >= cfg.women_threshold, "notifiedAt": cfg.threshold_notified_at,
            "cities": [{"city": r.city, "country": r.country, "count": r.n} for r in rows]}


async def check_threshold() -> bool:
    """Une seule alerte par seuil : quand le nombre de femmes actives et vérifiées atteint le seuil, prévient les administrateurs (jamais de bascule automatique)."""
    from app.db.session import session_maker

    async with session_maker()() as db:
        cfg = await load(db)
        if cfg.threshold_notified_at:
            return False
        prog = await women_progress(db, cfg)
        if not prog["reached"]:
            return False
        value = ((await db.execute(select(SystemSetting.value).where(SystemSetting.key == KEY))).scalar_one_or_none() or {})
        await db.execute(update(SystemSetting).where(SystemSetting.key == KEY).values(value={**value, "thresholdNotifiedAt": utcnow().isoformat()}))
        await db.commit()
        invalidate()
        to = list((await db.execute(select(User.email).where(User.role.in_(["ADMIN", "SUPER_ADMIN"]), User.status == "ACTIVE"))).scalars())
    for addr in to:
        await mail.send(addr, "Crushduo : le seuil de femmes est atteint",
                        f"{prog['count']} femmes actives et vérifiées (seuil : {prog['threshold']}).\n\nVous pouvez maintenant décider de passer à l'accès payant : Administration › Accès payant.\n"
                        "Rien n'est modifié automatiquement.", kind="other")
    return True


async def threshold_loop(interval: float = 3600.0) -> None:
    import asyncio

    await asyncio.sleep(120)
    while True:
        try:
            await check_threshold()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — base ou e-mail indisponible : nouvel essai à l'heure suivante
            pass
        await asyncio.sleep(interval)

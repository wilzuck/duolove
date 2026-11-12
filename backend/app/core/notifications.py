"""Notifications : création selon les préférences, rythme du membre, regroupement, poussée en temps réel, e-mail si autorisé.

Règles de bienveillance : les notifications ESSENTIELLES (sécurité, abonnement, remboursement) sont toujours livrées ; les autres respectent la pause et les
périodes de repos du membre (la ligne est conservée dans l'application, sans alerte ni e-mail), les messages d'une même conversation sont regroupés, et le
nombre d'e-mails par jour est plafonné par l'administration."""
import datetime
import hashlib
import hmac

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import appsettings, mail, push, realtime
from app.core.config import get_settings
from app.core.ids import utcnow
from app.core.rhythm import in_quiet_hours, is_paused
from app.models.models import Notification, NotificationPreference, Profile, User

PREF = {"LIKE": ("inAppLikes", "emailLikes"), "MATCH": ("inAppMatches", "emailMatches"), "MESSAGE": ("inAppMessages", "emailMessages")}
ESSENTIAL = {"SECURITY_ALERT", "SUBSCRIPTION_ACTIVATED", "SUBSCRIPTION_EXPIRING", "REFUND_UPDATE"}
EMAIL_COPY = {
    "LIKE": ("Quelqu’un vous a liké sur Crushduo", "Une personne s’intéresse à vous. Ouvrez Crushduo pour la découvrir."),
    "MATCH": ("C’est un duo sur Crushduo !", "Vous avez un nouveau duo. Dites-lui bonjour !"),
    "MESSAGE": ("Nouveau message sur Crushduo", "Vous avez reçu un nouveau message."),
}
HOUR = datetime.timedelta(hours=1)


def unsub_token(user_id: str) -> str:
    """Jeton de désabonnement des e-mails de notification : identifiant + signature (HMAC), sans état à stocker ni connexion à exiger."""
    sig = hmac.new(get_settings().ip_hash_salt.encode(), f"email-unsub:{user_id}".encode(), hashlib.sha256).hexdigest()[:32]
    return f"{user_id}.{sig}"


async def unsubscribe_emails(db: AsyncSession, token: str) -> bool:
    """Coupe tous les e-mails de notification facultatifs (likes, matchs, messages). Les e-mails de compte (code, mot de passe) ne sont pas concernés."""
    uid, _, _sig = token.partition(".")
    if not uid or not hmac.compare_digest(token, unsub_token(uid)):
        return False
    res = await db.execute(update(NotificationPreference).where(NotificationPreference.userId == uid).values(emailLikes=False, emailMatches=False, emailMessages=False, emailWeekly=False))
    await db.execute(update(User).where(User.id == uid).values(marketingConsent=False))  # coupe aussi les e-mails promotionnels de l'administration
    await db.commit()
    return res.rowcount > 0 or (await db.get(User, uid)) is not None


async def _email_allowed(db: AsyncSession, user_id: str, essential: bool, now: datetime.datetime) -> bool:
    if essential:
        return True
    cap = await appsettings.get(db, "notifications.max_emails_per_day")
    if cap <= 0:
        return False
    sent = (await db.execute(select(func.count()).select_from(Notification).where(Notification.userId == user_id, Notification.emailedAt > now - 24 * HOUR))).scalar_one()
    return sent < cap


async def create(db: AsyncSession, user_id: str, type_: str, data: dict | None = None) -> None:
    data = data or {}
    now = utcnow()
    prefs = (await db.execute(select(NotificationPreference).where(NotificationPreference.userId == user_id))).scalar_one_or_none()
    field = PREF.get(type_)
    in_app = getattr(prefs, field[0], True) if (field and prefs) else True
    email = getattr(prefs, field[1], type_ == "MATCH") if (field and prefs) else (type_ == "MATCH" if field else False)
    essential = type_ in ESSENTIAL
    profile = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one_or_none()
    # Pause ou période de repos : la notification est conservée dans l'application, mais sans alerte en direct ni e-mail.
    silent = not essential and (bool(profile and is_paused(profile, now)) or in_quiet_hours(prefs, now))
    n: Notification | None = None
    if in_app:
        if type_ == "MESSAGE" and data.get("conversationId"):  # regroupement : une seule ligne non lue par conversation
            n = (await db.execute(select(Notification).where(
                Notification.userId == user_id, Notification.type == "MESSAGE", Notification.readAt.is_(None),
                Notification.data["conversationId"].astext == str(data["conversationId"])).order_by(Notification.createdAt.desc()).limit(1))).scalar_one_or_none()
            if n:
                n.data = {**n.data, **data, "count": int(n.data.get("count", 1)) + 1}
                n.createdAt = now
        if n is None:
            n = Notification(userId=user_id, type=type_, data={**data, "count": 1} if type_ == "MESSAGE" else data)
            db.add(n)
        await db.commit()
        if not silent:
            await realtime.emit_to_user(user_id, "notification:new", {"id": n.id, "type": type_, "createdAt": n.createdAt.isoformat() + "Z", "data": {} if type_ == "LIKE" else n.data})
    # Notification push sur les appareils abonnés : pas pendant la pause / le repos (sauf alertes essentielles), pas si le membre est déjà dans l'application,
    # pas si ses réglages coupent ce type. Jamais bloquant.
    if (in_app or essential) and (essential or not silent) and (essential or user_id not in set(realtime.online_ids())):
        try:
            await push.notify(db, user_id, type_, data)
        except Exception:  # noqa: BLE001
            pass
    copy = EMAIL_COPY.get(type_)
    if email and copy and not silent and await _email_allowed(db, user_id, essential, now):
        if n is not None and n.emailedAt and now - n.emailedAt < HOUR:
            return  # un seul e-mail par heure et par conversation
        u = (await db.execute(select(User.email).where(User.id == user_id))).scalar_one_or_none()
        if u:
            base = get_settings().app_url.rstrip("/")
            unsub = None if essential else f"{base}/notifications-unsubscribe?token={unsub_token(user_id)}"
            text = f"{copy[1]}\n\n{base}" + (f"\n\nNe plus recevoir ces e-mails : {unsub}" if unsub else "")
            # Libère la connexion de la requête AVANT l'envoi : le journal et la liste de blocage d'e-mail ouvrent leur propre session. Sans cela,
            # quand toutes les connexions du pool sont tenues par des requêtes qui en attendent une deuxième, plus rien n'avance (blocage jusqu'au délai du pool).
            await db.commit()
            await mail.send(u, copy[0], text, mail.notification_html(copy[0], copy[1], unsub), kind="notification",
                            headers={"List-Unsubscribe": f"<{unsub}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"} if unsub else None)
            if n is not None:
                n.emailedAt = now
                await db.commit()

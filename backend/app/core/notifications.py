"""Notifications : création selon les préférences, poussée en temps réel, e-mail si demandé."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import mail, realtime
from app.core.config import get_settings
from app.models.models import Notification, NotificationPreference, User

PREF = {"LIKE": ("inAppLikes", "emailLikes"), "MATCH": ("inAppMatches", "emailMatches"), "MESSAGE": ("inAppMessages", "emailMessages")}
EMAIL_COPY = {
    "LIKE": ("Quelqu’un vous a liké sur DuoMatch", "Une personne s’intéresse à vous. Ouvrez DuoMatch pour la découvrir."),
    "MATCH": ("C’est un match sur DuoMatch !", "Vous avez un nouveau match. Dites-lui bonjour !"),
    "MESSAGE": ("Nouveau message sur DuoMatch", "Vous avez reçu un nouveau message."),
}


async def create(db: AsyncSession, user_id: str, type_: str, data: dict | None = None) -> None:
    data = data or {}
    prefs = (await db.execute(select(NotificationPreference).where(NotificationPreference.userId == user_id))).scalar_one_or_none()
    field = PREF.get(type_)
    in_app = getattr(prefs, field[0], True) if (field and prefs) else True
    email = getattr(prefs, field[1], type_ == "MATCH") if (field and prefs) else (type_ == "MATCH" if field else False)
    if in_app:
        n = Notification(userId=user_id, type=type_, data=data)
        db.add(n)
        await db.commit()
        await realtime.emit_to_user(user_id, "notification:new", {"id": n.id, "type": type_, "createdAt": n.createdAt.isoformat() + "Z", "data": {} if type_ == "LIKE" else data})
    copy = EMAIL_COPY.get(type_)
    if email and copy:
        u = (await db.execute(select(User.email).where(User.id == user_id))).scalar_one_or_none()
        if u:
            await mail.send(u, copy[0], f"{copy[1]}\n\n{get_settings().app_url}")

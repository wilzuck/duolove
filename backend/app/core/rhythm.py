"""Rythme et bien-être : mode pause, périodes de repos, conseils de profil. Aucune pression : tout est facultatif, réversible et réglable par l'administration
(`pause.max_days`, `notifications.max_emails_per_day`, flags `pause_mode` et `profile_tips`)."""
import datetime
import re

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import appsettings, flags
from app.core.errors import AppError, bad_request
from app.core.ids import utcnow
from app.core.jsonfmt import iso
from app.models.models import Interest, NotificationPreference, Profile, ProfilePhoto, ProfilePromptAnswer, t_UserInterest

HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def paused_expr(now: datetime.datetime):
    """Condition SQL « profil en pause » : une pause sans fin explicite n'existe pas (elle est plafonnée à `pause.max_days`)."""
    return and_(Profile.pausedAt.is_not(None), or_(Profile.pauseEndsAt.is_(None), Profile.pauseEndsAt > now))


def is_paused(p: Profile, now: datetime.datetime | None = None) -> bool:
    now = now or utcnow()
    return p.pausedAt is not None and (p.pauseEndsAt is None or p.pauseEndsAt > now)


def to_minutes(v: str | None) -> int | None:
    if v is None:
        return None
    m = HHMM.match(v)
    if not m:
        raise bad_request("INVALID_TIME", "Heure attendue au format HH:MM")
    return int(m.group(1)) * 60 + int(m.group(2))


def from_minutes(v: int | None) -> str | None:
    return None if v is None else f"{v // 60:02d}:{v % 60:02d}"


def in_quiet_hours(prefs: NotificationPreference | None, now: datetime.datetime | None = None) -> bool:
    """Période de repos choisie par le membre (heure locale = UTC + décalage), éventuellement à cheval sur minuit."""
    if not prefs or prefs.quietStart is None or prefs.quietEnd is None or prefs.quietStart == prefs.quietEnd:
        return False
    now = now or utcnow()
    local = (now.hour * 60 + now.minute + prefs.tzOffsetMinutes) % 1440
    s, e = prefs.quietStart, prefs.quietEnd
    return s <= local < e if s < e else (local >= s or local < e)


async def _prefs(db: AsyncSession, user_id: str) -> NotificationPreference:
    p = (await db.execute(select(NotificationPreference).where(NotificationPreference.userId == user_id))).scalar_one_or_none()
    if not p:
        p = NotificationPreference(userId=user_id)
        db.add(p)
        await db.flush()
    return p


async def get(db: AsyncSession, user_id: str) -> dict:
    profile = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one()
    prefs = await _prefs(db, user_id)
    cfg = await appsettings.all_values(db)
    now = utcnow()
    return {
        "pause": {"active": is_paused(profile, now), "endsAt": iso(profile.pauseEndsAt) if is_paused(profile, now) else None, "maxDays": cfg["pause.max_days"], "enabled": await flags.is_on(db, "pause_mode")},
        "quiet": {"start": from_minutes(prefs.quietStart), "end": from_minutes(prefs.quietEnd), "tzOffsetMinutes": prefs.tzOffsetMinutes, "activeNow": in_quiet_hours(prefs, now)},
        "dateReminders": prefs.dateReminders,
        "limits": {"maxEmailsPerDay": cfg["notifications.max_emails_per_day"]},
    }


async def start_pause(db: AsyncSession, user_id: str, days: int | None) -> dict:
    await flags.assert_on(db, "pause_mode")
    cap = await appsettings.get(db, "pause.max_days")
    days = cap if days is None else days
    if not 1 <= days <= cap:
        raise bad_request("INVALID_PAUSE", f"La pause dure de 1 à {cap} jours", {"max": cap})
    profile = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one()
    now = utcnow()
    profile.pausedAt, profile.pauseEndsAt = now, now + datetime.timedelta(days=days)
    await db.commit()
    return await get(db, user_id)


async def resume(db: AsyncSession, user_id: str) -> dict:
    """Toujours possible, même si la fonction est coupée : on ne garde jamais un membre en pause malgré lui."""
    profile = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one()
    profile.pausedAt = profile.pauseEndsAt = None
    await db.commit()
    return await get(db, user_id)


async def set_prefs(db: AsyncSession, user_id: str, data: dict) -> dict:
    prefs = await _prefs(db, user_id)
    if "quietStart" in data or "quietEnd" in data:
        start, end = to_minutes(data.get("quietStart")), to_minutes(data.get("quietEnd"))
        if (start is None) != (end is None):
            raise bad_request("INVALID_QUIET", "Indiquez le début et la fin de la période de repos, ou aucune des deux")
        prefs.quietStart, prefs.quietEnd = start, end
    if data.get("tzOffsetMinutes") is not None:
        prefs.tzOffsetMinutes = data["tzOffsetMinutes"]
    if data.get("dateReminders") is not None:
        prefs.dateReminders = data["dateReminders"]
    await db.commit()
    return await get(db, user_id)


async def assert_not_paused(db: AsyncSession, user_id: str) -> None:
    """Un membre en pause ne likes ni ne lance de recherche : il doit d'abord reprendre (un geste, sans condition)."""
    profile = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one_or_none()
    if profile and is_paused(profile):
        raise AppError(409, "PAUSED", "Mode pause actif : reprenez pour continuer")


async def tips(db: AsyncSession, user_id: str) -> dict:
    """Conseils concrets déduits de l'état réel du profil (jamais de reproche, jamais d'invention) ; au plus quatre, les plus utiles d'abord."""
    await flags.assert_on(db, "profile_tips")
    p = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one()
    photos = len((await db.execute(select(ProfilePhoto.id).where(ProfilePhoto.profileId == p.id, ProfilePhoto.moderationStatus != "REJECTED"))).all())
    interests = len((await db.execute(select(Interest.id).join(t_UserInterest, t_UserInterest.c.interestId == Interest.id).where(t_UserInterest.c.userId == user_id))).all())
    answers = len((await db.execute(select(ProfilePromptAnswer.id).where(ProfilePromptAnswer.userId == user_id))).all())
    out: list[dict] = []
    if photos < 3:
        out.append({"code": "photos", "have": photos, "target": 3, "anchor": "photos"})
    if len((p.bio or "").strip()) < 80:
        out.append({"code": "bio", "anchor": "about"})
    if answers == 0 and await flags.is_on(db, "profile_prompts"):
        out.append({"code": "prompts", "anchor": "prompts"})
    if interests < 4:
        out.append({"code": "interests", "have": interests, "target": 4, "anchor": "interests"})
    if not p.verified:
        out.append({"code": "verify", "anchor": "verification"})
    return {"items": out[:4], "completeness": p.completeness}

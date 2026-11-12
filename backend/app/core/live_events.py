"""Soirées Match en direct : créneaux annoncés par l'administration, inscription des membres, rappels (1 h avant, puis au début).

Une soirée ne change pas le fonctionnement du Match : elle donne rendez-vous à tout le monde en même temps pour que les recherches aboutissent.
Les rappels (notification + e-mail) ne partent qu'aux membres inscrits ; chaque étape n'est envoyée qu'une fois, même avec plusieurs répliques de l'API."""
from __future__ import annotations

import asyncio
import datetime
import logging

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import mail, notifications, realtime
from app.core.errors import AppError, not_found
from app.core.ids import utcnow
from app.models.models import LiveEvent, LiveEventRsvp, Profile, User

log = logging.getLogger(__name__)
HOUR = datetime.timedelta(hours=1)
REMINDER_LEAD = HOUR  # le rappel part une heure avant le début
MAX_DURATION = datetime.timedelta(hours=8)
MAX_AHEAD = datetime.timedelta(days=120)


def iso(d: datetime.datetime | None) -> str | None:
    return d.isoformat(timespec="milliseconds") + "Z" if d else None


def phase(e: LiveEvent, now: datetime.datetime) -> str:
    return "live" if e.startsAt <= now < e.endsAt else "upcoming"


async def _counts(db: AsyncSession, ids: list[str]) -> dict[str, int]:
    if not ids:
        return {}
    rows = (await db.execute(select(LiveEventRsvp.eventId, func.count()).where(LiveEventRsvp.eventId.in_(ids)).group_by(LiveEventRsvp.eventId))).all()
    return {r[0]: r[1] for r in rows}


def view(e: LiveEvent, now: datetime.datetime, rsvps: int, mine: bool) -> dict:
    return {"id": e.id, "title": e.title, "description": e.description, "city": e.city, "startsAt": iso(e.startsAt), "endsAt": iso(e.endsAt), "phase": phase(e, now),
            "rsvps": rsvps, "rsvped": mine}


async def upcoming(db: AsyncSession, user_id: str, limit: int = 3) -> dict:
    """Soirées à venir ou en cours (les plus proches d'abord), avec l'inscription du membre et le nombre de personnes connectées en ce moment."""
    now = utcnow()
    rows = (await db.execute(select(LiveEvent).where(LiveEvent.status == "ACTIVE", LiveEvent.endsAt > now).order_by(LiveEvent.startsAt).limit(limit))).scalars().all()
    ids = [e.id for e in rows]
    counts = await _counts(db, ids)
    mine = set((await db.execute(select(LiveEventRsvp.eventId).where(LiveEventRsvp.userId == user_id, LiveEventRsvp.eventId.in_(ids)))).scalars().all()) if ids else set()
    return {"events": [view(e, now, counts.get(e.id, 0), e.id in mine) for e in rows], "onlineNow": len(realtime.online_ids())}


async def _open_event(db: AsyncSession, event_id: str) -> LiveEvent:
    e = await db.get(LiveEvent, event_id)
    if not e or e.status != "ACTIVE":
        raise not_found("Soirée introuvable")
    if e.endsAt <= utcnow():
        raise AppError(409, "EVENT_ENDED", "Cette soirée est terminée")
    return e


async def rsvp(db: AsyncSession, user_id: str, event_id: str) -> dict:
    await _open_event(db, event_id)
    await db.execute(pg_insert(LiveEventRsvp).values(eventId=event_id, userId=user_id).on_conflict_do_nothing())
    await db.commit()
    return {"rsvped": True}


async def unrsvp(db: AsyncSession, user_id: str, event_id: str) -> dict:
    from sqlalchemy import delete

    await db.execute(delete(LiveEventRsvp).where(LiveEventRsvp.eventId == event_id, LiveEventRsvp.userId == user_id))
    await db.commit()
    return {"rsvped": False}


async def _notify(db: AsyncSession, e: LiveEvent, stage: str) -> int:
    users = (await db.execute(select(User.id, User.email).join(LiveEventRsvp, LiveEventRsvp.userId == User.id)
                              .where(LiveEventRsvp.eventId == e.id, User.status == "ACTIVE", User.emailVerifiedAt.is_not(None)))).all()
    for uid, email in users:
        try:
            await notifications.create(db, uid, "LIVE_EVENT", {"eventId": e.id, "stage": stage, "title": e.title, "startsAt": iso(e.startsAt)})
            if stage == "reminder":
                name = (await db.execute(select(Profile.displayName).where(Profile.userId == uid))).scalar_one_or_none() or ""
                await mail.send_live_event_reminder(email, name, e.title, e.startsAt, e.tzOffset, e.city)
        except Exception:  # noqa: BLE001 — un envoi raté ne doit pas empêcher les autres
            log.exception("Rappel de soirée %s pour %s", e.id, uid)
    return len(users)


async def run_due(db: AsyncSession, now: datetime.datetime | None = None) -> dict:
    """Envoie ce qui est dû : rappel une heure avant, notification au début. Chaque étape est « réclamée » par un UPDATE conditionnel (jamais deux fois)."""
    now = now or utcnow()
    out = {"reminded": 0, "started": 0}
    due = (await db.execute(select(LiveEvent).where(LiveEvent.status == "ACTIVE", LiveEvent.endsAt > now, LiveEvent.startsAt <= now + REMINDER_LEAD))).scalars().all()
    for e in due:
        started = e.startsAt <= now
        if started:
            claimed = (await db.execute(update(LiveEvent).where(LiveEvent.id == e.id, LiveEvent.startedAt.is_(None)).values(startedAt=now, remindedAt=func.coalesce(LiveEvent.remindedAt, now)))).rowcount
            await db.commit()
            if claimed:
                out["started"] += await _notify(db, e, "start")
        else:
            claimed = (await db.execute(update(LiveEvent).where(LiveEvent.id == e.id, LiveEvent.remindedAt.is_(None)).values(remindedAt=now))).rowcount
            await db.commit()
            if claimed:
                out["reminded"] += await _notify(db, e, "reminder")
    return out


async def sweep_loop(maker, every: float = 60.0) -> None:
    while True:
        try:
            async with maker() as db:
                await run_due(db)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("Balayage des soirées Match en direct")
        await asyncio.sleep(every)

"""Soirées Match en direct : création, liste (avec inscrits), annulation par l'administration."""
from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, audit
from app.core import live_events as le
from app.core.errors import bad_request, not_found
from app.core.ids import utcnow
from app.core.ratelimit import limit
from app.db.session import get_db
from app.models.models import LiveEvent

router = APIRouter(prefix="/admin/live-events", tags=["admin"])


class EventIn(BaseModel):
    title: str = Field(min_length=3, max_length=100)
    description: str = Field("", max_length=500)
    city: str | None = Field(None, max_length=80)
    startsAt: datetime.datetime  # UTC
    durationMinutes: int = Field(120, ge=30, le=480)
    tzOffset: int = Field(60, ge=-720, le=840)


async def _row(db: AsyncSession, e: LiveEvent, now: datetime.datetime) -> dict:
    counts = await le._counts(db, [e.id])
    base = le.view(e, now, counts.get(e.id, 0), False)
    base.pop("rsvped", None)
    base.update(status=e.status, tzOffset=e.tzOffset, remindedAt=le.iso(e.remindedAt), startedAt=le.iso(e.startedAt))
    if e.status != "ACTIVE":
        base["phase"] = "canceled"
    elif e.endsAt <= now:
        base["phase"] = "ended"
    return base


@router.get("")
async def list_events(_: object = ADM, db: AsyncSession = Depends(get_db)):
    now = utcnow()
    rows = (await db.execute(select(LiveEvent).order_by(LiveEvent.startsAt.desc()).limit(50))).scalars().all()
    return {"items": [await _row(db, e, now) for e in rows]}


@router.post("", status_code=201, dependencies=[limit(20, 3600)])
async def create(body: EventIn, a=ADM, db: AsyncSession = Depends(get_db)):
    now = utcnow()
    at = body.startsAt.replace(tzinfo=None) if body.startsAt.tzinfo is None else body.startsAt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    if at < now + datetime.timedelta(minutes=5) or at > now + le.MAX_AHEAD:
        raise bad_request("INVALID_SCHEDULE", "Choisissez un début futur (dans les 120 jours)")
    e = LiveEvent(title=body.title.strip(), description=body.description.strip(), city=(body.city or "").strip() or None, startsAt=at,
                  endsAt=at + datetime.timedelta(minutes=body.durationMinutes), tzOffset=body.tzOffset, createdById=a.id)
    db.add(e)
    await db.commit()
    await audit(db, a.id, "live_event.create", "LiveEvent", e.id, {"startsAt": le.iso(at), "minutes": body.durationMinutes})
    return await _row(db, e, now)


@router.post("/{event_id}/cancel")
async def cancel(event_id: str, a=ADM, db: AsyncSession = Depends(get_db)):
    e = await db.get(LiveEvent, event_id)
    if not e:
        raise not_found("Soirée introuvable")
    e.status = "CANCELED"
    await db.commit()
    await audit(db, a.id, "live_event.cancel", "LiveEvent", e.id)
    return await _row(db, e, utcnow())

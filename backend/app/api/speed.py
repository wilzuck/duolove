"""Speed dating en texte : sessions (admin), inscription, salle, messages, décisions privées."""
import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, audit
from app.core import appsettings, speedsvc
from app.core.auth import AuthUser, verified_user
from app.core.errors import bad_request, conflict, not_found
from app.core.ids import utcnow
from app.core.ratelimit import limit
from app.db.session import get_db
from app.models.models import SpeedEvent, SpeedPair, SpeedRegistration
from app.schemas.speed import DecisionIn, EventIn, EventPatch, MessageIn

router = APIRouter(tags=["speed"])
U = Depends(verified_user)


# ───────── membres ─────────
@router.get("/speed-events")
async def list_events(u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return {"items": await speedsvc.list_events(db, u.id)}


@router.get("/speed-events/{event_id}")
async def room(event_id: str, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await speedsvc.detail(db, u.id, event_id)


@router.post("/speed-events/{event_id}/register", status_code=201, dependencies=[limit(20, 60)])
async def register(event_id: str, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await speedsvc.register(db, u.id, event_id)


@router.delete("/speed-events/{event_id}/register")
async def unregister(event_id: str, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await speedsvc.unregister(db, u.id, event_id)


@router.post("/speed-events/{event_id}/messages", status_code=201, dependencies=[limit(40, 60)])
async def message(event_id: str, body: MessageIn, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await speedsvc.send_message(db, u.id, event_id, body.body)


@router.post("/speed-events/{event_id}/decisions", dependencies=[limit(60, 60)])
async def decision(event_id: str, body: DecisionIn, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await speedsvc.decide(db, u.id, event_id, body.pairId, body.decision)


# ───────── administration ─────────
async def _admin_row(db: AsyncSession, ev: SpeedEvent) -> dict:
    cfg = await appsettings.all_values(db)
    regs = (await speedsvc._counts(db, [ev.id])).get(ev.id, 0)
    d = speedsvc._event_dict(ev, speedsvc.phase(ev, cfg, utcnow()), regs, None)
    pairs = (await db.execute(select(func.count()).select_from(SpeedPair).where(SpeedPair.eventId == ev.id))).scalar_one()
    mutual = (await db.execute(select(func.count()).select_from(SpeedPair).where(SpeedPair.eventId == ev.id, SpeedPair.decisionA == "INTEREST", SpeedPair.decisionB == "INTEREST"))).scalar_one()
    return {**d, "pairs": pairs, "mutualInterests": mutual}


@router.get("/admin/speed-events")
async def admin_list(_: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    evs = (await db.execute(select(SpeedEvent).order_by(SpeedEvent.startsAt.desc()).limit(100))).scalars().all()
    evs = [await speedsvc.advance(db, e) for e in evs]
    return {"items": [await _admin_row(db, e) for e in evs], "stats": await speedsvc.stats(db)}


@router.post("/admin/speed-events", status_code=201)
async def admin_create(body: EventIn, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    if body.startsAt < utcnow() + datetime.timedelta(minutes=5):
        raise bad_request("TOO_SOON", "Prévoyez au moins 5 minutes avant le début.")
    ev = SpeedEvent(**body.model_dump(), createdById=a.id)
    db.add(ev)
    await db.commit()
    await audit(db, a.id, "speed.create", "SpeedEvent", ev.id, {"title": ev.title, "startsAt": ev.startsAt.isoformat()})
    return await _admin_row(db, ev)


@router.patch("/admin/speed-events/{event_id}")
async def admin_patch(event_id: str, body: EventPatch, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    ev = (await db.execute(select(SpeedEvent).where(SpeedEvent.id == event_id).with_for_update())).scalar_one_or_none()
    if not ev:
        raise not_found("SPEED_EVENT_NOT_FOUND")
    if ev.status != "SCHEDULED" or utcnow() >= ev.startsAt:
        raise conflict("EVENT_STARTED", "Une session commencée ne se modifie plus.")
    data = body.model_dump(exclude_none=True)
    if "capacity" in data:
        regs = (await speedsvc._counts(db, [ev.id])).get(ev.id, 0)
        if data["capacity"] < regs:
            raise conflict("CAPACITY_BELOW_REGISTERED", "Il y a déjà plus d'inscrits que cette capacité.")
    for k, v in data.items():
        setattr(ev, k, v)
    await db.commit()
    await audit(db, a.id, "speed.update", "SpeedEvent", ev.id, data)
    return await _admin_row(db, ev)


@router.post("/admin/speed-events/{event_id}/cancel")
async def admin_cancel(event_id: str, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    ev = (await db.execute(select(SpeedEvent).where(SpeedEvent.id == event_id).with_for_update())).scalar_one_or_none()
    if not ev:
        raise not_found("SPEED_EVENT_NOT_FOUND")
    if ev.status in ("CLOSED", "CANCELED"):
        raise conflict("EVENT_FINISHED", "Cette session est déjà terminée.")
    ev.status, ev.cancelReason = "CANCELED", "ADMIN"
    await db.commit()
    await audit(db, a.id, "speed.cancel", "SpeedEvent", ev.id)
    return await _admin_row(db, ev)

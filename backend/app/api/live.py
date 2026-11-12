"""Menu « Match » : recherche en direct, invitations, ouverture de conversation avec jetons (flag live_match)."""
from typing import Any

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import live_events
from app.core import live_service as live
from app.core import realtime
from app.core.auth import AuthUser, verified_user
from app.core.flags import require_flag
from app.core.ratelimit import limit
from app.db.session import get_db

router = APIRouter(prefix="/live", tags=["live"], dependencies=[require_flag("live_match")])
# Branche le menu Match sur la connexion temps réel (sans dépendance circulaire).
realtime.on_presence = live.on_presence


class OptIn(BaseModel):
    enabled: bool


@router.get("/events")
async def events(u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    """Soirées Duo à venir ou en cours, avec mon inscription."""
    return await live_events.upcoming(db, u.id)


@router.put("/events/{event_id}/rsvp", dependencies=[limit(30)])
async def event_rsvp(event_id: str, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await live_events.rsvp(db, u.id, event_id)


@router.delete("/events/{event_id}/rsvp", dependencies=[limit(30)])
async def event_unrsvp(event_id: str, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await live_events.unrsvp(db, u.id, event_id)


@router.get("/state")
async def state(u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await live.state(db, u.id)


# Les critères sont validés par le service avec le schéma partagé (messages d'erreur homogènes).
@router.post("/searches", dependencies=[limit(10)])
async def start(body: Any = Body(None), u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await live.start(db, u.id, body)


@router.delete("/searches/active")
async def cancel(u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await live.cancel(db, u.id)


@router.get("/invites")
async def incoming(u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await live.incoming(db, u.id)


@router.post("/invites/{invite_id}/accept", dependencies=[limit(30)])
async def accept(invite_id: str, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await live.respond(db, u.id, invite_id, True)


@router.post("/invites/{invite_id}/decline", dependencies=[limit(30)])
async def decline(invite_id: str, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await live.respond(db, u.id, invite_id, False)


@router.post("/invites/{invite_id}/choose", dependencies=[limit(20)])
async def choose(invite_id: str, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await live.choose(db, u.id, invite_id)


@router.post("/invites/{invite_id}/like", dependencies=[limit(30)])
async def like(invite_id: str, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await live.react(db, u.id, invite_id, "LIKE")


@router.post("/invites/{invite_id}/pass", dependencies=[limit(30)])
async def pass_(invite_id: str, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await live.react(db, u.id, invite_id, "PASS")


@router.put("/opt-in")
async def opt_in(body: OptIn, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await live.set_opt_in(db, u.id, body.enabled)

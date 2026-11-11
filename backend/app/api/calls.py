"""Appels audio/vidéo : lancer, répondre, raccrocher, jeton d'accès à la salle."""
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import callsvc, entitlements
from app.core.auth import AuthUser, verified_user
from app.core.errors import forbidden
from app.core.ratelimit import limit
from app.db.session import get_db

router = APIRouter(tags=["calls"])
U = Depends(verified_user)


class CallIn(BaseModel):
    kind: str


@router.post("/conversations/{conversation_id}/calls", status_code=201, dependencies=[limit(10, 60)])
async def start(conversation_id: str, body: CallIn, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    # Lancer un appel est réservé aux formules qui l'incluent ; répondre à un appel reste possible pour tous.
    if not (await entitlements.get(db, u.id))["limits"]["calls"]:
        raise forbidden("PLAN_REQUIRED", "Les appels sont réservés aux abonnés Premium et VIP")
    return await callsvc.start(db, u.id, conversation_id, body.kind)


@router.get("/calls/current")
async def current(u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return {"call": await callsvc.current(db, u.id)}


@router.post("/calls/{call_id}/accept")
async def accept(call_id: str, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await callsvc.accept(db, u.id, call_id)


@router.post("/calls/{call_id}/decline")
async def decline(call_id: str, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await callsvc.decline(db, u.id, call_id)


@router.post("/calls/{call_id}/cancel")
async def cancel(call_id: str, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await callsvc.cancel(db, u.id, call_id)


@router.post("/calls/{call_id}/end")
async def end(call_id: str, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await callsvc.end(db, u.id, call_id)


@router.get("/calls/{call_id}/token", dependencies=[limit(30, 60)])
async def token(call_id: str, response: Response, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return await callsvc.token(db, u.id, call_id)

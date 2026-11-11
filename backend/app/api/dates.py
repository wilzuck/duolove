"""Rendez-vous : proposer, répondre, reporter, annuler, terminer, rappels, retour facultatif, partage volontaire avec un proche."""
from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import datesvc, entitlements
from app.core.errors import forbidden
from app.core.ratelimit import limit
from app.core.auth import AuthUser, verified_user
from app.db.session import get_db
from app.schemas.dates import DateIn, FeedbackIn, ReminderIn

router = APIRouter(tags=["dates"])
U = Depends(verified_user)


@router.get("/dates/shared/{token}", dependencies=[limit(30, 60, scope="dates-shared")])
async def shared(token: str, response: Response, db: AsyncSession = Depends(get_db)):
    """Page publique d'un partage volontaire (sans compte) : jamais indexée, jamais mise en cache."""
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return await datesvc.shared_view(db, token)


@router.get("/conversations/{conversation_id}/dates")
async def list_dates(conversation_id: str, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await datesvc.list_for(db, u.id, conversation_id)


@router.post("/conversations/{conversation_id}/dates", status_code=201)
async def propose(conversation_id: str, body: DateIn, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    # Proposer un rendez-vous est réservé aux formules qui l'incluent ; répondre à une proposition reste possible pour tous.
    if not (await entitlements.get(db, u.id))["limits"]["dates"]:
        raise forbidden("PLAN_REQUIRED", "Les rendez-vous sont réservés aux abonnés Premium et VIP")
    return await datesvc.propose(db, u.id, conversation_id, body.model_dump())


@router.post("/dates/{date_id}/accept")
async def accept(date_id: str, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await datesvc.respond(db, u.id, date_id, True)


@router.post("/dates/{date_id}/decline")
async def decline(date_id: str, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await datesvc.respond(db, u.id, date_id, False)


@router.post("/dates/{date_id}/reschedule", status_code=201)
async def reschedule(date_id: str, body: DateIn, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await datesvc.reschedule(db, u.id, date_id, body.model_dump())


@router.post("/dates/{date_id}/cancel")
async def cancel(date_id: str, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await datesvc.cancel(db, u.id, date_id)


@router.post("/dates/{date_id}/complete")
async def complete(date_id: str, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await datesvc.complete(db, u.id, date_id)


@router.put("/dates/{date_id}/feedback")
async def feedback(date_id: str, body: FeedbackIn, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await datesvc.feedback(db, u.id, date_id, body.rating)


@router.put("/dates/{date_id}/reminder")
async def reminder(date_id: str, body: ReminderIn, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await datesvc.set_reminder(db, u.id, date_id, body.minutesBefore)


@router.post("/dates/{date_id}/share", status_code=201)
async def share(date_id: str, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await datesvc.create_share(db, u.id, date_id)


@router.delete("/dates/{date_id}/share")
async def unshare(date_id: str, u: AuthUser = U, db: AsyncSession = Depends(get_db)):
    return await datesvc.revoke_share(db, u.id, date_id)

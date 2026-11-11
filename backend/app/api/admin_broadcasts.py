"""Envois de l'administration (e-mail et annonces dans l'application) : public ciblé, aperçu, test, planification, annulation, suivi."""
from __future__ import annotations

import asyncio
import datetime
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, after_cursor, audit, iso, page, paged
from app.core import broadcastsvc as bc
from app.core import mail
from app.core.auth import AuthUser
from app.core.errors import AppError, bad_request, not_found
from app.core.ids import utcnow
from app.core.ratelimit import limit
from app.db.session import get_db
from app.models.models import Broadcast, Profile, User

router = APIRouter(prefix="/admin/broadcasts", tags=["admin"])
MAX_AHEAD = datetime.timedelta(days=90)


class Content(BaseModel):
    subject: str = Field(min_length=1, max_length=150)
    body: str = Field(min_length=1, max_length=20000)
    signature: str = Field("", max_length=300)


class Target(BaseModel):
    audienceMode: Literal["ALL", "EXCEPT", "SPECIFIC", "PROFILE", "FREE"] = "ALL"
    audience: dict = {}
    channel: Literal["EMAIL", "APP", "BOTH"] = "EMAIL"
    kind: Literal["SERVICE", "MARKETING"] = "MARKETING"


class AudienceIn(Target):
    pass


class PreviewIn(Content):
    pass


class BroadcastIn(Content, Target):
    when: Literal["now", "later"] = "now"
    scheduledAt: datetime.datetime | None = None  # UTC
    expectedRecipients: int | None = None  # garde-fou : le nombre vu à l'écran ; refusé si le public a changé entre-temps


def _row(b: Broadcast, detail: bool = False) -> dict:
    out = {"id": b.id, "subject": b.subject, "status": b.status, "channel": b.channel, "kind": b.kind, "audienceMode": b.audienceMode, "scheduledAt": iso(b.scheduledAt),
           "sentAt": iso(b.sentAt), "recipients": b.recipients, "sent": b.sent, "failed": b.failed, "error": b.error, "createdAt": iso(b.createdAt)}
    if detail:
        out.update(body=b.body, signature=b.signature, audience=b.audience)
    return out


@router.get("")
async def list_broadcasts(cursor: str | None = None, limit: str | None = None, _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    take = page(limit)
    stmt = await after_cursor(db, select(Broadcast).order_by(Broadcast.createdAt.desc(), Broadcast.id.desc()), Broadcast, cursor)
    rows = (await db.execute(stmt.limit(take + 1))).scalars().all()
    return paged(rows, take, [_row(b) for b in rows[:take]])


@router.get("/members")
async def find_members(q: str = "", _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Recherche de membres (nom ou adresse) pour le public « personnes choisies »."""
    q = q.strip()
    if len(q) < 2:
        return {"items": []}
    like = f"%{q.replace('%', '').replace('_', '')}%"
    rows = (await db.execute(select(User.id, User.email, Profile.displayName).join(Profile, Profile.userId == User.id, isouter=True)
                             .where(User.status == "ACTIVE", or_(User.email.ilike(like), Profile.displayName.ilike(like))).order_by(User.email).limit(10))).all()
    return {"items": [{"id": r.id, "email": r.email, "name": r.displayName or ""} for r in rows]}


@router.post("/audience")
async def count_audience(body: AudienceIn, _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Nombre de destinataires réels (après consentement et adresses bloquées) et quelques exemples."""
    params = bc.clean_audience(body.audienceMode, body.audience)
    people = await bc.audience(db, body.audienceMode, params, body.kind)
    if body.channel == "APP":
        people = [r for r in people if r.user_id]  # une annonce dans l'application ne touche que des membres
    return {"count": len(people), "sample": [{"email": r.email, "name": r.name} for r in people[:5]]}


@router.post("/preview")
async def preview(body: PreviewIn, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Rendu exact de l'e-mail, avec des valeurs d'exemple pour les variables."""
    profile = (await db.execute(select(Profile.displayName, Profile.city).where(Profile.userId == a.id))).first()
    me = bc.Recipient(a.email, (profile.displayName if profile else "") or "Camille", (profile.city if profile else "") or "Cotonou", a.id)
    subject, html, _text, _h = bc.render(body.model_dump(), me)
    return {"subject": subject, "html": html}


@router.post("/test", dependencies=[limit(20, 3600)])
async def send_test(body: PreviewIn, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Envoie l'e-mail à l'administrateur qui le demande, pour relire le rendu réel avant la diffusion."""
    profile = (await db.execute(select(Profile.displayName, Profile.city).where(Profile.userId == a.id))).first()
    me = bc.Recipient(a.email, (profile.displayName if profile else "") or "Camille", (profile.city if profile else "") or "Cotonou", a.id)
    subject, html, text, headers = bc.render(body.model_dump(), me)
    ok = await mail.send(a.email, f"[Test] {subject}", text, html, kind="broadcast_test", headers=headers or None)
    return {"ok": ok, "to": a.email}


@router.post("", status_code=201, dependencies=[limit(10, 3600)])
async def create(body: BroadcastIn, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Planifie ou lance un envoi. Le public est recalculé au moment de l'envoi ; ici on vérifie qu'il existe et qu'il correspond au nombre affiché."""
    params = bc.clean_audience(body.audienceMode, body.audience)
    people = await bc.audience(db, body.audienceMode, params, body.kind)
    if body.channel == "APP":
        people = [r for r in people if r.user_id]
    if not people:
        raise bad_request("NO_RECIPIENTS", "Aucun destinataire pour ce public")
    if body.expectedRecipients is not None and body.expectedRecipients != len(people):
        raise AppError(409, "AUDIENCE_CHANGED", "Le nombre de destinataires a changé : relisez-le avant d'envoyer", {"count": len(people)})
    now = utcnow()
    if body.when == "later":
        at = body.scheduledAt.replace(tzinfo=None) if body.scheduledAt else None
        if not at or at < now + datetime.timedelta(minutes=1) or at > now + MAX_AHEAD:
            raise bad_request("INVALID_SCHEDULE", "Choisissez une date future (dans les 90 jours)")
    else:
        at = now
    b = Broadcast(subject=body.subject.strip(), body=body.body.strip(), signature=body.signature.strip(), audienceMode=body.audienceMode, audience=params, channel=body.channel,
                  kind=body.kind, status="SCHEDULED", scheduledAt=at, recipients=len(people), createdById=a.id)
    db.add(b)
    await db.commit()
    await audit(db, a.id, "broadcast.create", "Broadcast", b.id, {"recipients": len(people), "channel": b.channel, "kind": b.kind, "when": body.when})
    if body.when == "now":  # pas d'attente du balayage : l'envoi démarre tout de suite
        claimed = await bc.claim_due(db)
        for i in claimed:
            asyncio.get_running_loop().create_task(bc.run(i))
        await db.refresh(b)
    return _row(b)


@router.get("/{broadcast_id}")
async def detail(broadcast_id: str, _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    b = await db.get(Broadcast, broadcast_id)
    if not b:
        raise not_found("BROADCAST_NOT_FOUND")
    return _row(b, detail=True)


@router.post("/{broadcast_id}/cancel")
async def cancel(broadcast_id: str, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Annule un envoi planifié (impossible une fois l'envoi commencé)."""
    from sqlalchemy import update

    res = await db.execute(update(Broadcast).where(Broadcast.id == broadcast_id, Broadcast.status == "SCHEDULED").values(status="CANCELED"))
    await db.commit()
    if res.rowcount == 0:
        if not await db.get(Broadcast, broadcast_id):
            raise not_found("BROADCAST_NOT_FOUND")
        raise bad_request("BROADCAST_NOT_CANCELABLE", "Seul un envoi planifié peut être annulé")
    await audit(db, a.id, "broadcast.cancel", "Broadcast", broadcast_id)
    return {"ok": True}

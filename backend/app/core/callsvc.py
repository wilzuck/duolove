"""Appels audio/vidéo entre deux membres d'un match actif, via un service tiers (voir callprovider).
Principes : jamais d'enregistrement, aucun appel sans match actif ni après un blocage, un seul appel à la fois par membre, durée maximale et plafond
quotidien pilotés par l'admin, un appel sans réponse devient « manqué » (notification discrète), un membre en pause ne reçoit pas d'appel."""
import asyncio
import datetime
import logging

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import appsettings, callprovider, chat_service, flags, notifications, realtime, rhythm
from app.core.config import get_settings
from app.core.errors import AppError, bad_request, conflict, not_found
from app.core.ids import utcnow
from app.core.jsonfmt import iso as _iso
from app.models.models import CallSession, Profile

log = logging.getLogger(__name__)
KINDS = ("AUDIO", "VIDEO")
LIVE = ("RINGING", "ACTIVE")


def iso(d: datetime.datetime | None) -> str | None:
    return _iso(d) if d else None


async def _name(db: AsyncSession, user_id: str) -> str:
    return (await db.execute(select(Profile.displayName).where(Profile.userId == user_id))).scalar_one_or_none() or "?"


async def _serialize(db: AsyncSession, c: CallSession, viewer_id: str) -> dict:
    other = c.calleeId if c.callerId == viewer_id else c.callerId
    cfg = await appsettings.all_values(db)
    return {
        "id": c.id, "conversationId": c.conversationId, "kind": c.kind, "status": c.status,
        "direction": "outgoing" if c.callerId == viewer_id else "incoming",
        "other": {"id": other, "displayName": await _name(db, other)},
        "ringExpiresAt": iso(c.ringExpiresAt), "answeredAt": iso(c.answeredAt), "endedAt": iso(c.endedAt),
        "maxMinutes": cfg["calls.max_minutes"], "simulated": get_settings().call_provider != "livekit",
    }


async def _emit(db: AsyncSession, c: CallSession, event: str) -> None:
    for uid in (c.callerId, c.calleeId):
        await realtime.emit_to_user(uid, event, await _serialize(db, c, uid))


async def config(db: AsyncSession) -> dict:
    cfg = await appsettings.all_values(db)
    s = get_settings()
    return {"enabled": s.calls_available and await flags.read_flag(db, "calls"), "simulated": s.call_provider != "livekit",
            "ringSeconds": cfg["calls.ring_seconds"], "maxMinutes": cfg["calls.max_minutes"]}


async def _expire(db: AsyncSession, c: CallSession, now: datetime.datetime | None = None) -> bool:
    """Passe un appel dépassé à l'état final (manqué, ou terminé à la durée maximale). Retourne True si l'état a changé."""
    now = now or utcnow()
    if c.status == "RINGING" and c.ringExpiresAt <= now:
        c.status, c.endedAt = "MISSED", c.ringExpiresAt
        await db.commit()
        await notifications.create(db, c.calleeId, "CALL_MISSED", {"conversationId": c.conversationId, "callId": c.id, "kind": c.kind, "fromUserId": c.callerId})
        await _emit(db, c, "call:update")
        return True
    if c.status == "ACTIVE" and c.answeredAt:
        cfg = await appsettings.all_values(db)
        limit = c.answeredAt + datetime.timedelta(minutes=cfg["calls.max_minutes"])
        if limit <= now:
            c.status, c.endedAt = "ENDED", limit
            await db.commit()
            await _emit(db, c, "call:update")
            return True
    return False


async def _locked(db: AsyncSession, user_id: str, call_id: str) -> CallSession:
    c = (await db.execute(select(CallSession).where(CallSession.id == call_id).with_for_update())).scalar_one_or_none()
    if not c or user_id not in (c.callerId, c.calleeId):
        raise not_found("CALL_NOT_FOUND")  # ne révèle pas l'existence
    await _expire(db, c)
    return c


async def _live_of(db: AsyncSession, user_id: str) -> list[CallSession]:
    rows = (await db.execute(select(CallSession).where(CallSession.status.in_(LIVE), or_(CallSession.callerId == user_id, CallSession.calleeId == user_id))
                             .order_by(CallSession.createdAt.desc()).with_for_update())).scalars().all()
    return [c for c in rows if not await _expire(db, c)]


async def start(db: AsyncSession, user_id: str, conversation_id: str, kind: str) -> dict:
    await flags.assert_on(db, "calls")
    if not get_settings().calls_available:
        raise AppError(503, "CALLS_UNAVAILABLE", "Les appels ne sont pas disponibles pour le moment.")
    if kind not in KINDS:
        raise bad_request("INVALID_KIND", "Type d'appel invalide")
    await rhythm.assert_not_paused(db, user_id)
    _, other_id, active = await chat_service.membership(db, user_id, conversation_id)
    await chat_service._assert_can_send(db, user_id, other_id, active)
    cfg = await appsettings.all_values(db)
    # Verrou consultatif sur la paire : deux appels simultanés ne peuvent pas être créés.
    for uid in sorted((user_id, other_id)):
        await db.execute(select(func.pg_advisory_xact_lock(func.hashtext("call:" + uid))))
    if await _live_of(db, user_id):
        raise conflict("CALL_BUSY", "Un appel est déjà en cours")
    if await _live_of(db, other_id):
        raise conflict("CALLEE_UNAVAILABLE", "Cette personne n'est pas disponible pour le moment")
    callee_profile = (await db.execute(select(Profile).where(Profile.userId == other_id))).scalar_one_or_none()
    if callee_profile and rhythm.is_paused(callee_profile):
        raise conflict("CALLEE_UNAVAILABLE", "Cette personne n'est pas disponible pour le moment")
    today = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    n = (await db.execute(select(func.count()).select_from(CallSession).where(CallSession.callerId == user_id, CallSession.createdAt >= today))).scalar_one()
    if n >= cfg["calls.max_per_day"]:
        raise AppError(429, "CALL_LIMIT", "Vous avez atteint le nombre d'appels possibles aujourd'hui.", {"max": cfg["calls.max_per_day"]})
    c = CallSession(conversationId=conversation_id, callerId=user_id, calleeId=other_id, kind=kind, status="RINGING",
                    ringExpiresAt=utcnow() + datetime.timedelta(seconds=cfg["calls.ring_seconds"]))
    db.add(c)
    await db.commit()
    await _emit(db, c, "call:incoming")
    return await _serialize(db, c, user_id)


async def _transition(db: AsyncSession, user_id: str, call_id: str, *, role: str | None, frm: tuple[str, ...], to: str, mark_answered: bool = False) -> dict:
    c = await _locked(db, user_id, call_id)
    if c.status == to:
        return await _serialize(db, c, user_id)  # idempotent
    if role == "callee" and c.calleeId != user_id or role == "caller" and c.callerId != user_id:
        raise AppError(403, "FORBIDDEN", "Action non autorisée")
    if c.status not in frm:
        raise conflict("CALL_NOT_ACTIVE", "Cet appel n'est plus en cours")
    if mark_answered:
        _, other_id, active = await chat_service.membership(db, user_id, c.conversationId)
        try:
            await chat_service._assert_can_send(db, user_id, other_id, active)
        except AppError:
            c.status, c.endedAt, c.endedById = "CANCELED", utcnow(), user_id
            await db.commit()
            await _emit(db, c, "call:update")
            raise
        c.answeredAt = utcnow()
    else:
        c.endedAt, c.endedById = utcnow(), user_id
    c.status = to
    await db.commit()
    await _emit(db, c, "call:update")
    return await _serialize(db, c, user_id)


async def accept(db, user_id, call_id):
    return await _transition(db, user_id, call_id, role="callee", frm=("RINGING",), to="ACTIVE", mark_answered=True)


async def decline(db, user_id, call_id):
    return await _transition(db, user_id, call_id, role="callee", frm=("RINGING",), to="DECLINED")


async def cancel(db, user_id, call_id):
    return await _transition(db, user_id, call_id, role="caller", frm=("RINGING",), to="CANCELED")


async def end(db: AsyncSession, user_id: str, call_id: str) -> dict:
    """Raccrocher : met fin à un appel en cours ; avant la réponse, l'appelant annule et l'appelé refuse."""
    c = await _locked(db, user_id, call_id)
    if c.status == "RINGING":
        return await (cancel if c.callerId == user_id else decline)(db, user_id, call_id)
    if c.status != "ACTIVE":
        return await _serialize(db, c, user_id)
    return await _transition(db, user_id, call_id, role=None, frm=("ACTIVE",), to="ENDED")


async def token(db: AsyncSession, user_id: str, call_id: str) -> dict:
    """Jeton d'accès à la salle. Refusé hors appel actif (l'appelant peut rejoindre pendant la sonnerie), après un blocage ou une conversation fermée."""
    c = await _locked(db, user_id, call_id)
    ok = c.status == "ACTIVE" or (c.status == "RINGING" and c.callerId == user_id)
    if not ok:
        raise conflict("CALL_NOT_ACTIVE", "Cet appel n'est plus en cours")
    _, other_id, active = await chat_service.membership(db, user_id, c.conversationId)
    await chat_service._assert_can_send(db, user_id, other_id, active)
    cfg = await appsettings.all_values(db)
    now = utcnow()
    start = c.answeredAt or now
    remaining = int((start + datetime.timedelta(minutes=cfg["calls.max_minutes"]) - now).total_seconds())
    ttl = max(30, remaining if c.answeredAt else cfg["calls.max_minutes"] * 60 + cfg["calls.ring_seconds"])
    ticket = callprovider.issue(room=f"call-{c.id}", identity=user_id, name=await _name(db, user_id), ttl_seconds=ttl, kind=c.kind)
    return {**ticket, "callId": c.id, "kind": c.kind, "expiresInSeconds": ttl}


async def current(db: AsyncSession, user_id: str) -> dict | None:
    live = await _live_of(db, user_id)
    await db.commit()
    return await _serialize(db, live[0], user_id) if live else None


async def sweep(db: AsyncSession) -> int:
    now = utcnow()
    rows = (await db.execute(select(CallSession).where(CallSession.status.in_(LIVE)).with_for_update(skip_locked=True))).scalars().all()
    changed = 0
    for c in rows:
        changed += int(await _expire(db, c, now))
    await db.commit()
    return changed


async def sweep_loop(maker, every: int = 20) -> None:
    while True:
        await asyncio.sleep(every)
        try:
            async with maker() as db:
                await sweep(db)
        except Exception:
            log.exception("balayage des appels")


async def stats(db: AsyncSession, since: datetime.datetime) -> dict:
    rows = (await db.execute(select(CallSession.status, CallSession.answeredAt, CallSession.endedAt).where(CallSession.createdAt >= since))).all()
    answered = [r for r in rows if r.answeredAt]
    minutes = [((r.endedAt or r.answeredAt) - r.answeredAt).total_seconds() / 60 for r in answered]
    return {"started": len(rows), "answered": len(answered), "answerRate": round(len(answered) / len(rows), 3) if rows else 0.0,
            "missed": sum(1 for r in rows if r.status == "MISSED"), "averageMinutes": round(sum(minutes) / len(minutes), 1) if minutes else 0.0}

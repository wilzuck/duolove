"""Signalements et blocages."""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import AuthUser, current_user
from app.core.errors import AppError, not_found
from app.core.ids import new_id, utcnow
from app.core.jsonfmt import iso
from app.core.ratelimit import limit
from app.db.session import get_db
from app.models.models import Block, Match, Profile, Report, User

router = APIRouter(tags=["reports"])


class ReportIn(BaseModel):
    targetId: str
    reason: Literal["FAKE_PROFILE", "SCAM", "HARASSMENT", "INAPPROPRIATE_CONTENT", "UNDERAGE", "SPAM", "OTHER"]
    details: str | None = None

    @field_validator("targetId")
    @classmethod
    def _target(cls, v: str) -> str:
        if not v:
            raise ValueError("required")
        return v

    @field_validator("details")
    @classmethod
    def _details(cls, v):
        if v is None:
            return v
        v = v.strip()
        if len(v) > 1000:
            raise ValueError("too_long")
        return v


@router.post("/reports", status_code=201, dependencies=[limit(10, 3600)])
async def report(body: ReportIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if body.targetId == u.id:
        raise AppError(400, "INVALID_TARGET")
    if not (await db.execute(select(User.id).where(User.id == body.targetId))).first():
        raise not_found("USER_NOT_FOUND")
    db.add(Report(reporterId=u.id, targetId=body.targetId, reason=body.reason, details=body.details))
    await db.commit()
    return {"ok": True}


@router.post("/blocks/{user_id}")
async def block(user_id: str, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Bloquer : le profil disparaît de la découverte des deux côtés et le match éventuel est fermé."""
    if user_id == u.id:
        raise AppError(400, "INVALID_TARGET")
    if not (await db.execute(select(User.id).where(User.id == user_id))).first():
        raise not_found("USER_NOT_FOUND")
    a, b = (u.id, user_id) if u.id < user_id else (user_id, u.id)
    await db.execute(insert(Block).values(id=new_id(), blockerId=u.id, blockedId=user_id, createdAt=utcnow())
                     .on_conflict_do_nothing(index_elements=["blockerId", "blockedId"]))
    await db.execute(update(Match).where(Match.userAId == a, Match.userBId == b, Match.status == "ACTIVE")
                     .values(status="UNMATCHED", unmatchedById=u.id))
    await db.commit()
    return {"ok": True}


@router.delete("/blocks/{user_id}")
async def unblock(user_id: str, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Block).where(Block.blockerId == u.id, Block.blockedId == user_id))
    await db.commit()
    return {"ok": True}


@router.get("/blocks")
async def blocks(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Block.blockedId, Block.createdAt, Profile.displayName).outerjoin(Profile, Profile.userId == Block.blockedId)
        .where(Block.blockerId == u.id).order_by(Block.createdAt.desc())
    )).all()
    return [{"userId": r.blockedId, "displayName": r.displayName or "—", "blockedAt": iso(r.createdAt)} for r in rows]

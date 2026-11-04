"""Parrainage : code personnel et suivi des récompenses."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import referral
from app.core.auth import AuthUser, current_user
from app.db.session import get_db

router = APIRouter(prefix="/referral", tags=["referral"])


@router.get("/me")
async def me(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await referral.summary(db, u.id)

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import dailysvc, discoverysvc
from app.core.auth import AuthUser, verified_user
from app.db.session import get_db

router = APIRouter(prefix="/discovery", tags=["discovery"])


def _int(v: str, default: int) -> int:
    try:
        return int(v)
    except ValueError:
        return default


@router.get("")
async def feed(limit: str = Query("10"), cursor: str | None = None, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    n = min(max(_int(limit, 10) or 10, 1), 30)
    return await discoverysvc.feed(db, u.id, n, cursor)


@router.get("/count")
async def count(u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await discoverysvc.count(db, u.id)


@router.get("/daily")
async def daily(u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    """Tes découvertes du jour : sélection limitée de profils compatibles, calculée à la première consultation de la journée."""
    return await dailysvc.get_today(db, u.id)


@router.get("/daily/history")
async def daily_history(before: str | None = None, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await dailysvc.history(db, u.id, before)

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import discoverysvc
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

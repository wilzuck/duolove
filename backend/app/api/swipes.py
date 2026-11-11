from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import credits, entitlements, flags, swipesvc
from app.core.auth import AuthUser, verified_user
from app.db.session import get_db
from app.schemas.profiles import SwipeIn

router = APIRouter(prefix="/swipes", tags=["swipes"])


@router.post("", status_code=200)
async def swipe(body: SwipeIn, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    if body.action == "SUPER_LIKE":
        await flags.assert_on(db, "super_likes")
    return await swipesvc.swipe(db, u.id, body.targetId, body.action, body.comment, body.targetKind, body.targetRef)


@router.post("/rewind", status_code=200)
async def rewind(u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await swipesvc.rewind(db, u.id)


@router.get("/received")
async def received(cursor: str | None = None, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await swipesvc.received(db, u.id, cursor)


@router.get("/sent")
async def sent(cursor: str | None = None, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await swipesvc.sent(db, u.id, cursor)


@router.get("/usage")
async def usage(u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    used = await swipesvc.usage(db, u.id)
    e = await entitlements.get(db, u.id)
    lim = e["limits"]
    return {"used": used, "limits": {"dailyLikes": lim["dailyLikes"], "unlimitedLikes": lim["unlimitedLikes"], "superLikesWeekly": lim["superLikesWeekly"]},
            "credits": await credits.balances(db, u.id), "plan": e["plan"], "canRewind": await swipesvc.can_rewind(db, u.id)}

"""Accès payant : ce que voit un membre bloqué (état et chiffres de sa communauté), sans aucune donnée personnelle d'autrui."""
import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import access
from app.core.auth import AuthUser, current_user
from app.core.ids import utcnow
from app.db.session import get_db
from app.models.models import Profile, User

router = APIRouter(prefix="/access", tags=["access"])


@router.get("/preview")
async def preview(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """État d'accès + aperçu chiffré : nombre de profils actifs dans ma ville et mon pays, et ceux vus cette semaine. Des nombres seulement."""
    user = await db.get(User, u.id)
    mine = (await db.execute(select(Profile).where(Profile.userId == u.id))).scalar_one_or_none()
    base = select(func.count()).select_from(Profile).join(User, User.id == Profile.userId).where(User.status == "ACTIVE", User.role == "USER", Profile.onboardedAt.is_not(None), Profile.userId != u.id)
    week = utcnow() - datetime.timedelta(days=7)

    async def count(*where):
        return (await db.execute(base.where(*where))).scalar_one()

    counts = {"city": 0, "country": 0, "activeWeek": 0, "total": await count()}
    if mine:
        counts["city"] = await count(Profile.city == mine.city, Profile.country == mine.country)
        counts["country"] = await count(Profile.country == mine.country)
        counts["activeWeek"] = await count(User.lastActiveAt >= week)
    return {**await access.status(db, user), "counts": counts, "city": mine.city if mine else None}

"""Boosts de visibilité et portefeuille de crédits."""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import credits
from app.core.auth import AuthUser, current_user, verified_user
from app.core.constants import BOOST_MINUTES
from app.core.errors import bad_request
from app.core.flags import require_flag
from app.core.ids import utcnow
from app.core.jsonfmt import iso
from app.db.session import get_db
from app.models.models import Boost, Profile

router = APIRouter(tags=["boosts"])


class ActivateIn(BaseModel):
    creditType: Literal["BOOST_30", "BOOST_120", "BOOST_1440"]


def _boost(b: Boost) -> dict:
    return {"id": b.id, "userId": b.userId, "startsAt": iso(b.startsAt), "endsAt": iso(b.endsAt), "durationMinutes": b.durationMinutes,
            "source": b.source, "createdAt": iso(b.createdAt)}


async def activate(db: AsyncSession, user_id: str, credit_type: str) -> dict:
    """Active un boost en consommant UN crédit, dans la même transaction que la création du boost :
    si quoi que ce soit échoue (solde insuffisant, profil non prêt), rien n'est consommé. Un boost déjà actif est prolongé."""
    import datetime

    minutes = BOOST_MINUTES[credit_type]
    try:
        profile = (await db.execute(select(Profile.boostedUntil, Profile.onboardedAt).where(Profile.userId == user_id))).first()
        if not profile or not profile.onboardedAt:
            raise bad_request("PROFILE_INCOMPLETE")
        now = utcnow().replace(microsecond=utcnow().microsecond // 1000 * 1000)  # TIMESTAMP(3) : même précision que la base
        starts_at = profile.boostedUntil if profile.boostedUntil and profile.boostedUntil > now else now
        ends_at = starts_at + datetime.timedelta(minutes=minutes)
        boost = Boost(userId=user_id, startsAt=starts_at, endsAt=ends_at, durationMinutes=minutes, source="credit")
        db.add(boost)
        await db.flush()
        await credits.consume(db, user_id, credit_type, 1, boost.id)
        profile_row = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one()
        profile_row.boostedUntil = ends_at
        await db.commit()
        return {"id": boost.id, "startsAt": iso(starts_at), "endsAt": iso(ends_at), "durationMinutes": minutes}
    except BaseException:
        await db.rollback()
        raise


@router.get("/credits")
async def wallet(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return {
        "balances": await credits.balances(db, u.id),
        "transactions": [{"id": t.id, "type": t.type.value, "delta": t.delta, "reason": t.reason.value, "createdAt": iso(t.createdAt)}
                         for t in await credits.history(db, u.id)],
    }


@router.get("/boosts")
async def history(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Boost).where(Boost.userId == u.id).order_by(Boost.createdAt.desc()).limit(30))).scalars().all()
    return [_boost(b) for b in rows]


@router.post("/boosts/activate", dependencies=[require_flag("boosts")])
async def activate_boost(body: ActivateIn, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await activate(db, u.id, body.creditType)

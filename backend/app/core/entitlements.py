"""Source de vérité serveur des droits, dérivée de la configuration des offres. Un abonnement expiré vaut « gratuit » immédiatement."""
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import plan_config
from app.core.constants import limits_from_features
from app.core.ids import new_id, utcnow
from app.models.models import Entitlement


async def get(db: AsyncSession, user_id: str) -> dict:
    e = (await db.execute(select(Entitlement).where(Entitlement.userId == user_id))).scalar_one_or_none()
    active = bool(e and e.plan.value != "FREE" and e.validUntil and e.validUntil > utcnow())
    plan = e.plan.value if active else "FREE"
    return {"plan": plan, "limits": limits_from_features(await plan_config.features_of(db, plan)), "validUntil": e.validUntil if active else None}


async def set_(db: AsyncSession, user_id: str, plan: str, valid_until) -> None:
    stmt = insert(Entitlement).values(id=new_id(), userId=user_id, plan=plan, validUntil=valid_until, updatedAt=utcnow())
    await db.execute(stmt.on_conflict_do_update(index_elements=["userId"], set_={"plan": plan, "validUntil": valid_until, "updatedAt": utcnow()}))

"""Interrupteur « accès payant obligatoire » (super administrateur). Chaque changement est journalisé."""
import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import SUP, audit
from app.core import access
from app.core.auth import AuthUser
from app.core.errors import AppError
from app.core.ids import utcnow
from app.db.session import get_db
from app.models.models import Entitlement, SystemSetting, User

router = APIRouter(prefix="/admin/access", tags=["admin"])


class AccessIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool
    graceDays: int = Field(access.DEFAULT_GRACE_DAYS, ge=0, le=365)
    trialDays: int = Field(access.DEFAULT_TRIAL_DAYS, ge=0, le=90)
    verifiedDiscountPercent: int = Field(0, ge=0, le=90)
    womenThreshold: int = Field(access.DEFAULT_WOMEN_THRESHOLD, ge=1, le=1_000_000)


async def _view(db: AsyncSession) -> dict:
    cfg = await access.load(db)
    ready, why = await access.payments_ready(db)
    now = utcnow()
    members = select(func.count()).select_from(User).where(User.role == "USER", User.status != "DELETED")
    paying = select(func.count()).select_from(Entitlement).join(User, User.id == Entitlement.userId).where(User.role == "USER", User.status != "DELETED", Entitlement.plan != "FREE", Entitlement.validUntil > now)
    total, paid = (await db.execute(members)).scalar_one(), (await db.execute(paying)).scalar_one()
    return {"enabled": cfg.enabled, "activatedAt": cfg.activated_at, "graceDays": cfg.grace_days, "trialDays": cfg.trial_days, "verifiedDiscountPercent": cfg.verified_discount_percent,
            "womenThreshold": cfg.women_threshold, "women": await access.women_progress(db, cfg), "ready": ready, "notReadyReason": why,
            "graceEndsAt": cfg.activated_at + datetime.timedelta(days=cfg.grace_days) if cfg.enabled and cfg.activated_at else None,
            "counts": {"members": total, "paying": paid, "free": max(total - paid, 0)}}


@router.get("")
async def read(_: AuthUser = SUP, db: AsyncSession = Depends(get_db)):
    return await _view(db)


@router.put("")
async def save(body: AccessIn, a: AuthUser = SUP, db: AsyncSession = Depends(get_db)):
    before = await access.load(db)
    if body.enabled:
        ready, why = await access.payments_ready(db)
        if not ready:  # on n'enferme pas des inscrits sans pouvoir leur laisser payer
            raise AppError(409, "PAYMENT_NOT_READY", "Activez d'abord un vrai paiement (KKiaPay configuré, fonction « paiements » active).", {"reason": why})
    # La date d'activation ne change que lorsqu'on passe de « désactivé » à « activé » : elle sert de repère au délai de grâce des anciens membres.
    activated = (before.activated_at if before.enabled and before.activated_at else utcnow()) if body.enabled else before.activated_at
    # Le seuil change : l'alerte peut se redéclencher ; sinon on garde la date de la dernière alerte.
    notified = before.threshold_notified_at if body.womenThreshold == before.women_threshold else None
    value = {"enabled": body.enabled, "activatedAt": activated.isoformat() if activated else None, "graceDays": body.graceDays, "trialDays": body.trialDays,
             "verifiedDiscountPercent": body.verifiedDiscountPercent, "womenThreshold": body.womenThreshold, "thresholdNotifiedAt": notified.isoformat() if notified else None}
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == access.KEY))).scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(SystemSetting(key=access.KEY, value=value))
    await db.commit()
    access.invalidate()
    await audit(db, a.id, "access.update", "SystemSetting", access.KEY, {"before": {"enabled": before.enabled, "graceDays": before.grace_days}, "after": {"enabled": body.enabled, "graceDays": body.graceDays, "trialDays": body.trialDays, "verifiedDiscountPercent": body.verifiedDiscountPercent, "womenThreshold": body.womenThreshold}})
    return await _view(db)

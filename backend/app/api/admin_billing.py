"""Informations de facturation de l'émetteur (nom légal, adresse, immatriculation, TVA) : elles figurent sur chaque facture PDF. Super administrateur."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import SUP, audit
from app.core import invoicing
from app.core.auth import AuthUser
from app.db.session import get_db
from app.models.models import SystemSetting

router = APIRouter(prefix="/admin/billing", tags=["admin"])


class BillingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    legalName: str = Field("", max_length=120)
    address: str = Field("", max_length=200)
    city: str = Field("", max_length=80)
    country: str = Field("", max_length=80)
    registration: str = Field("", max_length=160)  # RCCM, IFU, numéro d'identification… tel que l'exige votre pays
    email: str = Field("", max_length=120)
    phone: str = Field("", max_length=40)
    website: str = Field("", max_length=120)
    footerNote: str = Field("", max_length=300)
    vatPercent: int = Field(0, ge=0, le=30)


@router.get("")
async def read(_: AuthUser = SUP, db: AsyncSession = Depends(get_db)):
    return await invoicing.company(db)


@router.put("")
async def save(body: BillingIn, a: AuthUser = SUP, db: AsyncSession = Depends(get_db)):
    value = {k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump().items()}
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == invoicing.KEY))).scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(SystemSetting(key=invoicing.KEY, value=value))
    await db.commit()
    await audit(db, a.id, "billing.update", "SystemSetting", invoicing.KEY, {"vatPercent": body.vatPercent})
    return await invoicing.company(db)

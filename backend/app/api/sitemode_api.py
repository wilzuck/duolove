"""Mode maintenance : statut public et réglage par l'administration."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, audit
from app.core import sitemode
from app.core.auth import AuthUser
from app.db.session import get_db

router = APIRouter(tags=["site"])


@router.get("/site/status")
async def status(db: AsyncSession = Depends(get_db)):
    return sitemode.public(await sitemode.get(db))


class MaintenanceIn(BaseModel):
    enabled: bool
    messageFr: str = Field("", max_length=sitemode.MAX_MESSAGE)
    messageEn: str = Field("", max_length=sitemode.MAX_MESSAGE)


@router.get("/admin/maintenance")
async def get_maintenance(_: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    return await sitemode.get(db, fresh=True)


@router.put("/admin/maintenance")
async def put_maintenance(body: MaintenanceIn, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    v = await sitemode.save(db, body.enabled, body.messageFr, body.messageEn)
    await audit(db, a.id, "site.maintenance", "Setting", sitemode.KEY, {"enabled": body.enabled})
    return v

"""Réseaux sociaux : lecture publique (pied de page) et réglage par l'administration."""
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, audit
from app.core import socials
from app.core.auth import AuthUser
from app.db.session import get_db

router = APIRouter(tags=["social"])


class NetworkIn(BaseModel):
    enabled: bool = False
    urls: dict[str, str] = {}


class SocialIn(BaseModel):
    facebook: NetworkIn = NetworkIn()
    instagram: NetworkIn = NetworkIn()
    tiktok: NetworkIn = NetworkIn()
    whatsapp: NetworkIn = NetworkIn()
    youtube: NetworkIn = NetworkIn()
    x: NetworkIn = NetworkIn()


@router.get("/social")
async def public_links(response: Response, db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=60"
    return socials.public_view(await socials.get(db))


@router.get("/admin/social")
async def admin_get(_: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    return await socials.get(db)


@router.put("/admin/social")
async def admin_set(body: SocialIn, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    before = await socials.get(db)
    after = await socials.save(db, body.model_dump())
    await audit(db, a.id, "social.update", "SystemSetting", socials.KEY, {"before": before, "after": after})
    return after

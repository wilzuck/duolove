"""Pays ouverts : liste publique (formulaire d'inscription) et réglage par l'administration."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, audit
from app.core import launch
from app.db.session import get_db

router = APIRouter(tags=["launch"])


class CountriesIn(BaseModel):
    countries: list[str] = Field(min_length=1, max_length=40)


@router.get("/launch-countries")
async def public_list(db: AsyncSession = Depends(get_db)):
    return {"countries": await launch.enabled(db)}


@router.get("/admin/launch-countries")
async def admin_get(_=ADM, db: AsyncSession = Depends(get_db)):
    return {"countries": await launch.enabled(db)}


@router.put("/admin/launch-countries")
async def admin_put(body: CountriesIn, a=ADM, db: AsyncSession = Depends(get_db)):
    codes = await launch.save(db, body.countries)
    await audit(db, a.id, "launch.countries", "SystemSetting", launch.KEY, {"countries": codes})
    return {"countries": codes}

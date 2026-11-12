"""Pays et villes ouverts : listes publiques (formulaire d'inscription), réglages et liste d'attente."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, audit
from app.core import launch
from app.core.cities import fold
from app.core.ratelimit import limit
from app.db.session import get_db
from app.models.models import WaitlistEntry
from app.schemas.common import CountryT, Email

router = APIRouter(tags=["launch"])


class CountriesIn(BaseModel):
    countries: list[str] = Field(min_length=1, max_length=40)


class CitiesIn(BaseModel):
    cities: list[str] = Field(max_length=200)  # liste vide = aucune restriction par ville


class WaitlistIn(BaseModel):
    email: Email
    country: CountryT
    city: str = Field(min_length=1, max_length=80)


@router.get("/launch-countries")
async def public_list(db: AsyncSession = Depends(get_db)):
    return {"countries": await launch.enabled(db), "cities": await launch.cities(db)}


@router.get("/admin/launch-countries")
async def admin_get(_=ADM, db: AsyncSession = Depends(get_db)):
    return {"countries": await launch.enabled(db)}


@router.put("/admin/launch-countries")
async def admin_put(body: CountriesIn, a=ADM, db: AsyncSession = Depends(get_db)):
    codes = await launch.save(db, body.countries)
    await audit(db, a.id, "launch.countries", "SystemSetting", launch.KEY, {"countries": codes})
    return {"countries": codes}


@router.get("/admin/launch-cities")
async def admin_cities(_=ADM, db: AsyncSession = Depends(get_db)):
    return {"cities": await launch.cities(db)}


@router.put("/admin/launch-cities")
async def admin_cities_put(body: CitiesIn, a=ADM, db: AsyncSession = Depends(get_db)):
    names = await launch.save_cities(db, body.cities)
    await audit(db, a.id, "launch.cities", "SystemSetting", launch.CITIES_KEY, {"cities": names})
    return {"cities": names}


@router.post("/waitlist", status_code=201, dependencies=[limit(10, 3600)])
async def join_waitlist(body: WaitlistIn, db: AsyncSession = Depends(get_db)):
    """Liste d'attente d'une ville pas encore ouverte. Réponse identique que l'adresse soit déjà inscrite ou non (rien n'est révélé)."""
    await db.execute(pg_insert(WaitlistEntry).values(email=body.email.strip().lower(), country=body.country, city=" ".join(body.city.split())).on_conflict_do_nothing(index_elements=["email"]))
    await db.commit()
    return {"ok": True}


@router.get("/admin/waitlist")
async def admin_waitlist(_=ADM, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(WaitlistEntry).order_by(WaitlistEntry.createdAt.desc()).limit(5000))).scalars().all()
    by_city: dict[str, dict] = {}
    for r in rows:
        k = f"{r.country}|{fold(r.city)}"
        by_city.setdefault(k, {"country": r.country, "city": r.city, "count": 0})["count"] += 1
    return {"total": len(rows), "cities": sorted(by_city.values(), key=lambda c: -c["count"]),
            "items": [{"id": r.id, "email": r.email, "country": r.country, "city": r.city, "createdAt": r.createdAt.isoformat() + "Z"} for r in rows]}

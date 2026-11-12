"""Pays ouverts à l'inscription : l'administration choisit où Crushduo se lance. Par défaut : Bénin, Côte d'Ivoire, Togo, Sénégal, Niger, Burkina Faso.

Restriction par ville (réglage `launch.cities`, OPTIONNELLE et désactivée par défaut) : quand la liste n'est PAS vide, seules les inscriptions depuis ces villes sont acceptées
et les autres s'inscrivent sur la liste d'attente ; liste vide = toutes les villes des pays ouverts.

Seules les NOUVELLES inscriptions sont limitées ; les membres déjà inscrits (quel que soit leur pays ou leur ville) ne sont jamais bloqués ni masqués."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cities import fold
from app.core.constants import COUNTRY_CODES
from app.core.errors import AppError
from app.models.models import SystemSetting

KEY = "launch.countries"
DEFAULT = ("BJ", "CI", "TG", "SN", "NE", "BF")
CITIES_KEY = "launch.cities"
DEFAULT_CITIES: tuple[str, ...] = ()  # par défaut AUCUNE restriction par ville : l'inscription reste ouverte à toutes les villes des pays ouverts
MAX_CITIES = 60


async def enabled(db: AsyncSession) -> list[str]:
    v = (await db.execute(select(SystemSetting.value).where(SystemSetting.key == KEY))).scalar_one_or_none()
    codes = v.get("countries") if isinstance(v, dict) else None
    if not isinstance(codes, list):
        return list(DEFAULT)
    return [c for c in COUNTRY_CODES if c in codes]  # ordre stable, codes inconnus ignorés


async def save(db: AsyncSession, codes: list[str]) -> list[str]:
    clean = [c for c in COUNTRY_CODES if c in set(codes)]
    if not clean:
        raise AppError(400, "NO_COUNTRY", "Gardez au moins un pays ouvert")
    row = await db.get(SystemSetting, KEY)
    if row:
        row.value = {"countries": clean}
    else:
        db.add(SystemSetting(key=KEY, value={"countries": clean}))
    await db.commit()
    return clean


async def assert_open(db: AsyncSession, country: str | None) -> None:
    if country and country not in await enabled(db):
        raise AppError(403, "COUNTRY_NOT_OPEN", "Crushduo n'est pas encore ouvert dans ce pays")


async def cities(db: AsyncSession) -> list[str]:
    """Villes ouvertes. Liste vide = aucune restriction par ville."""
    v = (await db.execute(select(SystemSetting.value).where(SystemSetting.key == CITIES_KEY))).scalar_one_or_none()
    names = v.get("cities") if isinstance(v, dict) else None
    return list(DEFAULT_CITIES) if not isinstance(names, list) else [n for n in names if isinstance(n, str) and n.strip()]


async def save_cities(db: AsyncSession, names: list[str]) -> list[str]:
    seen: dict[str, str] = {}
    for n in names:
        n = " ".join(n.split())[:80]
        if n and fold(n) not in seen:
            seen[fold(n)] = n
    clean = list(seen.values())[:MAX_CITIES]
    row = await db.get(SystemSetting, CITIES_KEY)
    if row:
        row.value = {"cities": clean}
    else:
        db.add(SystemSetting(key=CITIES_KEY, value={"cities": clean}))
    await db.commit()
    return clean


async def is_city_open(db: AsyncSession, city: str | None) -> bool:
    open_cities = await cities(db)
    return not open_cities or fold(city or "") in {fold(c) for c in open_cities}


async def assert_city_open(db: AsyncSession, city: str | None) -> None:
    if not await is_city_open(db, city):
        raise AppError(403, "CITY_NOT_OPEN", "Crushduo n'est pas encore ouvert dans cette ville")

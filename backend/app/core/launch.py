"""Pays ouverts à l'inscription : l'administration choisit où Crushduo se lance. Par défaut : Bénin, Côte d'Ivoire, Togo, Sénégal, Niger, Burkina Faso.

Seules les NOUVELLES inscriptions sont limitées ; les membres déjà inscrits (quel que soit leur pays) ne sont jamais bloqués ni masqués."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import COUNTRY_CODES
from app.core.errors import AppError
from app.models.models import SystemSetting

KEY = "launch.countries"
DEFAULT = ("BJ", "CI", "TG", "SN", "NE", "BF")


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

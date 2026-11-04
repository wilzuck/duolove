"""Feature flags : catalogue fermé (constants.FEATURE_FLAGS), appliqué côté serveur. Ligne absente = valeur par défaut du catalogue."""
import time

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import FEATURE_FLAGS
from app.core.errors import AppError
from app.db.session import get_db
from app.models.models import FeatureFlag

_DEFAULTS = {f.key: f.default_on for f in FEATURE_FLAGS}
_cache: dict = {"at": 0.0, "map": None}


def feature_off(key: str) -> AppError:
    return AppError(503, "FEATURE_DISABLED", "Cette fonctionnalité est temporairement indisponible.", {"flag": key})


async def read_flag(db: AsyncSession, key: str) -> bool:
    """Lecture directe, sans cache."""
    row = (await db.execute(select(FeatureFlag.enabled).where(FeatureFlag.key == key))).scalar_one_or_none()
    return row if row is not None else _DEFAULTS.get(key, False)


def invalidate() -> None:
    _cache["map"] = None


async def all_flags(db: AsyncSession) -> dict[str, bool]:
    if _cache["map"] is None or time.monotonic() - _cache["at"] > 10:
        rows = (await db.execute(select(FeatureFlag.key, FeatureFlag.enabled))).all()
        _cache["map"], _cache["at"] = {k: e for k, e in rows}, time.monotonic()
    return {f.key: _cache["map"].get(f.key, f.default_on) for f in FEATURE_FLAGS}


async def is_on(db: AsyncSession, key: str) -> bool:
    return (await all_flags(db))[key]


async def assert_on(db: AsyncSession, key: str) -> None:
    if not await is_on(db, key):
        raise feature_off(key)


def require_flag(key: str):
    """Dépendance de route : refus 503 FEATURE_DISABLED si la fonctionnalité est coupée."""

    async def _dep(db: AsyncSession = Depends(get_db)) -> None:
        await assert_on(db, key)

    return Depends(_dep)

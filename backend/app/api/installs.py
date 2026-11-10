"""Compteur d'installations de l'application (PWA). Chaque appareil s'enregistre une fois avec un identifiant aléatoire (jamais lié à un compte).
Le nombre n'est montré au public qu'au-delà de PUBLIC_MIN installations ; l'administration le voit toujours (voir /admin/stats)."""
from __future__ import annotations

import re
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request
from app.core.ids import utcnow
from app.core.ratelimit import limit
from app.db.session import get_db
from app.models.models import AppInstall

router = APIRouter(tags=["installs"])
PUBLIC_MIN = 150  # le nombre n'est affiché sur la page publique qu'au-dessus de ce seuil
_ID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


class InstallIn(BaseModel):
    id: str
    platform: Literal["ios", "android", "desktop"]


@router.post("/installs", status_code=202, dependencies=[limit(30, 3600)])
async def register(body: InstallIn, db: AsyncSession = Depends(get_db)):
    """Enregistre (ou rafraîchit) une installation. Idempotent : le même appareil n'est compté qu'une fois."""
    if not _ID.match(body.id):
        raise bad_request("INVALID_INSTALL_ID", "Identifiant d'installation invalide.")
    stmt = pg_insert(AppInstall).values(id=body.id, platform=body.platform)
    await db.execute(stmt.on_conflict_do_update(index_elements=["id"], set_={"lastSeenAt": utcnow()}))
    await db.commit()
    return {"ok": True}


@router.get("/installs/public")
async def public_count(db: AsyncSession = Depends(get_db)):
    """Nombre d'installations, ou null tant qu'il ne dépasse pas le seuil : le chiffre exact n'est jamais exposé en dessous."""
    n = (await db.execute(select(func.count()).select_from(AppInstall))).scalar_one()
    return {"count": n if n > PUBLIC_MIN else None}

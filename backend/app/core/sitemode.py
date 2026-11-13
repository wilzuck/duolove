"""Mode maintenance du site (Admin › Maintenance). Désactivé par défaut.

Quand il est actif : les membres sont refusés sur toutes les routes connectées (503 MAINTENANCE) et les inscriptions sont fermées ;
l'équipe (modérateurs, administrateurs) garde l'accès complet ; les pages publiques (blog, tarifs…) et les notifications de paiement
(webhooks) continuent de fonctionner. La connexion reste possible pour que l'équipe puisse entrer."""
from __future__ import annotations

import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.ids import utcnow
from app.models.models import SystemSetting

KEY = "site.maintenance"
MAX_MESSAGE = 300
# Toujours permis à un membre, même en maintenance : se déconnecter, lire le statut du site.
ALWAYS = ("/api/auth/logout", "/api/site/status")
_cache: dict = {"at": 0.0, "v": None}


def _default() -> dict:
    return {"enabled": False, "messageFr": "", "messageEn": "", "since": None}


async def get(db: AsyncSession, fresh: bool = False) -> dict:
    if not fresh and _cache["v"] is not None and time.monotonic() - _cache["at"] < 5:
        return _cache["v"]
    v = (await db.execute(select(SystemSetting.value).where(SystemSetting.key == KEY))).scalar_one_or_none()
    out = {**_default(), **(v if isinstance(v, dict) else {})}
    _cache.update(at=time.monotonic(), v=out)
    return out


def invalidate() -> None:
    _cache.update(at=0.0, v=None)


async def save(db: AsyncSession, enabled: bool, message_fr: str, message_en: str) -> dict:
    cur = await get(db, fresh=True)
    since = (cur.get("since") if cur.get("enabled") else None) or (utcnow().isoformat() + "Z") if enabled else None
    value = {"enabled": enabled, "messageFr": message_fr.strip()[:MAX_MESSAGE], "messageEn": message_en.strip()[:MAX_MESSAGE], "since": since}
    row = await db.get(SystemSetting, KEY)
    if row:
        row.value = value
    else:
        db.add(SystemSetting(key=KEY, value=value))
    await db.commit()
    invalidate()
    return value


async def assert_member_allowed(db: AsyncSession, role: str, path: str) -> None:
    """Appelé pour chaque requête connectée : refuse un membre (rôle USER) pendant la maintenance."""
    if role != "USER" or path.startswith(ALWAYS):
        return
    if (await get(db))["enabled"]:
        raise AppError(503, "MAINTENANCE", "Crushduo est en maintenance. Revenez dans quelques instants.")


async def assert_signup_open(db: AsyncSession) -> None:
    if (await get(db))["enabled"]:
        raise AppError(503, "MAINTENANCE", "Les inscriptions reprendront à la fin de la maintenance.")


def public(v: dict) -> dict:
    return {"maintenance": bool(v["enabled"]), "messageFr": v.get("messageFr") or None, "messageEn": v.get("messageEn") or None, "since": v.get("since")}

"""Sauvegardes de la base (R2) : état, liste, lancement à la demande et téléchargement. Réservé aux administrateurs ; chaque action est journalisée."""
import asyncio
import datetime
import shutil

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, audit
from app.core import backups
from app.core.auth import AuthUser
from app.core.config import get_settings
from app.core.errors import AppError, bad_request, unauthorized
from app.core.ratelimit import limit
from app.core.security import verify_password
from app.db.session import get_db
from app.models.models import User

router = APIRouter(prefix="/admin/backups", tags=["admin"])
_tasks: set[asyncio.Task] = set()  # références conservées : une tâche sans référence peut être arrêtée par le ramasse-miettes


class DownloadIn(BaseModel):
    key: str
    password: str


def _view_status(status: dict) -> dict:
    last_ok = status.get("lastOk")
    age = None
    if last_ok:
        age = (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.datetime.fromisoformat(last_ok["at"])).total_seconds() / 3600
    return {"running": backups.is_running(status), "last": status.get("last"), "lastOk": last_ok, "ageHours": None if age is None else round(age, 1),
            "stale": age is None or age > backups.STALE_HOURS, "staleAfterHours": backups.STALE_HOURS}


@router.get("")
async def overview(_: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    status = _view_status(await backups.get_status(db))
    try:
        client, cfg = await backups.client_and_cfg()
    except RuntimeError:
        return {"configured": False, "toolAvailable": bool(shutil.which("pg_dump")), "status": status, "items": []}
    items = await asyncio.to_thread(backups.list_backups, client, cfg.backups_bucket, cfg.prefix)
    return {"configured": True, "toolAvailable": bool(shutil.which("pg_dump")), "status": status, "items": items}


@router.post("/run", status_code=202, dependencies=[limit(6, 3600)])
async def run_now(a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Lance une sauvegarde complète maintenant (en arrière-plan : l'état est visible dans la liste)."""
    try:
        await backups.client_and_cfg()
    except RuntimeError:
        raise AppError(409, "STORAGE_NOT_CONFIGURED", "Le stockage objet (R2) n'est pas configuré : activez-le dans Stockage") from None
    if not shutil.which("pg_dump"):
        raise AppError(503, "BACKUP_TOOL_MISSING", "L'outil pg_dump n'est pas installé sur ce serveur")
    if backups.is_running(await backups.get_status(db)):
        raise AppError(409, "BACKUP_RUNNING", "Une sauvegarde est déjà en cours")
    await audit(db, a.id, "backup.run", "Backup", None, {"trigger": "manual"})
    await backups.mark_running("manual")
    task = asyncio.create_task(backups.run_and_record("manual", get_settings().database_url))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return {"started": True}


@router.post("/download", dependencies=[limit(5, 3600)])
async def download(body: DownloadIn, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Lien de téléchargement direct (5 minutes). Le mot de passe est redemandé : une sauvegarde contient toutes les données personnelles."""
    user = await db.get(User, a.id)
    if not user or not user.passwordHash:
        raise AppError(403, "PASSWORD_REQUIRED", "Définissez un mot de passe sur votre compte pour télécharger une sauvegarde")
    if not await verify_password(user.passwordHash, body.password):
        await audit(db, a.id, "backup.download.denied", "Backup", None, {"reason": "bad_password"})
        raise unauthorized("INVALID_CREDENTIALS", "Mot de passe incorrect")
    try:
        client, cfg = await backups.client_and_cfg()
    except RuntimeError:
        raise AppError(409, "STORAGE_NOT_CONFIGURED", "Le stockage objet (R2) n'est pas configuré") from None
    known = {b["key"] for b in await asyncio.to_thread(backups.list_backups, client, cfg.backups_bucket, cfg.prefix)}
    if body.key not in known:  # seules les sauvegardes listées sont téléchargeables : jamais une clé arbitraire du bucket
        raise bad_request("BACKUP_NOT_FOUND", "Sauvegarde introuvable")
    url = await asyncio.to_thread(backups.presign, client, cfg.backups_bucket, body.key)
    await audit(db, a.id, "backup.download", "Backup", body.key, {"expiresIn": backups.LINK_SECONDS})
    return {"url": url, "expiresIn": backups.LINK_SECONDS}

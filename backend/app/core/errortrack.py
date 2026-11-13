"""Suivi des erreurs système (Admin › Erreurs système).

Sources : « api » (exception non gérée → réponse 500), « job » (erreur journalisée par une tâche de fond), « web » (erreur dans le navigateur)
et « web-server » (erreur du rendu serveur du site). Les occurrences identiques sont regroupées par empreinte : type + message normalisé + endroit.

Confidentialité : jamais de corps de requête, de cookie ni de chaîne de requête ; les adresses e-mail et les longs jetons sont masqués
dans les messages et les traces. Une erreur résolue qui revient est rouverte et marquée « revenue »."""
from __future__ import annotations

import asyncio
import collections
import datetime
import hashlib
import logging
import os
import re
import traceback

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import utcnow
from app.models.models import SystemError as SysError

log = logging.getLogger("duomatch.errortrack")
SOURCES = ("api", "job", "web", "web-server")
MAX_MESSAGE, MAX_STACK, MAX_PATH, MAX_UA = 500, 6000, 300, 300
RETENTION_DAYS = 30  # une erreur résolue et silencieuse depuis 30 jours est effacée

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_TOKEN = re.compile(r"\b[A-Za-z0-9_-]{24,}\b")
_NUM = re.compile(r"\b\d+\b|\b[0-9a-f]{8,}\b", re.I)


def scrub(text: str | None, limit: int) -> str | None:
    if not text:
        return None
    return _TOKEN.sub("[jeton]", _EMAIL.sub("[e-mail]", text))[:limit]


def clean_path(path: str | None) -> str | None:
    """Chemin sans chaîne de requête ni fragment ; les identifiants deviennent « : id » pour regrouper les mêmes pages."""
    if not path:
        return None
    p = path.split("?")[0].split("#")[0]
    p = re.sub(r"/[0-9a-f]{16,}|/[A-Za-z0-9_-]{20,}", "/:id", p)
    return p[:MAX_PATH]


def fingerprint(source: str, kind: str, message: str, path: str | None) -> str:
    norm = _NUM.sub("#", (message or "")[:200].lower())
    return hashlib.sha1(f"{source}|{kind}|{norm}|{path or ''}".encode()).hexdigest()[:32]


async def record(db: AsyncSession, *, source: str, kind: str, message: str, path: str | None = None, method: str | None = None,
                 status: int | None = None, stack: str | None = None, user_id: str | None = None, user_agent: str | None = None) -> SysError:
    """Enregistre une occurrence (création, ou compteur +1). Une erreur résolue qui réapparaît est rouverte et marquée « revenue »."""
    kind = (kind or "Error")[:120]
    message = scrub(message, MAX_MESSAGE) or "(sans message)"
    path = clean_path(path)
    fp = fingerprint(source, kind, message, path)
    now = utcnow()
    row = (await db.execute(select(SysError).where(SysError.fingerprint == fp))).scalar_one_or_none()
    if row:
        row.count += 1
        row.lastSeenAt = now
        if stack:
            row.stack = scrub(stack, MAX_STACK)
        row.lastUserId = user_id or row.lastUserId
        row.userAgent = scrub(user_agent, MAX_UA) or row.userAgent
        row.release = os.environ.get("RAILWAY_GIT_COMMIT_SHA", "")[:12] or row.release
        if row.resolvedAt:
            row.resolvedAt, row.resolvedById, row.regressed = None, None, True
    else:
        row = SysError(fingerprint=fp, source=source, kind=kind, message=message, path=path, method=method, status=status,
                       stack=scrub(stack, MAX_STACK), userAgent=scrub(user_agent, MAX_UA), lastUserId=user_id,
                       release=os.environ.get("RAILWAY_GIT_COMMIT_SHA", "")[:12] or None, firstSeenAt=now, lastSeenAt=now)
        db.add(row)
    await db.commit()
    return row


async def record_safe(**kw) -> None:
    """Version qui ne lève jamais (appelée depuis le gestionnaire d'erreurs) : le suivi ne doit pas provoquer d'erreur lui-même."""
    try:
        from app.db.session import session_maker

        async with session_maker()() as db:
            await record(db, **kw)
    except Exception:  # noqa: BLE001
        log.warning("erreur non enregistrée dans le suivi", exc_info=False)


def exception_fields(e: BaseException) -> dict:
    return {"kind": type(e).__name__, "message": str(e) or type(e).__name__,
            "stack": "".join(traceback.format_exception(type(e), e, e.__traceback__))[-MAX_STACK:]}


# --- Tâches de fond : un gestionnaire de journal met de côté les erreurs ; une boucle les enregistre (jamais d'écriture dans le journal lui-même). ---
_pending: collections.deque = collections.deque(maxlen=500)


class PendingHandler(logging.Handler):
    """Récupère les messages de niveau ERROR des journaux de l'application (tâches de fond, envoi d'e-mails…)."""

    def emit(self, record: logging.LogRecord) -> None:
        if record.name.startswith("duomatch.errortrack") or getattr(record, "skip_tracking", False):
            return
        try:
            stack = "".join(traceback.format_exception(*record.exc_info)) if record.exc_info else None
            kind = record.exc_info[0].__name__ if record.exc_info and record.exc_info[0] else record.name
            _pending.append({"source": "job", "kind": kind, "message": record.getMessage(), "path": record.name, "stack": stack})
        except Exception:  # noqa: BLE001
            pass


def install_log_capture() -> None:
    root = logging.getLogger("duomatch")
    if not any(isinstance(h, PendingHandler) for h in root.handlers):
        h = PendingHandler(level=logging.ERROR)
        root.addHandler(h)


async def flush(db: AsyncSession) -> int:
    n = 0
    while _pending:
        await record(db, **_pending.popleft())
        n += 1
    return n


async def purge(db: AsyncSession) -> int:
    limit = utcnow() - datetime.timedelta(days=RETENTION_DAYS)
    return (await db.execute(delete(SysError).where(SysError.resolvedAt.is_not(None), SysError.lastSeenAt < limit))).rowcount or 0


async def flush_loop(maker, every: float = 15.0) -> None:
    ticks = 0
    while True:
        try:
            async with maker() as db:
                await flush(db)
                ticks += 1
                if ticks % 240 == 0:  # environ une fois par heure
                    await purge(db)
                    await db.commit()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.warning("enregistrement des erreurs en attente impossible")
        await asyncio.sleep(every)


def view(r: SysError, full: bool = False) -> dict:
    iso = (lambda d: d.isoformat() + "Z" if d else None)
    out = {"id": r.id, "source": r.source, "kind": r.kind, "message": r.message, "path": r.path, "method": r.method, "status": r.status,
           "count": r.count, "regressed": r.regressed, "firstSeenAt": iso(r.firstSeenAt), "lastSeenAt": iso(r.lastSeenAt),
           "resolvedAt": iso(r.resolvedAt), "note": r.note, "release": r.release}
    if full:
        out |= {"stack": r.stack, "userAgent": r.userAgent, "lastUserId": r.lastUserId}
    return out

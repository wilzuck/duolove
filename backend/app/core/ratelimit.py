"""Limitation de débit en mémoire (fenêtre glissante par IP + route). Un seul processus ; plusieurs instances → Redis (voir docs)."""
import time
from collections import defaultdict, deque

from fastapi import Depends, Request

from app.core.config import get_settings
from app.core.errors import AppError

_hits: dict[str, deque] = defaultdict(deque)


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


def reset() -> None:
    _hits.clear()


def _check(key: str, limit: int, ttl: float) -> None:
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > ttl:
        q.popleft()
    if len(q) >= limit:
        raise AppError(429, "RATE_LIMITED", "Trop de requêtes. Réessayez dans un instant.")
    q.append(now)


def limit(max_requests: int, seconds: int = 60, scope: str | None = None):
    """Dépendance de route : au plus `max_requests` appels par fenêtre de `seconds` pour une même IP. Inactive en test.
    `scope` regroupe toutes les variantes d'une route à identifiant dans une seule fenêtre (sans lui, chaque chemin distinct aurait son propre compteur :
    inutile contre quelqu'un qui devine des jetons)."""

    async def _dep(request: Request) -> None:
        if get_settings().node_env == "test":
            return
        _check(f"{client_ip(request)}:{scope}" if scope else f"{client_ip(request)}:{request.method}:{request.url.path}", max_requests, seconds)

    return Depends(_dep)


async def global_limit(request: Request) -> None:
    if get_settings().node_env != "test":
        _check(f"{client_ip(request)}:*", 300, 60)

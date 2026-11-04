"""Temps réel (Socket.IO, compatible avec socket.io-client du web) : salle privée par membre « user:<id> », présence, saisie."""
import logging

import socketio
from sqlalchemy import select

from app.core.auth import SESSION_COOKIE, resolve_session
from app.core.config import get_settings
from app.db.session import session_maker
from app.models.models import Conversation, Match, Profile

log = logging.getLogger("realtime")
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=[get_settings().app_url], logger=False, engineio_logger=False)

# Présence : nombre de sockets ouverts par membre (un seul processus ; plusieurs instances → adaptateur Redis).
_sockets: dict[str, int] = {}
_sid_user: dict[str, str] = {}
on_presence = None  # rappel(user_id) à la première connexion d'un membre (menu Match, sans dépendance circulaire)
# En test, les événements émis sont aussi conservés ici pour les assertions.
emitted: list[tuple[str, str, object]] = []


def _cookie(header: str | None, name: str) -> str | None:
    for part in (header or "").split(";"):
        k, _, v = part.strip().partition("=")
        if k == name:
            from urllib.parse import unquote

            return unquote(v)
    return None


@sio.event
async def connect(sid, environ, auth=None):
    async with session_maker()() as db:
        found = await resolve_session(db, _cookie(environ.get("HTTP_COOKIE"), SESSION_COOKIE))
    if not found or found[1].status.value != "ACTIVE":
        return False
    uid = found[1].id
    _sid_user[sid] = uid
    await sio.enter_room(sid, f"user:{uid}")
    n = _sockets.get(uid, 0)
    _sockets[uid] = n + 1
    if n == 0 and on_presence:
        try:
            await on_presence(uid)
        except Exception:  # Silence assumé : un échec du menu Match ne doit pas refuser la connexion.
            log.exception("presence callback")


@sio.event
async def disconnect(sid, *_):
    uid = _sid_user.pop(sid, None)
    if not uid:
        return
    n = _sockets.get(uid, 1) - 1
    if n <= 0:
        _sockets.pop(uid, None)
    else:
        _sockets[uid] = n


@sio.on("typing")
async def typing(sid, body=None):
    uid = _sid_user.get(sid)
    if not uid or not isinstance(body, dict) or not isinstance(body.get("conversationId"), str):
        return
    async with session_maker()() as db:
        conv = await db.get(Conversation, body["conversationId"])
        match = await db.get(Match, conv.matchId) if conv else None
    if not conv or not match or match.status.value != "ACTIVE" or uid not in (match.userAId, match.userBId):
        return
    other = match.userBId if uid == match.userAId else match.userAId
    async with session_maker()() as db:
        # Réciproque : si l'une des deux personnes a désactivé l'indicateur de saisie, personne ne voit l'autre écrire.
        on = (await db.execute(select(Profile.typingIndicator).where(Profile.userId.in_([uid, other])))).scalars().all()
    if len(on) < 2 or not all(on):
        return
    await emit_to_user(other, "typing", {"conversationId": conv.id, "isTyping": bool(body.get("isTyping"))})


def online_ids() -> list[str]:
    return list(_sockets)


async def emit_to_user(user_id: str, event: str, payload: object) -> None:
    if get_settings().node_env == "test":
        emitted.append((user_id, event, payload))
    await sio.emit(event, payload, room=f"user:{user_id}")

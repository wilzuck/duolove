"""Messagerie : conversations, messages, images (flag chat_images), pièces jointes privées."""
from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import chat_service as chat
from app.core import icebreakers
from app.core import entitlements
from app.core.auth import AuthUser, verified_user
from app.core.errors import AppError, bad_request, forbidden
from app.core.flags import require_flag
from app.db.session import get_db

router = APIRouter(tags=["conversations"])
MAX_IMAGE = 6 * 1024 * 1024


class MessageIn(BaseModel):
    body: str
    replyToId: str | None = None

    @field_validator("body")
    @classmethod
    def _body(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 2000:
            raise ValueError("invalid_length")
        return v


@router.get("/conversations")
async def list_conversations(q: str | None = None, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await chat.list_conversations(db, u.id, q)


@router.get("/conversations/attachments/{attachment_id}")
async def attachment(attachment_id: str, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    """Pièce jointe privée : servie uniquement aux deux membres de la conversation."""
    data = await chat.attachment(db, u.id, attachment_id)
    return Response(data, media_type="image/webp", headers={"Cache-Control": "private, max-age=3600"})


@router.get("/conversations/{conversation_id}/messages")
async def history(conversation_id: str, cursor: str | None = None, limit: str = Query("30"),
                  u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    try:
        n = int(limit)
    except ValueError:
        n = 0
    return await chat.history(db, u.id, conversation_id, min(max(n or 30, 1), 100), cursor)


@router.post("/conversations/{conversation_id}/messages", status_code=201)
async def send(conversation_id: str, body: MessageIn, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await chat.send(db, u.id, conversation_id, body.body, body.replyToId)


@router.post("/conversations/{conversation_id}/images", status_code=201, dependencies=[require_flag("chat_images")])
async def image(conversation_id: str, file: UploadFile | None = File(None), u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    # Photos dans les messages : réservées aux formules qui l'incluent (fonctionnalité `chat_images_enabled`, réglable en administration).
    if not (await entitlements.get(db, u.id))["limits"]["chatImages"]:
        raise forbidden("PLAN_REQUIRED", "L’envoi de photos est réservé aux abonnés Premium et VIP")
    if file is None:
        raise bad_request("FILE_REQUIRED")
    data = await file.read(MAX_IMAGE + 1)
    if len(data) > MAX_IMAGE:
        raise AppError(413, "PAYLOAD_TOO_LARGE", "Fichier trop volumineux")
    return await chat.send_image(db, u.id, conversation_id, data)


@router.post("/conversations/{conversation_id}/read")
async def read(conversation_id: str, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await chat.mark_read(db, u.id, conversation_id)


class ReactionIn(BaseModel):
    emoji: str


@router.put("/messages/{message_id}/reaction")
async def react(message_id: str, body: ReactionIn, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await chat.react(db, u.id, message_id, body.emoji)


@router.delete("/messages/{message_id}/reaction")
async def unreact(message_id: str, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await chat.unreact(db, u.id, message_id)


@router.get("/conversations/{conversation_id}/icebreakers", dependencies=[require_flag("icebreakers")])
async def icebreakers_for(conversation_id: str, seed: int = Query(0, ge=0, le=1000), locale: str = Query("fr", pattern="^(fr|en)$"),
                          u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    """« Besoin d'une idée pour commencer ? » : sujets déduits des éléments communs. Rien n'est envoyé : le membre choisit et édite le texte."""
    if not (await entitlements.get(db, u.id))["limits"]["chatSuggestions"]:
        raise forbidden("PLAN_REQUIRED", "Les idées pour briser la glace sont réservées aux abonnés Premium et VIP")
    return await icebreakers.suggestions(db, u.id, conversation_id, seed, locale)


@router.delete("/messages/{message_id}")
async def remove(message_id: str, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await chat.delete_message(db, u.id, message_id)

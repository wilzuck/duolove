"""Messagerie : conversations, messages, pièces jointes d'images. Miroir de chat/chat.service.ts."""
import time
from collections import defaultdict

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import notifications, realtime, storage
from app.core.config import get_settings
from app.core.errors import AppError, forbidden, not_found
from app.core.ids import new_id, utcnow
from app.core.jsonfmt import iso
from app.core.profile_card import photo_url, thumb_key
from app.models.models import Block, Conversation, Match, Message, MessageAttachment, Profile, ProfilePhoto, User

MSG_PER_MINUTE = 30
_send_log: dict[str, list[float]] = defaultdict(list)


def allow_send(user_id: str, now: float | None = None) -> bool:
    """Limiteur anti-spam par utilisateur (fenêtre glissante, en mémoire — à déplacer dans Redis en multi-instances)."""
    t = now if now is not None else time.time()
    recent = [x for x in _send_log[user_id] if t - x < 60]
    if len(recent) >= MSG_PER_MINUTE:
        _send_log[user_id] = recent
        return False
    recent.append(t)
    _send_log[user_id] = recent
    return True


def reset_send_log() -> None:
    _send_log.clear()


async def membership(db: AsyncSession, user_id: str, conversation_id: str):
    """Charge la conversation et vérifie que `user_id` en est membre (contrôle objet par objet)."""
    row = (await db.execute(
        select(Conversation, Match).join(Match, Match.id == Conversation.matchId).where(Conversation.id == conversation_id)
    )).first()
    if not row:
        raise not_found("CONVERSATION_NOT_FOUND")
    conv, match = row
    if user_id not in (match.userAId, match.userBId):
        raise not_found("CONVERSATION_NOT_FOUND")  # 404 : ne révèle pas l'existence
    return conv, (match.userBId if user_id == match.userAId else match.userAId), match.status.value == "ACTIVE"


async def _assert_can_send(db: AsyncSession, user_id: str, other_id: str, active: bool) -> None:
    closed = forbidden("CONVERSATION_CLOSED", "Cette conversation est fermée")
    if not active:
        raise closed
    block = (await db.execute(select(Block.id).where(or_(
        and_(Block.blockerId == user_id, Block.blockedId == other_id), and_(Block.blockerId == other_id, Block.blockedId == user_id))).limit(1))).first()
    if block:
        raise closed
    status = (await db.execute(select(User.status).where(User.id == other_id))).scalar_one_or_none()
    if status is None or status.value != "ACTIVE":
        raise closed


def _serialize(m: Message, atts: list[MessageAttachment], viewer_id: str, read_receipts_of_reader: bool) -> dict:
    mine = m.senderId == viewer_id
    return {
        "id": m.id, "conversationId": m.conversationId, "senderId": m.senderId, "mine": mine,
        "body": None if m.deletedAt else m.body, "deleted": bool(m.deletedAt), "createdAt": iso(m.createdAt),
        # Indicateur de lecture : exposé à l'expéditeur seulement si le lecteur l'autorise.
        "readAt": iso(m.readAt) if (mine and read_receipts_of_reader and m.readAt) else None,
        "attachments": [] if m.deletedAt else [
            {"id": a.id, "url": f"{get_settings().api_url}/api/conversations/attachments/{a.id}", "mime": a.mime} for a in atts],
    }


async def _read_receipts(db: AsyncSession, user_id: str) -> bool | None:
    return (await db.execute(select(Profile.readReceipts).where(Profile.userId == user_id))).scalar_one_or_none()


async def _persist(db: AsyncSession, user_id: str, conversation_id: str, other_id: str, body: str, attachments: list[dict]) -> dict:
    msg = Message(conversationId=conversation_id, senderId=user_id, body=body)
    db.add(msg)
    await db.flush()
    atts = [MessageAttachment(messageId=msg.id, **a) for a in attachments]
    db.add_all(atts)
    await db.execute(update(Conversation).where(Conversation.id == conversation_id).values(lastMessageAt=msg.createdAt))
    await db.commit()
    sender_rr = await _read_receipts(db, user_id)
    for_sender = _serialize(msg, atts, user_id, True)
    await realtime.emit_to_user(other_id, "message:new", {**_serialize(msg, atts, other_id, True if sender_rr is None else sender_rr), "fromUserId": user_id})
    await realtime.emit_to_user(user_id, "message:new", for_sender)
    await notifications.create(db, other_id, "MESSAGE", {"conversationId": conversation_id, "fromUserId": user_id})
    return for_sender


async def send(db: AsyncSession, user_id: str, conversation_id: str, body: str) -> dict:
    conv, other_id, active = await membership(db, user_id, conversation_id)
    await _assert_can_send(db, user_id, other_id, active)
    if not allow_send(user_id):
        raise AppError(429, "RATE_LIMITED", "Vous écrivez trop vite")
    return await _persist(db, user_id, conv.id, other_id, body, [])


async def send_image(db: AsyncSession, user_id: str, conversation_id: str, file: bytes) -> dict:
    """Le décodage serveur valide le format, supprime les métadonnées et redimensionne."""
    conv, other_id, active = await membership(db, user_id, conversation_id)
    await _assert_can_send(db, user_id, other_id, active)
    if not allow_send(user_id):
        raise AppError(429, "RATE_LIMITED", "Vous écrivez trop vite")
    img = await storage.process_image(file)
    key = f"private/chat/{new_id()}.webp"
    await storage.put(key, img.full)
    return await _persist(db, user_id, conv.id, other_id, "", [{"key": key, "mime": "image/webp", "size": len(img.full), "moderationStatus": "APPROVED"}])


async def attachment(db: AsyncSession, user_id: str, attachment_id: str) -> bytes:
    row = (await db.execute(
        select(MessageAttachment, Message.deletedAt, Match.userAId, Match.userBId)
        .join(Message, Message.id == MessageAttachment.messageId)
        .join(Conversation, Conversation.id == Message.conversationId)
        .join(Match, Match.id == Conversation.matchId)
        .where(MessageAttachment.id == attachment_id)
    )).first()
    if not row or row.deletedAt or row[0].moderationStatus.value == "REJECTED":
        raise not_found()
    if user_id not in (row.userAId, row.userBId):
        raise not_found()
    data = await storage.get(row[0].key)
    if data is None:
        raise not_found()
    return data


async def _attachments_of(db: AsyncSession, message_ids: list[str]) -> dict[str, list[MessageAttachment]]:
    out: dict[str, list[MessageAttachment]] = defaultdict(list)
    if message_ids:
        for a in (await db.execute(select(MessageAttachment).where(MessageAttachment.messageId.in_(message_ids)))).scalars():
            out[a.messageId].append(a)
    return out


async def history(db: AsyncSession, user_id: str, conversation_id: str, limit: int, cursor: str | None = None) -> dict:
    conv, other_id, _ = await membership(db, user_id, conversation_id)
    other_rr, me_rr = await _read_receipts(db, other_id), await _read_receipts(db, user_id)
    q = select(Message).where(Message.conversationId == conv.id)
    if cursor:
        c = (await db.execute(select(Message.createdAt, Message.id).where(Message.id == cursor))).first()
        if not c:
            return {"items": [], "nextCursor": None, "readReceipts": True if me_rr is None else me_rr}
        q = q.where(or_(Message.createdAt < c.createdAt, and_(Message.createdAt == c.createdAt, Message.id < c.id)))
    rows = (await db.execute(q.order_by(Message.createdAt.desc(), Message.id.desc()).limit(limit + 1))).scalars().all()
    page = rows[:limit]
    atts = await _attachments_of(db, [m.id for m in page])
    rr = True if other_rr is None else other_rr
    return {
        "items": [_serialize(m, atts.get(m.id, []), user_id, rr) for m in reversed(page)],
        "nextCursor": page[-1].id if len(rows) > limit else None,
        "readReceipts": True if me_rr is None else me_rr,
    }


async def mark_read(db: AsyncSession, user_id: str, conversation_id: str) -> dict:
    conv, other_id, _ = await membership(db, user_id, conversation_id)
    r = await db.execute(update(Message).where(Message.conversationId == conv.id, Message.senderId == other_id, Message.readAt.is_(None)).values(readAt=utcnow()))
    await db.commit()
    me_rr = await _read_receipts(db, user_id)
    if r.rowcount and me_rr:
        await realtime.emit_to_user(other_id, "message:read", {"conversationId": conv.id})
    return {"read": r.rowcount}


async def delete_message(db: AsyncSession, user_id: str, message_id: str) -> dict:
    row = (await db.execute(
        select(Message, Match.userAId, Match.userBId).join(Conversation, Conversation.id == Message.conversationId)
        .join(Match, Match.id == Conversation.matchId).where(Message.id == message_id)
    )).first()
    if not row or row[0].senderId != user_id:
        raise not_found("MESSAGE_NOT_FOUND")  # seul l'auteur supprime
    m = row[0]
    m.deletedAt, m.body = utcnow(), ""
    await db.commit()
    await realtime.emit_to_user(row.userBId if user_id == row.userAId else row.userAId, "message:deleted", {"conversationId": m.conversationId, "messageId": m.id})
    return {"ok": True}


async def list_conversations(db: AsyncSession, user_id: str, q: str | None = None) -> list[dict]:
    """Conversations actives avec aperçu, non-lus et recherche (nom ou contenu des messages)."""
    term = (q or "").strip()
    rows = (await db.execute(
        select(Match, Conversation).join(Conversation, Conversation.matchId == Match.id)
        .where(Match.status == "ACTIVE", or_(Match.userAId == user_id, Match.userBId == user_id))
    )).all()
    other_of = lambda m: m.userBId if m.userAId == user_id else m.userAId  # noqa: E731
    other_ids = [other_of(m) for m, _ in rows]
    if not other_ids:
        return []
    profiles = {p.userId: p for p in (await db.execute(
        select(Profile).join(User, User.id == Profile.userId).where(Profile.userId.in_(other_ids), User.status == "ACTIVE"))).scalars()}
    first_photo: dict[str, str] = {}
    prof_ids = {p.id: p.userId for p in profiles.values()}
    if prof_ids:
        for ph in (await db.execute(select(ProfilePhoto).where(ProfilePhoto.profileId.in_(list(prof_ids)), ProfilePhoto.moderationStatus != "REJECTED")
                                    .order_by(ProfilePhoto.position))).scalars():
            first_photo.setdefault(prof_ids[ph.profileId], ph.key)
    blocks = (await db.execute(select(Block).where(or_(
        and_(Block.blockerId == user_id, Block.blockedId.in_(other_ids)), and_(Block.blockedId == user_id, Block.blockerId.in_(other_ids)))))).scalars().all()
    blocked = {x for b in blocks for x in (b.blockerId, b.blockedId)}

    matched_convs: set[str] | None = None
    if term:
        esc = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        matched_convs = set((await db.execute(
            select(Message.conversationId).where(Message.deletedAt.is_(None), Message.body.ilike(f"%{esc}%", escape="\\"),
                                                 Message.conversationId.in_([c.id for _, c in rows])).distinct())).scalars())

    items = []
    for m, conv in rows:
        oid = other_of(m)
        p = profiles.get(oid)
        if not p or oid in blocked:
            continue
        if term and term.lower() not in p.displayName.lower() and conv.id not in (matched_convs or set()):
            continue
        last = (await db.execute(select(Message).where(Message.conversationId == conv.id).order_by(Message.createdAt.desc()).limit(1))).scalar_one_or_none()
        has_image = False
        if last:
            has_image = (await db.execute(select(func.count()).select_from(MessageAttachment).where(MessageAttachment.messageId == last.id))).scalar_one() > 0
        unread = (await db.execute(select(func.count()).select_from(Message).where(
            Message.conversationId == conv.id, Message.senderId == oid, Message.readAt.is_(None), Message.deletedAt.is_(None)))).scalar_one()
        sort_at = (conv.lastMessageAt or m.createdAt)
        items.append((sort_at, {
            "id": conv.id, "matchId": m.id, "createdAt": iso(m.createdAt),
            "user": {"id": oid, "displayName": p.displayName, "verified": p.verified,
                     "thumbUrl": photo_url(thumb_key(first_photo[oid])) if oid in first_photo else None},
            "lastMessage": {"body": None if last.deletedAt else last.body, "hasImage": has_image, "mine": last.senderId == user_id,
                            "createdAt": iso(last.createdAt)} if last else None,
            "unread": unread,
        }))
    items.sort(key=lambda x: x[0], reverse=True)
    return [i[1] for i in items]

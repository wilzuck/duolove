"""Messagerie : conversations, messages, pièces jointes d'images. Miroir de chat/chat.service.ts."""
import time
from collections import defaultdict

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import entitlements, flags, notifications, realtime, storage
from app.core.config import get_settings
from app.core.constants import REACTION_EMOJIS
from app.core.errors import AppError, forbidden, not_found
from app.core.ids import new_id, utcnow
from app.core.jsonfmt import iso
from app.core.profile_card import photo_url, thumb_key
from app.models.models import Block, Conversation, Match, Message, MessageAttachment, MessageReaction, Profile, ProfilePhoto, User

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


def _serialize(m: Message, atts: list[MessageAttachment], viewer_id: str, read_receipts_of_reader: bool, extra: dict | None = None) -> dict:
    mine = m.senderId == viewer_id
    extra = extra or {}
    return {
        "replyTo": None if m.deletedAt else extra.get("replyTo"), "reactions": [] if m.deletedAt else extra.get("reactions", []),
        "id": m.id, "conversationId": m.conversationId, "senderId": m.senderId, "mine": mine,
        "body": None if m.deletedAt else m.body, "deleted": bool(m.deletedAt), "createdAt": iso(m.createdAt),
        # Indicateur de lecture : exposé à l'expéditeur seulement si le lecteur l'autorise.
        "readAt": iso(m.readAt) if (mine and read_receipts_of_reader and m.readAt) else None,
        "attachments": [] if m.deletedAt else [
            {"id": a.id, "url": f"{get_settings().api_url}/api/conversations/attachments/{a.id}", "mime": a.mime} for a in atts],
    }


async def _decorate(db: AsyncSession, msgs: list[Message], viewer_id: str) -> dict[str, dict]:
    """Réponses citées et réactions de chaque message, vues par `viewer_id` (le « mine » des réactions dépend du lecteur).
    Coupé par feature flag : un flag éteint masque l'affichage sans rien supprimer."""
    out: dict[str, dict] = {m.id: {} for m in msgs}
    if await flags.is_on(db, "message_replies"):
        ids = {m.replyToId for m in msgs if m.replyToId}
        if ids:
            targets = {t.id: t for t in (await db.execute(select(Message).where(Message.id.in_(ids)))).scalars()}
            has_img = set((await db.execute(select(MessageAttachment.messageId).where(MessageAttachment.messageId.in_(ids)))).scalars())
            for m in msgs:
                t = targets.get(m.replyToId) if m.replyToId else None
                if t:
                    out[m.id]["replyTo"] = {"id": t.id, "mine": t.senderId == viewer_id, "deleted": bool(t.deletedAt),
                                            "body": None if t.deletedAt else (t.body[:140] or None), "hasImage": t.id in has_img and not t.deletedAt}
    if await flags.is_on(db, "message_reactions") and msgs:
        rows = (await db.execute(select(MessageReaction.messageId, MessageReaction.emoji, MessageReaction.userId).where(MessageReaction.messageId.in_([m.id for m in msgs])))).all()
        per: dict[str, dict[str, list[str]]] = {}
        for mid, emoji, uid in rows:
            per.setdefault(mid, {}).setdefault(emoji, []).append(uid)
        for mid, by in per.items():
            out[mid]["reactions"] = [{"emoji": e, "count": len(u), "mine": viewer_id in u} for e, u in sorted(by.items(), key=lambda kv: REACTION_EMOJIS.index(kv[0]) if kv[0] in REACTION_EMOJIS else 99)]
    return out


async def _read_receipts(db: AsyncSession, user_id: str) -> bool | None:
    """Accusés de lecture effectifs : un réglage « désactivé » ne vaut que tant que la formule inclut la gestion des accusés
    (après une résiliation, les accusés redeviennent actifs sans qu'aucun réglage soit perdu)."""
    rr = (await db.execute(select(Profile.readReceipts).where(Profile.userId == user_id))).scalar_one_or_none()
    if rr is False and not (await entitlements.get(db, user_id))["limits"]["readReceiptsControl"]:
        return True
    return rr


async def _persist(db: AsyncSession, user_id: str, conversation_id: str, other_id: str, body: str, attachments: list[dict], reply_to_id: str | None = None) -> dict:
    msg = Message(conversationId=conversation_id, senderId=user_id, body=body, replyToId=reply_to_id)
    db.add(msg)
    await db.flush()
    atts = [MessageAttachment(messageId=msg.id, **a) for a in attachments]
    db.add_all(atts)
    await db.execute(update(Conversation).where(Conversation.id == conversation_id).values(lastMessageAt=msg.createdAt))
    await db.commit()
    sender_rr = await _read_receipts(db, user_id)
    for_sender = _serialize(msg, atts, user_id, True, (await _decorate(db, [msg], user_id))[msg.id])
    await realtime.emit_to_user(other_id, "message:new", {**_serialize(msg, atts, other_id, True if sender_rr is None else sender_rr, (await _decorate(db, [msg], other_id))[msg.id]), "fromUserId": user_id})
    await realtime.emit_to_user(user_id, "message:new", for_sender)
    await notifications.create(db, other_id, "MESSAGE", {"conversationId": conversation_id, "fromUserId": user_id})
    return for_sender


async def send(db: AsyncSession, user_id: str, conversation_id: str, body: str, reply_to_id: str | None = None) -> dict:
    conv, other_id, active = await membership(db, user_id, conversation_id)
    await _assert_can_send(db, user_id, other_id, active)
    if reply_to_id:
        await flags.assert_on(db, "message_replies")
        target = (await db.execute(select(Message.id).where(Message.id == reply_to_id, Message.conversationId == conv.id))).first()
        if not target:
            raise AppError(400, "INVALID_REPLY", "Le message cité n'appartient pas à cette conversation")
    if not allow_send(user_id):
        raise AppError(429, "RATE_LIMITED", "Vous écrivez trop vite")
    return await _persist(db, user_id, conv.id, other_id, body, [], reply_to_id)


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
    deco = await _decorate(db, page, user_id)
    return {
        "items": [_serialize(m, atts.get(m.id, []), user_id, rr, deco[m.id]) for m in reversed(page)],
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


async def _message_context(db: AsyncSession, user_id: str, message_id: str):
    row = (await db.execute(select(Message.conversationId).where(Message.id == message_id))).first()
    if not row:
        raise not_found("MESSAGE_NOT_FOUND")
    conv, other_id, active = await membership(db, user_id, row[0])  # 404 si non membre : ne révèle pas l'existence
    msg = await db.get(Message, message_id)
    return msg, conv, other_id, active


async def _reaction_summary(db: AsyncSession, msg: Message, viewer_id: str) -> list[dict]:
    return (await _decorate(db, [msg], viewer_id))[msg.id].get("reactions", [])


async def react(db: AsyncSession, user_id: str, message_id: str, emoji: str) -> dict:
    """Une réaction par membre et par message (remplacée si on en choisit une autre) ; emoji limité au jeu fermé du serveur."""
    await flags.assert_on(db, "message_reactions")
    if emoji not in REACTION_EMOJIS:
        raise AppError(400, "INVALID_REACTION", "Réaction non autorisée", {"allowed": list(REACTION_EMOJIS)})
    msg, conv, other_id, active = await _message_context(db, user_id, message_id)
    if msg.deletedAt:
        raise not_found("MESSAGE_NOT_FOUND")
    await _assert_can_send(db, user_id, other_id, active)
    row = (await db.execute(select(MessageReaction).where(MessageReaction.messageId == message_id, MessageReaction.userId == user_id))).scalar_one_or_none()
    if row:
        row.emoji = emoji
    else:
        db.add(MessageReaction(messageId=message_id, userId=user_id, emoji=emoji))
    await db.commit()
    return await _emit_reactions(db, msg, user_id, other_id)


async def unreact(db: AsyncSession, user_id: str, message_id: str) -> dict:
    await flags.assert_on(db, "message_reactions")
    msg, conv, other_id, _ = await _message_context(db, user_id, message_id)
    await db.execute(MessageReaction.__table__.delete().where(MessageReaction.messageId == message_id, MessageReaction.userId == user_id))
    await db.commit()
    return await _emit_reactions(db, msg, user_id, other_id)


async def _emit_reactions(db: AsyncSession, msg: Message, user_id: str, other_id: str) -> dict:
    await realtime.emit_to_user(other_id, "message:reaction", {"conversationId": msg.conversationId, "messageId": msg.id, "reactions": await _reaction_summary(db, msg, other_id)})
    return {"messageId": msg.id, "reactions": await _reaction_summary(db, msg, user_id)}


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

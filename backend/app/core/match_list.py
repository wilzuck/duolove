"""Liste des conversations actives (GET /matches) : aperçu, non-lus, filtrage des membres bloqués ou inactifs."""
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.profile_card import photo_url, thumb_key
from app.models.models import Block, Conversation, Match, Message, MessageAttachment, Profile, ProfilePhoto, User


async def list_conversations(db: AsyncSession, user_id: str, q: str | None = None) -> list[dict]:
    term = (q or "").strip() or None
    rows = (await db.execute(
        select(Match, Conversation).join(Conversation, Conversation.matchId == Match.id)
        .where(Match.status == "ACTIVE", or_(Match.userAId == user_id, Match.userBId == user_id))
    )).all()
    other_ids = [m.userBId if m.userAId == user_id else m.userAId for m, _ in rows]
    if not rows:
        return []
    profiles = {p.userId: p for p in (await db.execute(
        select(Profile).join(User, User.id == Profile.userId).where(Profile.userId.in_(other_ids), User.status == "ACTIVE")
    )).scalars().all()}
    blocks = (await db.execute(select(Block).where(or_(
        (Block.blockerId == user_id) & Block.blockedId.in_(other_ids), (Block.blockedId == user_id) & Block.blockerId.in_(other_ids))))).scalars().all()
    blocked = {x for b in blocks for x in (b.blockerId, b.blockedId)}
    thumbs: dict[str, str] = {}
    pids = [p.id for p in profiles.values()]
    if pids:
        for ph in (await db.execute(select(ProfilePhoto).where(ProfilePhoto.profileId.in_(pids), ProfilePhoto.moderationStatus != "REJECTED").order_by(ProfilePhoto.position))).scalars():
            thumbs.setdefault(ph.profileId, ph.key)
    matched_convs = None
    if term:
        like = f"%{term.replace('%', r'\%').replace('_', r'\_')}%"
        matched_convs = set((await db.execute(
            select(Message.conversationId).where(Message.deletedAt.is_(None), Message.body.ilike(like), Message.conversationId.in_([c.id for _, c in rows])).distinct()
        )).scalars().all())
    items = []
    for m, conv in rows:
        other = m.userBId if m.userAId == user_id else m.userAId
        p = profiles.get(other)
        if not p or other in blocked:
            continue
        if term and term.lower() not in p.displayName.lower() and conv.id not in (matched_convs or set()):
            continue
        last = (await db.execute(select(Message).where(Message.conversationId == conv.id).order_by(Message.createdAt.desc()).limit(1))).scalar_one_or_none()
        has_img = bool(last and (await db.execute(select(MessageAttachment.id).where(MessageAttachment.messageId == last.id).limit(1))).first())
        unread = (await db.execute(select(func.count()).select_from(Message).where(
            Message.conversationId == conv.id, Message.senderId == other, Message.readAt.is_(None), Message.deletedAt.is_(None)))).scalar_one()
        key = thumbs.get(p.id)
        items.append(({
            "id": conv.id, "matchId": m.id, "createdAt": m.createdAt,
            "user": {"id": other, "displayName": p.displayName, "verified": p.verified, "thumbUrl": photo_url(thumb_key(key)) if key else None},
            "lastMessage": None if not last else {"body": None if last.deletedAt else last.body, "hasImage": has_img, "mine": last.senderId == user_id, "createdAt": last.createdAt},
            "unread": unread,
        }, (conv.lastMessageAt or m.createdAt)))
    items.sort(key=lambda x: x[1], reverse=True)
    return [i for i, _ in items]

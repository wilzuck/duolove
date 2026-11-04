"""Décisions (like / passer / super like), retour arrière, likes reçus et envoyés."""
import datetime

from sqlalchemy import and_, delete, exists, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core import credits, entitlements, notifications, realtime
from app.core.errors import AppError, forbidden, not_found
from app.core.ids import utcnow
from app.core.profile_card import load_cards, to_card
from app.models.models import Block, Conversation, Match, Profile, Swipe, User


def _v(x):
    return getattr(x, "value", x)


def start_of_day() -> datetime.datetime:
    return utcnow().replace(hour=0, minute=0, second=0, microsecond=0)


def start_of_week() -> datetime.datetime:
    """Début de semaine ISO (lundi 00:00 UTC) : les Super Likes inclus se comptent par semaine."""
    d = start_of_day()
    return d - datetime.timedelta(days=d.weekday())


def order_pair(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


def _no_blocks(user_id: str, other_col):
    return and_(~exists().where(Block.blockerId == user_id, Block.blockedId == other_col),
                ~exists().where(Block.blockerId == other_col, Block.blockedId == user_id))


async def usage(db: AsyncSession, user_id: str) -> dict:
    likes = (await db.execute(select(func.count()).select_from(Swipe).where(Swipe.giverId == user_id, Swipe.action == "LIKE", Swipe.createdAt >= start_of_day()))).scalar_one()
    sl = (await db.execute(select(func.count()).select_from(Swipe).where(Swipe.giverId == user_id, Swipe.action == "SUPER_LIKE", Swipe.createdAt >= start_of_week()))).scalar_one()
    return {"likes": likes, "superLikesWeek": sl}


async def _assert_quota(db: AsyncSession, user_id: str, action: str) -> None:
    if action == "PASS":
        return
    limits = (await entitlements.get(db, user_id))["limits"]
    used = await usage(db, user_id)
    if action == "SUPER_LIKE":
        if used["superLikesWeek"] >= limits["superLikesWeekly"] and (await credits.balances(db, user_id))["SUPER_LIKE"] < 1:
            raise forbidden("NO_SUPER_LIKES", "Plus de Super Likes : achetez un pack ou passez Premium")
    elif used["likes"] >= limits["dailyLikes"]:
        raise forbidden("DAILY_LIMIT", "Limite quotidienne de likes atteinte")


async def swipe(db: AsyncSession, user_id: str, target_id: str, action: str) -> dict:
    """Idempotent : rejouer la même requête ne crée ni doublon ni second match. La paire est verrouillée (advisory lock)
    pour que deux likes simultanés A→B et B→A produisent exactement un match."""
    if target_id == user_id:
        raise AppError(400, "INVALID_TARGET")
    target = (await db.execute(
        select(Profile.userId).join(User, User.id == Profile.userId)
        .where(Profile.userId == target_id, Profile.onboardedAt.is_not(None), User.status == "ACTIVE", _no_blocks(user_id, Profile.userId))
    )).first()
    if not target:
        raise not_found("PROFILE_NOT_FOUND")
    existing = (await db.execute(select(Swipe.id).where(Swipe.giverId == user_id, Swipe.targetId == target_id))).first()
    ent = await entitlements.get(db, user_id)
    if not existing:
        await _assert_quota(db, user_id, action)

    a, b = order_pair(user_id, target_id)
    await db.commit()  # termine la transaction de lecture ; la suivante commence par le verrou
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"{a}:{b}"})
    prior = (await db.execute(select(Swipe).where(Swipe.giverId == user_id, Swipe.targetId == target_id))).scalar_one_or_none()
    sw = prior
    if not prior:
        sw = Swipe(giverId=user_id, targetId=target_id, action=action)
        db.add(sw)
        await db.flush()
        # Super Like au-delà du quota hebdomadaire inclus : un crédit acheté est consommé DANS cette transaction
        # (si la suite échoue, le crédit n'est pas débité ; un rejeu ne le débite pas deux fois).
        if action == "SUPER_LIKE":
            used = (await db.execute(select(func.count()).select_from(Swipe).where(
                Swipe.giverId == user_id, Swipe.action == "SUPER_LIKE", Swipe.createdAt >= start_of_week(), Swipe.id != sw.id))).scalar_one()
            if used >= ent["limits"]["superLikesWeekly"]:
                await credits.consume(db, user_id, "SUPER_LIKE", 1, sw.id)
    match = conv = None
    if _v(sw.action) != "PASS":
        rev = (await db.execute(select(Swipe).where(Swipe.giverId == target_id, Swipe.targetId == user_id))).scalar_one_or_none()
        if rev and _v(rev.action) != "PASS":
            match = (await db.execute(select(Match).where(Match.userAId == a, Match.userBId == b))).scalar_one_or_none()
            if not match:
                match = Match(userAId=a, userBId=b)
                db.add(match)
                await db.flush()
                conv = Conversation(matchId=match.id)
                db.add(conv)
                await db.flush()
            else:
                conv = (await db.execute(select(Conversation).where(Conversation.matchId == match.id))).scalar_one_or_none()
                if not conv:
                    conv = Conversation(matchId=match.id)
                    db.add(conv)
                    await db.flush()
    created = not prior
    swipe_action = _v(sw.action)
    match_id, conv_id = (match.id, conv.id) if match else (None, None)
    await db.commit()

    # Effets de bord uniquement à la première prise en compte (idempotence).
    if created and action != "PASS":
        if match_id:
            md = {"matchId": match_id, "conversationId": conv_id}
            await notifications.create(db, user_id, "MATCH", {**md, "userId": target_id})
            await notifications.create(db, target_id, "MATCH", {**md, "userId": user_id})
            await realtime.emit_to_user(user_id, "match:new", {**md, "userId": target_id})
            await realtime.emit_to_user(target_id, "match:new", {**md, "userId": user_id})
        else:
            await notifications.create(db, target_id, "LIKE", {"fromUserId": user_id, "superLike": action == "SUPER_LIKE"})

    matched_profile = None
    if match_id:
        p = (await db.execute(select(Profile).where(Profile.userId == target_id))).scalar_one_or_none()
        matched_profile = to_card((await load_cards(db, [p]))[0]) if p else None
    return {"action": swipe_action, "matched": bool(match_id),
            "match": {"id": match_id, "conversationId": conv_id, "user": matched_profile} if match_id else None}


async def rewind(db: AsyncSession, user_id: str) -> dict:
    """Premium : annule le dernier « passer » (moins de 24 h) et renvoie le profil."""
    limits = (await entitlements.get(db, user_id))["limits"]
    if not limits["rewind"]:
        raise forbidden("PLAN_REQUIRED", "Retour arrière réservé à Premium")
    last = (await db.execute(select(Swipe).where(Swipe.giverId == user_id).order_by(Swipe.createdAt.desc()).limit(1))).scalar_one_or_none()
    if not last or _v(last.action) != "PASS" or utcnow() - last.createdAt > datetime.timedelta(hours=24):
        raise AppError(409, "NOTHING_TO_REWIND", "Aucune décision à annuler")
    target_id = last.targetId
    await db.delete(last)
    await db.commit()
    p = (await db.execute(select(Profile).join(User, User.id == Profile.userId).where(Profile.userId == target_id, User.status == "ACTIVE", _no_blocks(user_id, Profile.userId)))).scalar_one_or_none()
    return {"profile": to_card((await load_cards(db, [p]))[0]) if p else None}


def _after(q, cursor_row, model):
    if cursor_row is None:
        return q
    return q.where(or_(model.createdAt < cursor_row.createdAt, and_(model.createdAt == cursor_row.createdAt, model.id < cursor_row.id)))


async def sent(db: AsyncSession, user_id: str, cursor: str | None = None, limit: int = 20) -> dict:
    """Personnes que J'AI likées (likes envoyés), avec l'état du match."""
    q = (select(Swipe).join(User, User.id == Swipe.targetId)
         .where(Swipe.giverId == user_id, Swipe.action.in_(["LIKE", "SUPER_LIKE"]), User.status == "ACTIVE", _no_blocks(user_id, Swipe.targetId)))
    cur = await db.get(Swipe, cursor) if cursor else None
    rows = (await db.execute(_after(q, cur, Swipe).order_by(Swipe.createdAt.desc(), Swipe.id.desc()).limit(limit + 1))).scalars().all()
    page = rows[:limit]
    ids = [r.targetId for r in page]
    profiles = {p.userId: p for p in (await db.execute(select(Profile).where(Profile.userId.in_(ids)))).scalars().all()} if ids else {}
    cards = {c.profile.userId: c for c in await load_cards(db, list(profiles.values()))}
    matches = (await db.execute(
        select(Match, Conversation.id).join(Conversation, Conversation.matchId == Match.id, isouter=True)
        .where(Match.status == "ACTIVE", or_(and_(Match.userAId == user_id, Match.userBId.in_(ids)), and_(Match.userBId == user_id, Match.userAId.in_(ids))))
    )).all() if ids else []
    match_of = {(m.userBId if m.userAId == user_id else m.userAId): cid for m, cid in matches}
    items = []
    for r in page:
        c = cards.get(r.targetId)
        if c:
            items.append({**to_card(c), "superLike": _v(r.action) == "SUPER_LIKE", "likedAt": r.createdAt, "matched": r.targetId in match_of, "conversationId": match_of.get(r.targetId)})
    return {"items": items, "nextCursor": page[-1].id if len(rows) > limit else None}


async def received(db: AsyncSession, user_id: str, cursor: str | None = None, limit: int = 20) -> dict:
    """Personnes qui m'ont liké. Gratuit : compteur seulement (les Super Likes restent visibles). Premium : liste complète."""
    limits = (await entitlements.get(db, user_id))["limits"]
    giver_ok = and_(~exists().where(Block.blockerId == user_id, Block.blockedId == Swipe.giverId), ~exists().where(Block.blockerId == Swipe.giverId, Block.blockedId == user_id))
    S2 = aliased(Swipe)
    no_reply = ~exists().where(S2.giverId == user_id, S2.targetId == Swipe.giverId)
    cond = [Swipe.targetId == user_id, Swipe.action.in_(["LIKE", "SUPER_LIKE"]), User.status == "ACTIVE", no_reply, giver_ok]
    count = (await db.execute(select(func.count()).select_from(Swipe).join(User, User.id == Swipe.giverId).where(*cond))).scalar_one()
    q = select(Swipe).join(User, User.id == Swipe.giverId).where(*cond)
    if not limits["seeLikers"]:
        q = q.where(Swipe.action == "SUPER_LIKE")
    cur = await db.get(Swipe, cursor) if cursor else None
    rows = (await db.execute(_after(q, cur, Swipe).order_by(Swipe.createdAt.desc(), Swipe.id.desc()).limit(limit + 1))).scalars().all()
    page = rows[:limit]
    ids = [r.giverId for r in page]
    profiles = list((await db.execute(select(Profile).where(Profile.userId.in_(ids)))).scalars().all()) if ids else []
    cards = {c.profile.userId: c for c in await load_cards(db, profiles)}
    items = [{**to_card(cards[r.giverId]), "superLike": _v(r.action) == "SUPER_LIKE", "likedAt": r.createdAt} for r in page if r.giverId in cards]
    return {"locked": not limits["seeLikers"], "count": count, "items": items, "nextCursor": page[-1].id if len(rows) > limit else None}

"""Visiteurs du profil : enregistrement d'une visite et liste « qui a vu mon profil ».
Gratuit : compteur seulement (même droit que les likes reçus, `seeLikers`). Premium / VIP : liste complète.
Le mode discret (`Profile.incognito`, VIP) empêche d'être enregistré comme visiteur."""
import datetime

from sqlalchemy import and_, exists, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import entitlements
from app.core.ids import new_id, utcnow
from app.core.profile_card import load_cards, to_card
from app.models.models import Block, Profile, ProfileVisit, User

WINDOW_DAYS = 30


async def record(db: AsyncSession, viewer_id: str, visited_id: str) -> None:
    """Note (ou rafraîchit) la visite. Sans effet pour son propre profil ou en mode discret."""
    if viewer_id == visited_id:
        return
    incognito = (await db.execute(select(Profile.incognito).where(Profile.userId == viewer_id))).scalar_one_or_none()
    if incognito:
        return
    now = utcnow()
    stmt = insert(ProfileVisit).values(id=new_id(), viewerId=viewer_id, visitedId=visited_id, visits=1, lastVisitAt=now)
    await db.execute(stmt.on_conflict_do_update(
        index_elements=["viewerId", "visitedId"], set_={"visits": ProfileVisit.visits + 1, "lastVisitAt": now}))
    await db.commit()


async def list_visitors(db: AsyncSession, user_id: str, cursor: str | None = None, limit: int = 20) -> dict:
    limits = (await entitlements.get(db, user_id))["limits"]
    since = utcnow() - datetime.timedelta(days=WINDOW_DAYS)
    ok = and_(~exists().where(Block.blockerId == user_id, Block.blockedId == ProfileVisit.viewerId),
              ~exists().where(Block.blockerId == ProfileVisit.viewerId, Block.blockedId == user_id))
    cond = [ProfileVisit.visitedId == user_id, ProfileVisit.lastVisitAt >= since, User.status == "ACTIVE", ok]
    count = (await db.execute(select(func.count()).select_from(ProfileVisit).join(User, User.id == ProfileVisit.viewerId).where(*cond))).scalar_one()
    locked = not limits["seeLikers"]
    if locked:
        return {"locked": True, "count": count, "items": [], "nextCursor": None}
    q = select(ProfileVisit).join(User, User.id == ProfileVisit.viewerId).where(*cond)
    cur = await db.get(ProfileVisit, cursor) if cursor else None
    if cur:
        q = q.where((ProfileVisit.lastVisitAt < cur.lastVisitAt) | ((ProfileVisit.lastVisitAt == cur.lastVisitAt) & (ProfileVisit.id < cur.id)))
    rows = (await db.execute(q.order_by(ProfileVisit.lastVisitAt.desc(), ProfileVisit.id.desc()).limit(limit + 1))).scalars().all()
    page = rows[:limit]
    profiles = list((await db.execute(select(Profile).where(Profile.userId.in_([r.viewerId for r in page])))).scalars().all()) if page else []
    cards = {c.profile.userId: c for c in await load_cards(db, profiles)}
    items = [{**to_card(cards[r.viewerId]), "visitedAt": r.lastVisitAt, "visits": r.visits} for r in page if r.viewerId in cards]
    return {"locked": False, "count": count, "items": items, "nextCursor": page[-1].id if len(rows) > limit else None}

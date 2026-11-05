"""Découvertes du jour : une sélection limitée de VRAIS profils éligibles, calculée à la première consultation de la journée.
Pas de compte à rebours, pas de profil inventé : un profil qui devient inéligible (blocage, suspension…) disparaît de la liste."""
import datetime

from sqlalchemy import and_, delete, exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import appsettings, discoverysvc, entitlements, flags, rhythm
from app.core.ids import utcnow
from app.core.profile_card import approx_distance_km, load_cards, to_card
from app.models.models import Block, DailyRecommendation, Profile, Swipe, User


def today() -> datetime.date:
    return utcnow().date()


async def _generate(db: AsyncSession, user_id: str, day: datetime.date) -> None:
    cfg = await appsettings.all_values(db)
    paid = (await entitlements.get(db, user_id))["plan"] != "FREE"
    n = cfg["daily.count_premium" if paid else "daily.count_free"]
    await db.execute(delete(DailyRecommendation).where(DailyRecommendation.userId == user_id, DailyRecommendation.day < day - datetime.timedelta(days=cfg["daily.retention_days"])))
    recent = set((await db.execute(select(DailyRecommendation.targetId).where(
        DailyRecommendation.userId == user_id, DailyRecommendation.day >= day - datetime.timedelta(days=cfg["daily.cooldown_days"])))).scalars().all())
    ranked = await discoverysvc.ranked(db, user_id, exclude=recent, boost=False)
    for c, dist, r in ranked[:n]:
        db.add(DailyRecommendation(userId=user_id, targetId=c.profile.userId, day=day, score=r.compatibility, reasons=discoverysvc.affinity_dict(r)))
    await db.commit()


async def _cards(db: AsyncSession, user_id: str, rows: list[DailyRecommendation]) -> dict[str, dict]:
    """Cartes des profils encore éligibles (actifs, onboardés, non bloqués), avec la décision déjà prise le cas échéant."""
    ids = [r.targetId for r in rows]
    if not ids:
        return {}
    profiles = list((await db.execute(
        select(Profile).join(User, User.id == Profile.userId).where(
            Profile.userId.in_(ids), Profile.onboardedAt.is_not(None), User.status == "ACTIVE",
            ~exists().where(Block.blockerId == user_id, Block.blockedId == Profile.userId), ~exists().where(Block.blockerId == Profile.userId, Block.blockedId == user_id))
    )).scalars().all())
    me = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one()
    mine = await discoverysvc.my_slugs(db, user_id)
    acted = dict((await db.execute(select(Swipe.targetId, Swipe.action).where(Swipe.giverId == user_id, Swipe.targetId.in_(ids)))).all())
    by_target = {r.targetId: r for r in rows}
    out = {}
    for c in await load_cards(db, profiles):
        r = by_target[c.profile.userId]
        out[c.profile.userId] = {**to_card(c, viewer_interests=mine, distance_km=approx_distance_km(me, c.profile), score=r.score, affinity=r.reasons),
                                 "decision": getattr(acted.get(c.profile.userId), "value", acted.get(c.profile.userId))}
    return out


async def get_today(db: AsyncSession, user_id: str) -> dict:
    await flags.assert_on(db, "daily_picks")
    await rhythm.assert_not_paused(db, user_id)
    day = today()
    q = select(DailyRecommendation).where(DailyRecommendation.userId == user_id, DailyRecommendation.day == day).order_by(DailyRecommendation.score.desc(), DailyRecommendation.id)
    rows = list((await db.execute(q)).scalars().all())
    if not rows:
        await _generate(db, user_id, day)
        rows = list((await db.execute(q)).scalars().all())
    cards = await _cards(db, user_id, rows)
    items = [cards[r.targetId] for r in rows if r.targetId in cards]
    return {"day": day.isoformat(), "items": items, "pending": sum(1 for i in items if not i["decision"])}


async def history(db: AsyncSession, user_id: str, before: str | None = None, days: int = 7) -> dict:
    """Jours précédents (le plus récent d'abord) ; `before` = jour ISO exclu, pour paginer."""
    await flags.assert_on(db, "daily_picks")
    day = today()
    try:
        limit_day = datetime.date.fromisoformat(before) if before else day
    except ValueError:
        limit_day = day
    day_list = list((await db.execute(select(DailyRecommendation.day).where(DailyRecommendation.userId == user_id, DailyRecommendation.day < limit_day)
                                     .group_by(DailyRecommendation.day).order_by(DailyRecommendation.day.desc()).limit(days + 1))).scalars().all())
    page = day_list[:days]
    rows = list((await db.execute(select(DailyRecommendation).where(DailyRecommendation.userId == user_id, DailyRecommendation.day.in_(page))
                                  .order_by(DailyRecommendation.day.desc(), DailyRecommendation.score.desc()))).scalars().all()) if page else []
    cards = await _cards(db, user_id, rows)
    groups = [{"day": d.isoformat(), "items": [cards[r.targetId] for r in rows if r.day == d and r.targetId in cards]} for d in page]
    return {"days": [g for g in groups if g["items"]], "nextCursor": page[-1].isoformat() if len(day_list) > days else None}

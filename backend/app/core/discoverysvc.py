"""Découverte : filtres obligatoires, préférences mutuelles, classement par score."""
import datetime

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core import appsettings, entitlements
from app.core.constants import age_from_birth_date
from app.core.errors import forbidden
from app.core.ids import utcnow
from app.core.profile_card import approx_distance_km, load_cards, to_card
from app.core.scoring import ScoreSubject, SoftPrefs, score_candidate
from app.models.models import Block, Interest, Preference, Profile, ProfilePhoto, Swipe, User, t_UserInterest

GENDERS_FOR = {"MEN": ["MAN"], "WOMEN": ["WOMAN"], "EVERYONE": ["MAN", "WOMAN", "NON_BINARY", "OTHER"]}
# Quelles préférences « cherche » acceptent un profil de tel genre (réciprocité).
SEEKING_THAT_ACCEPT = {"MAN": ["MEN", "EVERYONE"], "WOMAN": ["WOMEN", "EVERYONE"], "NON_BINARY": ["EVERYONE"], "OTHER": ["EVERYONE"]}


def years_ago(n: int, now: datetime.datetime) -> datetime.datetime:
    try:
        return now.replace(year=now.year - n)
    except ValueError:  # 29 février → 1er mars (comme setUTCFullYear)
        return now.replace(year=now.year - n, month=3, day=1)


def _v(x):
    return getattr(x, "value", x)


async def my_slugs(db: AsyncSession, user_id: str) -> list[str]:
    return list((await db.execute(select(Interest.slug).join(t_UserInterest, t_UserInterest.c.interestId == Interest.id).where(t_UserInterest.c.userId == user_id))).scalars().all())


async def _context(db: AsyncSession, user_id: str):
    me = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one_or_none()
    pref = (await db.execute(select(Preference).where(Preference.userId == user_id))).scalar_one_or_none()
    if not me or not pref:
        raise forbidden("PROFILE_INCOMPLETE")
    limits = (await entitlements.get(db, user_id))["limits"]
    return me, pref, limits


def _query(user_id: str, me: Profile, pref: Preference, limits: dict):
    now = utcnow()
    my_age = age_from_birth_date(me.birthDate, now)
    OP = aliased(Preference)
    conds = [
        Profile.visibility == "VISIBLE", Profile.onboardedAt.is_not(None), Profile.gender.in_(GENDERS_FOR[_v(pref.seeking)]),
        Profile.birthDate <= years_ago(pref.ageMin, now), Profile.birthDate > years_ago(pref.ageMax + 1, now),
        exists().where(ProfilePhoto.profileId == Profile.id, ProfilePhoto.moderationStatus != "REJECTED"),
        # Mode discret (VIP) : visible uniquement des personnes qu'il/elle a likées.
        or_(Profile.incognito.is_(False), exists().where(Swipe.giverId == Profile.userId, Swipe.targetId == user_id, Swipe.action.in_(["LIKE", "SUPER_LIKE"]))),
        User.id != user_id, User.status == "ACTIVE",
        ~exists().where(Swipe.giverId == user_id, Swipe.targetId == Profile.userId),
        ~exists().where(Block.blockerId == Profile.userId, Block.blockedId == user_id),
        ~exists().where(Block.blockerId == user_id, Block.blockedId == Profile.userId),
        # Réciprocité : l'autre personne doit aussi accepter mon genre et mon âge.
        OP.seeking.in_(SEEKING_THAT_ACCEPT[_v(me.gender)]), OP.ageMin <= my_age, OP.ageMax >= my_age,
    ]
    if pref.country:
        conds.append(Profile.country == pref.country)
    if pref.city:
        conds.append(func.lower(Profile.city) == pref.city.lower())
    if pref.intents:
        conds.append(Profile.intent.in_([_v(i) for i in pref.intents]))
    if limits["advancedFilters"]:
        if pref.languages:
            conds.append(Profile.languages.overlap(pref.languages))
        if pref.interests:
            conds.append(exists().where(t_UserInterest.c.userId == Profile.userId, t_UserInterest.c.interestId == Interest.id, Interest.slug.in_(pref.interests)))
        if pref.verifiedOnly:
            conds.append(Profile.verified.is_(True))
        if pref.activeRecently:
            conds.append(User.lastActiveAt >= now - datetime.timedelta(days=7))
    return select(Profile).join(User, User.id == Profile.userId).join(OP, OP.userId == Profile.userId).where(and_(*conds)), User


async def count(db: AsyncSession, user_id: str) -> dict:
    me, pref, limits = await _context(db, user_id)
    q, _ = _query(user_id, me, pref, limits)
    return {"count": (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()}


def _subject(p: Profile, interests: list[str], last_active: datetime.datetime) -> ScoreSubject:
    return ScoreSubject(intent=_v(p.intent), interests=interests, languages=p.languages or [], city=p.city, country=p.country,
                        lastActiveAt=last_active, completeness=p.completeness, verified=p.verified, boostedUntil=p.boostedUntil)


def _soft(pref: Preference | None) -> SoftPrefs | None:
    return SoftPrefs([_v(i) for i in pref.intents or []], list(pref.languages or []), list(pref.interests or [])) if pref else None


async def ranked(db: AsyncSession, user_id: str, *, exclude: set[str] | None = None, boost: bool = True, pool_size: int = 200):
    """Candidats éligibles classés [(carte, distance, ScoreResult)] : filtres obligatoires en SQL, puis score pondéré (réglages admin)."""
    me, pref, limits = await _context(db, user_id)
    q, U = _query(user_id, me, pref, limits)
    if exclude:
        q = q.where(Profile.userId.not_in(exclude))
    pool = (await db.execute(q.order_by(Profile.boostedUntil.desc().nulls_last(), U.lastActiveAt.desc()).limit(pool_size))).scalars().all()
    cards = await load_cards(db, list(pool))
    mine_slugs = await my_slugs(db, user_id)
    my_active = (await db.execute(select(User.lastActiveAt).where(User.id == user_id))).scalar_one()
    mine = _subject(me, mine_slugs, my_active)
    weights = (await appsettings.all_values(db))["matching.weights"]
    their_prefs = {p.userId: p for p in (await db.execute(select(Preference).where(Preference.userId.in_([c.profile.userId for c in cards])))).scalars().all()} if cards else {}
    scored = []
    for c in cards:
        dist = approx_distance_km(me, c.profile)
        if limits["advancedFilters"] and pref.maxDistanceKm and dist is not None and dist > pref.maxDistanceKm:
            continue
        r = score_candidate(mine, _subject(c.profile, c.interests, c.last_active_at), dist, weights=weights, viewer_prefs=_soft(pref), cand_prefs=_soft(their_prefs.get(c.profile.userId)))
        if not boost:
            r.rank = r.compatibility  # sélection du jour : aucune mise en avant payante
        scored.append((c, dist, r))
    scored.sort(key=lambda x: x[2].rank, reverse=True)  # tri stable
    return scored


def affinity_dict(r) -> dict:
    """Explication destinée au membre : estimation d'affinité et raisons, jamais une garantie."""
    return {"score": r.compatibility, "reasons": r.reasons, "commonInterests": r.common_interests, "intentsCompatible": r.intents_compatible}


async def feed(db: AsyncSession, user_id: str, limit: int, cursor: str | None) -> dict:
    """Recommandations classées par score ; pagination par décalage dans la liste classée (cursor = offset)."""
    scored = await ranked(db, user_id)
    mine = await my_slugs(db, user_id)
    try:
        start = max(0, int(cursor or "0"))
    except ValueError:
        start = 0
    page = scored[start:start + limit]
    return {
        "items": [to_card(c, viewer_interests=mine, distance_km=d, score=r.compatibility, affinity=affinity_dict(r)) for c, d, r in page],
        "nextCursor": str(start + limit) if start + limit < len(scored) else None,
        "total": len(scored),
    }


async def explain_for(db: AsyncSession, viewer_id: str, target_profile: Profile, cards: list | None = None) -> dict | None:
    """Affinité estimée avec un profil précis (page profil). Aucune donnée privée n'est renvoyée, seulement les raisons."""
    me = (await db.execute(select(Profile).where(Profile.userId == viewer_id))).scalar_one_or_none()
    pref = (await db.execute(select(Preference).where(Preference.userId == viewer_id))).scalar_one_or_none()
    if not me:
        return None
    cand = (cards or await load_cards(db, [target_profile]))[0]
    mine_slugs = await my_slugs(db, viewer_id)
    my_active = (await db.execute(select(User.lastActiveAt).where(User.id == viewer_id))).scalar_one()
    their = (await db.execute(select(Preference).where(Preference.userId == target_profile.userId))).scalar_one_or_none()
    weights = (await appsettings.all_values(db))["matching.weights"]
    r = score_candidate(_subject(me, mine_slugs, my_active), _subject(cand.profile, cand.interests, cand.last_active_at), approx_distance_km(me, cand.profile),
                        weights=weights, viewer_prefs=_soft(pref), cand_prefs=_soft(their))
    return affinity_dict(r)

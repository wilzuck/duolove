"""Profils similaires : jusqu'à trois autres membres proches de celui qu'on regarde (même genre, même pays, centres d'intérêt en commun)."""
from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core import rhythm
from app.core.constants import age_from_birth_date
from app.core.ids import utcnow
from app.core.profile_card import load_cards, photo_url, thumb_key
from app.models.models import Block, Profile, ProfilePhoto, Swipe, User, t_UserInterest


async def similar(db: AsyncSession, viewer_id: str, target: Profile, limit: int = 3) -> list[dict]:
    """Mêmes règles de visibilité que la découverte : profils visibles, actifs, avec photo, ni bloqués ni déjà notés par la personne qui regarde ;
    le mode discret n'est jamais contourné. Classés par nombre de centres d'intérêt communs, puis par activité récente."""
    now = utcnow()
    mine, theirs = aliased(t_UserInterest), aliased(t_UserInterest)
    common = (select(func.count()).select_from(mine.join(theirs, theirs.c.interestId == mine.c.interestId))
              .where(mine.c.userId == Profile.userId, theirs.c.userId == target.userId).correlate(Profile).scalar_subquery())
    q = (select(Profile).join(User, User.id == Profile.userId).where(
        Profile.gender == target.gender, Profile.country == target.country, Profile.visibility == "VISIBLE", Profile.onboardedAt.is_not(None),
        Profile.incognito.is_(False), Profile.userId.not_in([viewer_id, target.userId]), User.status == "ACTIVE", ~rhythm.paused_expr(now),
        exists().where(ProfilePhoto.profileId == Profile.id, ProfilePhoto.moderationStatus != "REJECTED"),
        ~exists().where(or_((Block.blockerId == viewer_id) & (Block.blockedId == Profile.userId), (Block.blockerId == Profile.userId) & (Block.blockedId == viewer_id))),
        ~exists().where(Swipe.giverId == viewer_id, Swipe.targetId == Profile.userId),
    ).order_by(common.desc(), User.lastActiveAt.desc()).limit(limit))
    cards = await load_cards(db, list((await db.execute(q)).scalars().all()))
    return [{"id": c.profile.userId, "displayName": c.profile.displayName, "age": age_from_birth_date(c.profile.birthDate), "city": c.profile.city, "country": c.profile.country,
             "verified": c.profile.verified, "thumbUrl": photo_url(thumb_key(c.photos[0].key))} for c in cards if c.photos]

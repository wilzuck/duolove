"""Suppression d'un compte : anonymisation immédiate, sessions révoquées, photos effacées. Utilisée par le membre (Paramètres) et par l'administration."""
from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.ids import utcnow
from app.core.profile_card import thumb_key
from app.models.models import Account, Match, Message, Profile, ProfilePhoto, Session, Subscription, User, VerificationToken
from app.models.models import t_UserInterest


async def anonymize(db: AsyncSession, user_id: str) -> None:
    profile = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one_or_none()
    keys = []
    if profile:
        keys = list((await db.execute(select(ProfilePhoto.key).where(ProfilePhoto.profileId == profile.id))).scalars().all())
    now = utcnow()
    await db.execute(update(User).where(User.id == user_id).values(status="DELETED", deletedAt=now, email=f"deleted+{user_id}@duomatch.invalid", passwordHash=None, emailVerifiedAt=None, marketingConsent=False))
    await db.execute(delete(Account).where(Account.userId == user_id))
    await db.execute(delete(Session).where(Session.userId == user_id))
    await db.execute(delete(VerificationToken).where(VerificationToken.userId == user_id))
    if profile:
        await db.execute(delete(ProfilePhoto).where(ProfilePhoto.profileId == profile.id))
    await db.execute(delete(t_UserInterest).where(t_UserInterest.c.userId == user_id))
    await db.execute(update(Profile).where(Profile.userId == user_id).values(displayName="Compte supprimé", bio="", occupation=None, pronouns=None, visibility="HIDDEN", approxLat=None, approxLng=None))
    await db.execute(update(Message).where(Message.senderId == user_id).values(body="", deletedAt=now))
    await db.execute(update(Match).where(or_(Match.userAId == user_id, Match.userBId == user_id), Match.status == "ACTIVE").values(status="UNMATCHED", unmatchedById=user_id))
    await db.execute(update(Subscription).where(Subscription.userId == user_id, Subscription.status.in_(["ACTIVE", "PENDING", "PAST_DUE"])).values(status="CANCELED", cancelAtPeriodEnd=True))
    await db.commit()
    for k in keys:
        await storage.delete(k)
        await storage.delete(thumb_key(k))

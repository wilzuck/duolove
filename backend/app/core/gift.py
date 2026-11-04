"""Cadeau de jetons Match à 100 % de profil."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import credits, referral
from app.core.constants import LIVE
from app.models.models import Profile, User

# Référence fixe → le journal des crédits (userId, reason, refId unique) garantit un cadeau UNIQUE par compte.
PROFILE_GIFT_REF = "profile100"


async def gift_tokens_if_eligible(db: AsyncSession, user_id: str) -> bool:
    """Offre les jetons une seule fois : profil à 100 % ET e-mail vérifié (limite les comptes jetables). Idempotent.
    Retourne True si les jetons viennent d'être crédités."""
    p = (await db.execute(
        select(Profile.completeness, User.emailVerifiedAt, User.status).join(User, User.id == Profile.userId).where(Profile.userId == user_id)
    )).first()
    if not p or p.completeness < 100 or not p.emailVerifiedAt or p.status.value != "ACTIVE":
        return False
    await referral.reward_if_eligible(db, user_id)  # même condition de qualification que le cadeau de profil
    ok = await credits.grant(db, user_id, "MATCH_TOKEN", LIVE.PROFILE_GIFT_TOKENS, "GRANT_PROFILE", PROFILE_GIFT_REF)
    await db.commit()
    return ok

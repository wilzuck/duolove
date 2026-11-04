"""Parrainage : code par membre, rattachement à l'inscription, récompense versée UNE seule fois.
Récompense : profil 100 % + e-mail vérifié + compte actif. Idempotent : la ligne Referral est « réclamée » (PENDING → REWARDED) de façon
atomique sous verrou par parrain, et le journal des crédits est unique."""
import secrets

from sqlalchemy import func, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import credits, flags
from app.core.constants import REFERRAL
from app.core.errors import AppError
from app.core.ids import new_id, utcnow
from app.models.models import CreditTransaction, Notification, Profile, Referral, User

# Alphabet sans caractères ambigus (0/O, 1/I/L) : le code se dicte facilement par téléphone ou WhatsApp.
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def make_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(REFERRAL.CODE_LENGTH))


async def code_for(db: AsyncSession, user_id: str) -> str:
    """Code du membre, créé à la première demande (unicité garantie par la base, nouvel essai en cas de collision)."""
    current = (await db.execute(select(User.referralCode).where(User.id == user_id))).scalar_one()
    if current:
        return current
    for _ in range(5):
        code = make_code()
        try:
            res = await db.execute(update(User).where(User.id == user_id, User.referralCode.is_(None)).values(referralCode=code))
            await db.commit()
        except IntegrityError:
            await db.rollback()  # collision d'unicité : nouveau tirage
            continue
        if res.rowcount == 0:
            return (await db.execute(select(User.referralCode).where(User.id == user_id))).scalar_one()
        return code
    raise AppError(500, "REFERRAL_CODE_GENERATION_FAILED")


async def attach(db: AsyncSession, referee_id: str, raw_code: str | None) -> bool:
    """Rattache un nouveau compte à son parrain. Code inconnu ou parrain inactif : ignoré sans erreur (pas d'énumération)."""
    code = (raw_code or "").strip().upper()
    if not code or not await flags.is_on(db, "referral_program"):
        return False
    row = (await db.execute(select(User.id, User.status).where(User.referralCode == code))).first()
    if not row or row.status.value != "ACTIVE" or row.id == referee_id:
        return False
    await db.execute(
        insert(Referral).values(id=new_id(), referrerId=row.id, refereeId=referee_id, createdAt=utcnow())
        .on_conflict_do_nothing(index_elements=["refereeId"])
    )
    await db.commit()
    return True


async def reward_if_eligible(db: AsyncSession, referee_id: str) -> str | None:
    """Retourne l'identifiant du parrain si une récompense (filleul + parrain) vient d'être versée, sinon None."""
    ref = (await db.execute(select(Referral).where(Referral.refereeId == referee_id))).scalar_one_or_none()
    if not ref or ref.status.value != "PENDING" or not await flags.read_flag(db, "referral_program"):
        return None
    p = (await db.execute(
        select(Profile.completeness, User.emailVerifiedAt, User.status).join(User, User.id == Profile.userId).where(Profile.userId == referee_id)
    )).first()
    if not p or p.completeness < 100 or not p.emailVerifiedAt or p.status.value != "ACTIVE":
        return None
    referrer_id = ref.referrerId

    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"referral:{referrer_id}"})
    claimed = await db.execute(
        update(Referral).where(Referral.id == ref.id, Referral.status == "PENDING").values(status="REWARDED", rewardedAt=utcnow())
    )
    if claimed.rowcount == 0:
        await db.rollback()  # déjà versée par une autre requête
        return None
    await credits.grant(db, referee_id, "MATCH_TOKEN", REFERRAL.REFEREE_TOKENS, "REFERRAL", "referral-bonus")
    done = (await db.execute(select(func.count()).select_from(Referral).where(Referral.referrerId == referrer_id, Referral.status == "REWARDED"))).scalar_one()
    referrer_status = (await db.execute(select(User.status).where(User.id == referrer_id))).scalar_one_or_none()
    rewarded_referrer = not (done > REFERRAL.MAX_REWARDED_PER_REFERRER or (referrer_status is None or referrer_status.value != "ACTIVE"))
    if rewarded_referrer:
        await credits.grant(db, referrer_id, "MATCH_TOKEN", REFERRAL.REFERRER_TOKENS, "REFERRAL", f"referral:{referee_id}")
        db.add(Notification(userId=referrer_id, type="REFERRAL_REWARD", data={"tokens": REFERRAL.REFERRER_TOKENS}))
    await db.commit()
    return referrer_id if rewarded_referrer else None


async def summary(db: AsyncSession, user_id: str) -> dict:
    code = await code_for(db, user_id)
    rows = (await db.execute(select(Referral.status, func.count()).where(Referral.referrerId == user_id).group_by(Referral.status))).all()
    counts = {r[0].value: r[1] for r in rows}
    earned = (await db.execute(
        select(func.sum(CreditTransaction.delta)).where(
            CreditTransaction.userId == user_id, CreditTransaction.reason == "REFERRAL", CreditTransaction.refId.startswith("referral:")
        )
    )).scalar() or 0
    mine = (await db.execute(select(Referral.status).where(Referral.refereeId == user_id))).scalar_one_or_none()
    n = lambda s: counts.get(s, 0)  # noqa: E731
    return {
        "enabled": await flags.is_on(db, "referral_program"), "code": code, "invited": n("PENDING") + n("REWARDED"),
        "pending": n("PENDING"), "rewarded": n("REWARDED"), "tokensEarned": int(earned),
        "limits": {"referrerTokens": REFERRAL.REFERRER_TOKENS, "refereeTokens": REFERRAL.REFEREE_TOKENS, "maxRewarded": REFERRAL.MAX_REWARDED_PER_REFERRER},
        "referredBy": {"status": mine.value} if mine else None,
    }

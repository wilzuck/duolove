"""Codes promotionnels. Deux types :
 - PERCENT : remise sur un paiement. Le montant est TOUJOURS recalculé ici, jamais lu du client.
 - TOKENS  : jetons Match offerts, une seule fois par membre (journal des crédits unique par code).
Un code ne s'utilise qu'une fois par membre ; le plafond global est vérifié sous verrou (aucun dépassement en concurrence)."""
from __future__ import annotations

import datetime
from dataclasses import dataclass

from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import credits, flags
from app.core.errors import AppError, bad_request, conflict
from app.core.ids import utcnow
from app.models.models import CreditTransaction, Payment, PromoCode

# Un paiement en attente depuis moins d'une heure « réserve » le code ; au-delà il est considéré abandonné.
PENDING_HOLD = datetime.timedelta(hours=1)


@dataclass
class PromoQuote:
    promoId: str
    code: str
    percent: int
    discountXof: int
    finalXof: int


async def _load(db: AsyncSession, code: str) -> PromoCode:
    await flags.assert_on(db, "promo_codes")
    promo = (await db.execute(select(PromoCode).where(PromoCode.code == code))).scalar_one_or_none()
    now = utcnow()
    # Même réponse pour « inconnu », « désactivé » et « hors période » : pas d'énumération des codes.
    if not promo or not promo.active or (promo.startsAt and promo.startsAt > now) or (promo.expiresAt and promo.expiresAt < now):
        raise bad_request("PROMO_INVALID")
    return promo


async def _lock(db: AsyncSession, promo_id: str) -> None:
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"promo:{promo_id}"})


def _usage_clause(promo_id: str):
    return (Payment.promoCodeId == promo_id) & or_(
        Payment.status.in_(["SUCCEEDED", "REFUNDED"]),
        (Payment.status == "PENDING") & (Payment.createdAt > utcnow() - PENDING_HOLD),
    )


async def evaluate(db: AsyncSession, user_id: str, raw_code: str, amount_xof: int, locked: bool = False) -> PromoQuote:
    """Vérifie un code PERCENT pour ce membre et ce montant. `locked=True` : prend le verrou du code (à appeler dans la transaction du paiement)."""
    promo = await _load(db, raw_code)
    if promo.kind.value != "PERCENT" or not promo.percent:
        raise bad_request("PROMO_NOT_APPLICABLE")
    if locked:
        await _lock(db, promo.id)
    if (await db.execute(select(func.count()).select_from(Payment).where(_usage_clause(promo.id), Payment.userId == user_id))).scalar_one():
        raise conflict("PROMO_ALREADY_USED")
    if promo.maxRedemptions is not None and (await db.execute(select(func.count()).select_from(Payment).where(_usage_clause(promo.id)))).scalar_one() >= promo.maxRedemptions:
        raise conflict("PROMO_EXHAUSTED")
    discount = min(amount_xof, int(amount_xof * promo.percent / 100 + 0.5))
    return PromoQuote(promo.id, promo.code, promo.percent, discount, amount_xof - discount)


async def _token_uses(db: AsyncSession, ref: str, user_id: str | None = None) -> int:
    q = select(func.count()).select_from(CreditTransaction).where(CreditTransaction.reason == "PROMO", CreditTransaction.refId == ref)
    if user_id:
        q = q.where(CreditTransaction.userId == user_id)
    return (await db.execute(q)).scalar_one()


async def redeem_tokens(db: AsyncSession, user_id: str, raw_code: str) -> dict:
    """Code « jetons » : crédite une seule fois par membre, dans une transaction verrouillée par code."""
    promo = await _load(db, raw_code)
    if promo.kind.value != "TOKENS" or not promo.tokens:
        raise bad_request("PROMO_NOT_APPLICABLE")
    await _lock(db, promo.id)
    ref = f"promo:{promo.id}"
    if await _token_uses(db, ref, user_id):
        raise conflict("PROMO_ALREADY_USED")
    if promo.maxRedemptions is not None and await _token_uses(db, ref) >= promo.maxRedemptions:
        raise conflict("PROMO_EXHAUSTED")
    if not await credits.grant(db, user_id, "MATCH_TOKEN", promo.tokens, "PROMO", ref):
        raise AppError(409, "PROMO_ALREADY_USED")
    await db.commit()
    return {"tokens": promo.tokens}


async def lookup(db: AsyncSession, user_id: str, raw_code: str) -> dict:
    """Ce qu'un code offre à CE membre, sans rien réserver. Mêmes refus que l'utilisation réelle."""
    promo = await _load(db, raw_code)
    if promo.kind.value == "PERCENT":
        await evaluate(db, user_id, raw_code, 0)
        return {"code": promo.code, "kind": "PERCENT", "percent": promo.percent or 0}
    ref = f"promo:{promo.id}"
    if await _token_uses(db, ref, user_id):
        raise conflict("PROMO_ALREADY_USED")
    if promo.maxRedemptions is not None and await _token_uses(db, ref) >= promo.maxRedemptions:
        raise conflict("PROMO_EXHAUSTED")
    return {"code": promo.code, "kind": "TOKENS", "tokens": promo.tokens or 0}


async def usage(db: AsyncSession, promo: PromoCode) -> int:
    if promo.kind.value == "TOKENS":
        return await _token_uses(db, f"promo:{promo.id}")
    return (await db.execute(select(func.count()).select_from(Payment).where(_usage_clause(promo.id)))).scalar_one()


async def usage_map(db: AsyncSession, promos: list[PromoCode]) -> dict[str, int]:
    """Utilisations de plusieurs codes en deux requêtes groupées (la liste d'administration ne fait pas N requêtes)."""
    out = {p.id: 0 for p in promos}
    pct = [p.id for p in promos if p.kind.value != "TOKENS"]
    if pct:
        rows = (await db.execute(
            select(Payment.promoCodeId, func.count()).where(Payment.promoCodeId.in_(pct))
            .where(or_(Payment.status.in_(["SUCCEEDED", "REFUNDED"]), (Payment.status == "PENDING") & (Payment.createdAt > utcnow() - PENDING_HOLD)))
            .group_by(Payment.promoCodeId))).all()
        out.update({k: n for k, n in rows})
    refs = {f"promo:{p.id}": p.id for p in promos if p.kind.value == "TOKENS"}
    if refs:
        rows = (await db.execute(
            select(CreditTransaction.refId, func.count()).where(CreditTransaction.reason == "PROMO", CreditTransaction.refId.in_(list(refs)))
            .group_by(CreditTransaction.refId))).all()
        out.update({refs[k]: n for k, n in rows})
    return out

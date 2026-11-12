"""Codes promotionnels. Deux types :
 - PERCENT : remise sur un paiement. Le montant est TOUJOURS recalculé ici, jamais lu du client.
 - TOKENS  : jetons Match offerts, une seule fois par membre (journal des crédits unique par code).
Un code ne s'utilise qu'une fois par membre ; le plafond global est vérifié sous verrou (aucun dépassement en concurrence)."""
from __future__ import annotations

import asyncio
import datetime
import logging
from dataclasses import dataclass

from sqlalchemy import func, or_, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import credits, flags
from app.core.errors import AppError, bad_request, conflict
from app.core.ids import utcnow
from app.core.jsonfmt import iso
from app.models.models import CreditTransaction, Payment, Profile, PromoCode, PromoReminder, User

log = logging.getLogger("promo")

# Rappel de fin d'offre : envoyé une fois, quand il reste au plus ce délai.
REMINDER_LEAD = datetime.timedelta(hours=3)
REMINDER_BATCH = 500

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


async def _deadline(db: AsyncSession, promo: PromoCode, user_id: str) -> datetime.datetime | None:
    """Fin du délai « N heures après l'inscription » pour CE membre (None = pas de délai). Calculée ici, à partir de la date de création du compte."""
    if not promo.claimHours:
        return None
    created = (await db.execute(select(User.createdAt).where(User.id == user_id))).scalar_one_or_none()
    return created + datetime.timedelta(hours=promo.claimHours) if created else None


async def _assert_in_window(db: AsyncSession, promo: PromoCode, user_id: str) -> None:
    end = await _deadline(db, promo, user_id)
    if end and utcnow() > end:
        raise bad_request("PROMO_INVALID")  # même réponse que « inconnu » : pas d'indice sur l'existence du code


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
    await _assert_in_window(db, promo, user_id)
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
    await _assert_in_window(db, promo, user_id)
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
    await _assert_in_window(db, promo, user_id)
    ref = f"promo:{promo.id}"
    if await _token_uses(db, ref, user_id):
        raise conflict("PROMO_ALREADY_USED")
    if promo.maxRedemptions is not None and await _token_uses(db, ref) >= promo.maxRedemptions:
        raise conflict("PROMO_EXHAUSTED")
    return {"code": promo.code, "kind": "TOKENS", "tokens": promo.tokens or 0}


async def featured(db: AsyncSession, user_id: str) -> list[dict]:
    """Codes proposés aux membres (case « Proposer aux membres » côté admin) qui valent encore quelque chose POUR CE MEMBRE :
    actifs, dans leur période, pas épuisés, pas déjà utilisés par lui. Aucun code caché n'est révélé : seuls les codes cochés apparaissent."""
    if not await flags.is_on(db, "promo_codes"):
        return []
    now = utcnow()
    rows = (await db.execute(
        select(PromoCode).where(PromoCode.featured.is_(True), PromoCode.active.is_(True),
                                or_(PromoCode.startsAt.is_(None), PromoCode.startsAt <= now), or_(PromoCode.expiresAt.is_(None), PromoCode.expiresAt >= now))
        .order_by(PromoCode.createdAt.desc()).limit(5))).scalars().all()
    used = await usage_map(db, list(rows))
    out = []
    for p in rows:
        if p.maxRedemptions is not None and used[p.id] >= p.maxRedemptions:
            continue
        end = await _deadline(db, p, user_id)
        if end and end <= now:
            continue  # délai écoulé pour ce membre
        if p.kind.value == "PERCENT":
            mine = (await db.execute(select(func.count()).select_from(Payment).where(_usage_clause(p.id), Payment.userId == user_id))).scalar_one()
        else:
            mine = await _token_uses(db, f"promo:{p.id}", user_id)
        if mine:
            continue
        out.append({"code": p.code, "kind": p.kind.value, "percent": p.percent, "tokens": p.tokens,
                    "remaining": None if p.maxRedemptions is None else p.maxRedemptions - used[p.id],
                    "expiresAt": iso(p.expiresAt) if p.expiresAt else None,
                    "deadline": iso(end) if end else None})
    return out


async def remind_ending(db: AsyncSession, now: datetime.datetime | None = None) -> int:
    """Prévient les membres dont le délai d'un code proposé se termine dans moins de 3 h (une seule fois par membre et par code, réservée par une insertion).
    Notification dans l'application pour tous ; e-mail seulement pour ceux qui ont accepté de recevoir des offres (c'est une communication commerciale)."""
    from app.core import mail, notifications

    if not await flags.is_on(db, "promo_codes"):
        return 0
    now = now or utcnow()
    promos = (await db.execute(select(PromoCode).where(
        PromoCode.featured.is_(True), PromoCode.active.is_(True), PromoCode.claimHours.is_not(None),
        or_(PromoCode.startsAt.is_(None), PromoCode.startsAt <= now), or_(PromoCode.expiresAt.is_(None), PromoCode.expiresAt >= now)))).scalars().all()
    sent = 0
    used = await usage_map(db, list(promos))
    for p in promos:
        if p.maxRedemptions is not None and used[p.id] >= p.maxRedemptions:
            continue
        hours = datetime.timedelta(hours=p.claimHours or 0)
        # fin = création + délai ∈ ]now, now + 3 h]  ⇔  création ∈ ]now − délai, now + 3 h − délai]
        rows = (await db.execute(
            select(User.id, User.email, User.createdAt, User.marketingConsent).where(
                User.status == "ACTIVE", User.emailVerifiedAt.is_not(None), User.createdAt > now - hours, User.createdAt <= now + REMINDER_LEAD - hours,
                ~select(PromoReminder.userId).where(PromoReminder.promoId == p.id, PromoReminder.userId == User.id).exists()).limit(REMINDER_BATCH))).all()
        for uid, email, created, consent in rows:
            try:
                if p.kind.value == "PERCENT":
                    mine = (await db.execute(select(func.count()).select_from(Payment).where(_usage_clause(p.id), Payment.userId == uid))).scalar_one()
                else:
                    mine = await _token_uses(db, f"promo:{p.id}", uid)
                claim = await db.execute(pg_insert(PromoReminder).values(promoId=p.id, userId=uid).on_conflict_do_nothing())
                await db.commit()
                if mine or not claim.rowcount:
                    continue
                end = created + hours
                data = {"kind": "PROMO_ENDING", "code": p.code, "promoKind": p.kind.value, "percent": p.percent, "tokens": p.tokens, "endsAt": iso(end)}
                await notifications.create(db, uid, "ANNOUNCEMENT", data)
                if consent:
                    name = (await db.execute(select(Profile.displayName).where(Profile.userId == uid))).scalar_one_or_none() or ""
                    await mail.send_promo_ending(email, name, p.code, p.kind.value, p.percent, p.tokens, end)
                sent += 1
            except Exception:  # noqa: BLE001 — un échec ne doit pas empêcher les autres membres
                log.exception("Rappel de fin d'offre %s pour %s", p.code, uid)
    return sent


async def sweep_loop(maker, every: float = 600.0) -> None:
    while True:
        try:
            async with maker() as db:
                await remind_ending(db)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("Balayage des rappels de fin d'offre")
        await asyncio.sleep(every)


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

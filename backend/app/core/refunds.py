"""Remboursements intégraux.
 - Demande d'un membre (dans le délai, 7 jours par défaut) : UN administrateur approuve.
 - Demande d'un administrateur : DOUBLE VALIDATION — l'approbateur doit être une autre personne.
Exécution : fournisseur d'abord (ou « manuel » si remboursé hors système), puis effets atomiques (paiement REFUNDED, droits retirés,
crédits restants repris). Une approbation rejouée ne rembourse jamais deux fois."""
from __future__ import annotations

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import credits, notifications, payments, plan_config
from app.core.errors import AppError, bad_request, forbidden, not_found
from app.core.ids import utcnow
from app.models.models import Payment, Product, Profile, Refund, Subscription, SubscriptionPlan

ACTIVE = ["REQUESTED", "PROCESSING", "COMPLETED"]
ev = payments.ev


async def _create(db: AsyncSession, requester_id: str, payment_id: str, reason: str, source: str, enforce: bool) -> Refund:
    payment = await db.get(Payment, payment_id)
    if not payment or (enforce and payment.userId != requester_id):
        raise not_found("PAYMENT_NOT_FOUND")
    if ev(payment.status) != "SUCCEEDED":
        raise bad_request("NOT_REFUNDABLE", "Seul un paiement réussi peut être remboursé")
    if enforce and payment.paidAt and (utcnow() - payment.paidAt).total_seconds() > await payments.refund_window_days(db) * 86400:
        raise bad_request("REFUND_WINDOW_EXPIRED", "Délai de demande dépassé")
    # Verrou sur le paiement : deux demandes simultanées ne créent qu'un seul remboursement actif.
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"refund:{payment_id}"})
    if (await db.execute(select(Refund.id).where(Refund.paymentId == payment_id, Refund.status.in_(ACTIVE)).limit(1))).first():
        raise AppError(409, "REFUND_EXISTS", "Un remboursement existe déjà pour ce paiement")
    r = Refund(paymentId=payment_id, amountXof=payment.amountXof, reason=reason, source=source, requestedById=requester_id)
    db.add(r)
    await db.commit()
    return r


async def request_by_user(db, user_id, payment_id, reason):
    return await _create(db, user_id, payment_id, reason, "USER", True)


async def request_by_admin(db, admin_id, payment_id, reason):
    return await _create(db, admin_id, payment_id, reason, "ADMIN", False)


async def list_(db: AsyncSession, status: str | None, cursor: str | None, take: int) -> dict:
    q = select(Refund).order_by(Refund.createdAt.desc(), Refund.id.desc())
    if status:
        q = q.where(Refund.status == status)
    if cursor:
        c = await db.get(Refund, cursor)
        if c:
            q = q.where((Refund.createdAt < c.createdAt) | ((Refund.createdAt == c.createdAt) & (Refund.id < c.id)))
    rows = (await db.execute(q.limit(take + 1))).scalars().all()
    items = []
    for r in rows[:take]:
        p = await db.get(Payment, r.paymentId)
        prod = await db.get(Product, p.productId) if p.productId else None
        plan = None
        if p.subscriptionId:
            plan = (await db.execute(select(SubscriptionPlan.code).join(Subscription, Subscription.planId == SubscriptionPlan.id).where(Subscription.id == p.subscriptionId))).scalar_one_or_none()
        name = (await db.execute(select(Profile.displayName).where(Profile.userId == p.userId))).scalar_one_or_none()
        items.append({"id": r.id, "paymentId": r.paymentId, "amountXof": r.amountXof, "reason": r.reason, "source": ev(r.source), "status": ev(r.status),
                      "requestedById": r.requestedById, "decidedById": r.decidedById, "decisionNote": r.decisionNote, "failureReason": r.failureReason,
                      "creditsReversed": r.creditsReversed, "createdAt": r.createdAt, "decidedAt": r.decidedAt, "provider": p.provider,
                      "product": prod.name if prod else (ev(plan) if plan else None), "displayName": name or "—"})
    return {"items": items, "nextCursor": rows[take - 1].id if len(rows) > take else None}


async def reject(db: AsyncSession, admin_id: str, refund_id: str, note: str) -> dict:
    res = await db.execute(update(Refund).where(Refund.id == refund_id, Refund.status == "REQUESTED")
                           .values(status="REJECTED", decidedById=admin_id, decisionNote=note, decidedAt=utcnow()))
    if res.rowcount == 0:
        raise AppError(409, "REFUND_NOT_PENDING", "Demande déjà traitée")
    await db.commit()
    refund = await db.get(Refund, refund_id)
    payment = await db.get(Payment, refund.paymentId)
    await notifications.create(db, payment.userId, "REFUND_UPDATE", {"status": "REJECTED"})
    return {"status": "REJECTED"}


async def approve(db: AsyncSession, admin_id: str, refund_id: str, note: str | None = None, manual: bool = False) -> dict:
    refund = (await db.execute(select(Refund).where(Refund.id == refund_id).execution_options(populate_existing=True))).scalar_one_or_none()
    if not refund:
        raise not_found("REFUND_NOT_FOUND")
    st = ev(refund.status)
    if st in ("COMPLETED", "PROCESSING"):
        return {"status": st}  # rejeu : jamais deux remboursements
    if st != "REQUESTED":
        raise AppError(409, "REFUND_NOT_PENDING", "Demande déjà traitée")
    # Double validation : pour une demande d'administrateur, l'approbateur est une autre personne.
    if ev(refund.source) == "ADMIN" and refund.requestedById == admin_id:
        raise forbidden("SELF_APPROVAL", "La demande doit être approuvée par un autre administrateur")
    # Prise en charge atomique : un seul approbateur peut lancer l'exécution.
    claim = await db.execute(update(Refund).where(Refund.id == refund_id, Refund.status == "REQUESTED")
                             .values(status="PROCESSING", decidedById=admin_id, decisionNote=note))
    await db.commit()
    if claim.rowcount == 0:
        return {"status": "PROCESSING"}
    payment = (await db.execute(select(Payment).where(Payment.id == refund.paymentId).execution_options(populate_existing=True))).scalar_one()
    provider_ref: str | None = "manual"
    if not manual:
        try:
            provider_ref = (await payments.provider_refund(payment.providerRef, payment.amountXof)).get("providerRef")
        except Exception as e:  # le fournisseur a refusé ou est injoignable : demande en échec, rien d'autre ne change
            reason = (str(e) or "échec")[:300]
            await db.execute(update(Refund).where(Refund.id == refund_id).values(status="FAILED", failureReason=reason, decidedAt=utcnow()))
            await db.commit()
            await notifications.create(db, payment.userId, "REFUND_UPDATE", {"status": "FAILED"})
            return {"status": "FAILED", "failureReason": reason}
    payment.status = "REFUNDED"
    reversed_ = await _apply_effects(db, payment, refund_id)
    await db.execute(update(Refund).where(Refund.id == refund_id).values(status="COMPLETED", providerRef=provider_ref, decidedAt=utcnow(), creditsReversed=reversed_))
    await db.commit()
    await payments.sync_entitlement(db, payment.userId, utcnow())
    await notifications.create(db, payment.userId, "REFUND_UPDATE", {"status": "COMPLETED", "amountXof": payment.amountXof})
    return {"status": "COMPLETED", "creditsReversed": reversed_}


async def _apply_effects(db: AsyncSession, payment: Payment, refund_id: str) -> int:
    """Retire ce que le paiement avait accordé : abonnement résilié, crédits restants repris (le déjà consommé ne se reprend pas)."""
    reversed_ = 0
    if ev(payment.kind) == "PRODUCT" and payment.productId:
        prod = await db.get(Product, payment.productId)
        reversed_ += await credits.reverse(db, payment.userId, ev(prod.creditType), prod.quantity, refund_id)
    elif payment.subscriptionId:
        sub = await db.get(Subscription, payment.subscriptionId)
        plan = await db.get(SubscriptionPlan, sub.planId)
        sub.status, sub.cancelAtPeriodEnd, sub.currentPeriodEnd = "CANCELED", True, utcnow()
        feats = await plan_config.features_of(db, ev(plan.code))
        if feats["boosts_monthly"] > 0:
            reversed_ += await credits.reverse(db, payment.userId, "BOOST_120", feats["boosts_monthly"] * sub.months, f"{refund_id}:plan")
        if feats["match_tokens_monthly"] > 0:
            reversed_ += await credits.reverse(db, payment.userId, "MATCH_TOKEN", feats["match_tokens_monthly"] * sub.months, f"{refund_id}:plan-tokens")
    return reversed_

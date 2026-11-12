"""Paiements : abonnements et achats ponctuels. Le montant est CALCULÉ côté serveur (tarif configuré × durée − remise), jamais lu du client.
Rien n'est activé tant que le fournisseur n'a pas confirmé (webhook signé ou vérification serveur). Tout est idempotent."""
from __future__ import annotations

import asyncio
import datetime
import json
import logging
import re

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import access, credits, invoicing, entitlements, kkiapay, notifications, payment_config, plan_config, promo
from app.core.config import get_settings
from app.core.errors import AppError, bad_request, not_found, unauthorized
from app.core.ids import new_id, utcnow
from app.core.security import hmac_hex, random_token, safe_equal
from app.models.models import (
    Invoice, Notification, Payment, Product, Subscription, SubscriptionPlan, SystemSetting, User, Profile, WebhookEvent,
)

log = logging.getLogger("payments")
DAY = datetime.timedelta(days=1)
PAST_DUE_GRACE_DAYS = 7
TX_RE = re.compile(r"^[A-Za-z0-9_-]{4,64}$")


def ev(x):
    """Valeur d'une colonne enum (membre d'enum après lecture, simple chaîne après affectation)."""
    return getattr(x, "value", x)


def add_months(d: datetime.datetime, n: int) -> datetime.datetime:
    """Même sémantique que Date.setUTCMonth (un jour inexistant déborde sur le mois suivant)."""
    total = d.year * 12 + (d.month - 1) + n
    y, m = divmod(total, 12)
    return datetime.datetime(y, m + 1, 1, d.hour, d.minute, d.second, d.microsecond) + datetime.timedelta(days=d.day - 1)


class MockProvider:
    """Fournisseur de simulation (dev/CI) : même chemin de webhook signé qu'un vrai fournisseur."""

    name = "mock"

    async def create_checkout(self, payment_id: str, amount_xof: int, plan: str | None = None) -> dict:
        ref = f"mock_{random_token(12)}"
        return {"providerRef": ref, "checkoutUrl": f"{get_settings().app_url}/checkout/mock?ref={ref}"}


def provider(cfg: payment_config.Effective):
    return kkiapay.KkiapayProvider(cfg) if cfg.provider == "kkiapay" else MockProvider()


async def checkout_provider():
    """Fournisseur pour ENCAISSER : en production, la simulation n'est jamais proposée (aucun paiement factice, aucun accès offert sans payer).
    La configuration active (administration, sinon variables d'environnement) décide du fournisseur."""
    cfg = await payment_config.effective()
    if get_settings().is_prod and cfg.provider != "kkiapay":
        raise AppError(503, "PAYMENTS_UNAVAILABLE")
    return provider(cfg)


async def catalog(db: AsyncSession) -> dict:
    plans = await plan_config.catalog(db)
    products = await plan_config.products(db)
    return {"plans": plans, "products": [
        {"code": p.code, "kind": ev(p.kind), "creditType": ev(p.creditType), "name": p.name, "quantity": p.quantity, "priceXof": p.priceXof, "currency": p.currency}
        for p in products]}


async def current(db: AsyncSession, user_id: str) -> dict:
    e = await entitlements.get(db, user_id)
    row = (await db.execute(
        select(Subscription, SubscriptionPlan.code).join(SubscriptionPlan, SubscriptionPlan.id == Subscription.planId)
        .where(Subscription.userId == user_id, Subscription.status.in_(["ACTIVE", "PAST_DUE"])).order_by(Subscription.createdAt.desc()).limit(1)
    )).first()
    sub = None
    if row:
        s, code = row
        sub = {"id": s.id, "plan": ev(code), "status": ev(s.status), "cancelAtPeriodEnd": s.cancelAtPeriodEnd, "currentPeriodEnd": s.currentPeriodEnd}
    return {"plan": e["plan"], "validUntil": e["validUntil"], "limits": e["limits"], "credits": await credits.balances(db, user_id), "subscription": sub}


async def checkout(db: AsyncSession, user_id: str, code: str, months: int = 1, promo_code: str | None = None) -> dict:
    plan, price = await plan_config.quote(db, code, months)
    plan_row = (await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.code == code))).scalar_one()
    prov = await checkout_provider()
    # Abonnement + paiement (+ remise) dans une transaction : le verrou du code promo garantit qu'il ne dépasse jamais son plafond.
    q = await promo.evaluate(db, user_id, promo_code, price["totalXof"], True) if promo_code else None
    amount = q.finalXof if q else price["totalXof"]
    promo_id, discount = (q.promoId, q.discountXof) if q else (None, 0)
    # Réduction « profil vérifié » (administration) : non cumulée avec un code promo, c'est la plus avantageuse des deux qui s'applique.
    verified = await access.discount_xof(db, user_id, price["totalXof"])
    if verified > discount:
        amount, promo_id, discount = price["totalXof"] - verified, None, verified
    sub = Subscription(userId=user_id, planId=plan_row.id, provider=prov.name, months=months)
    db.add(sub)
    await db.flush()
    payment = Payment(userId=user_id, subscriptionId=sub.id, kind="SUBSCRIPTION", months=months, amountXof=amount,
                      promoCodeId=promo_id, discountXof=discount, provider=prov.name,
                      providerRef=f"pending_{random_token(8)}")
    db.add(payment)
    await db.commit()
    out = await prov.create_checkout(payment.id, amount, plan["code"])
    payment.providerRef = out["providerRef"]
    sub.providerRef = out["providerRef"]
    await db.commit()
    return {"checkoutUrl": out.get("checkoutUrl"), "widget": out.get("widget"), "paymentId": payment.id, "providerRef": out["providerRef"],
            "provider": prov.name, "amountXof": amount, "discountXof": payment.discountXof}


async def checkout_product(db: AsyncSession, user_id: str, code: str, promo_code: str | None = None) -> dict:
    """Achat ponctuel (boost, pack) : prix lu en base, jamais envoyé par le client."""
    product = (await db.execute(select(Product).where(Product.code == code, Product.active.is_(True)))).scalar_one_or_none()
    if not product:
        raise not_found("PRODUCT_NOT_FOUND")
    prov = await checkout_provider()
    q = await promo.evaluate(db, user_id, promo_code, product.priceXof, True) if promo_code else None
    payment = Payment(userId=user_id, kind="PRODUCT", productId=product.id, quantity=product.quantity,
                      amountXof=q.finalXof if q else product.priceXof, promoCodeId=q.promoId if q else None,
                      discountXof=q.discountXof if q else 0, provider=prov.name, providerRef=f"pending_{random_token(8)}")
    db.add(payment)
    await db.commit()
    out = await prov.create_checkout(payment.id, payment.amountXof)
    payment.providerRef = out["providerRef"]
    await db.commit()
    return {"checkoutUrl": out.get("checkoutUrl"), "widget": out.get("widget"), "paymentId": payment.id, "providerRef": out["providerRef"],
            "provider": prov.name, "amountXof": payment.amountXof, "discountXof": payment.discountXof}


async def _record_event(db: AsyncSession, provider_name: str, event_id: str, type_: str) -> bool:
    """True si l'événement est nouveau, False si c'est un rejeu (unicité provider+eventId)."""
    stmt = insert(WebhookEvent).values(id=new_id(), provider=provider_name, eventId=event_id, type=type_, receivedAt=utcnow()) \
        .on_conflict_do_nothing(index_elements=["provider", "eventId"]).returning(WebhookEvent.id)
    new = (await db.execute(stmt)).first() is not None
    await db.commit()
    return new


async def handle_webhook(db: AsyncSession, provider_name: str, raw: bytes, signature: str | None) -> dict:
    """Authentifie (HMAC-SHA256 du corps brut), dédoublonne (WebhookEvent) puis applique. Idempotent."""
    if provider_name != "mock" or get_settings().is_prod:  # webhook simulé : jamais en production
        raise not_found("UNKNOWN_PROVIDER")
    expected = hmac_hex(get_settings().payment_webhook_secret, raw)
    if not signature or not safe_equal(expected, signature):
        raise unauthorized("INVALID_SIGNATURE")
    try:
        payload = json.loads(raw.decode("utf8"))
    except ValueError:
        raise bad_request("INVALID_PAYLOAD") from None
    if not isinstance(payload, dict) or not payload.get("id") or not payload.get("providerRef") or payload.get("type") not in ("payment.succeeded", "payment.failed"):
        raise bad_request("INVALID_PAYLOAD")
    if not await _record_event(db, provider_name, payload["id"], payload["type"]):
        return {"duplicate": True}  # rejeu : événement déjà reçu
    payment = (await db.execute(select(Payment).where(Payment.provider == provider_name, Payment.providerRef == payload["providerRef"]))).scalar_one_or_none()
    if not payment:
        raise not_found("PAYMENT_NOT_FOUND")
    if ev(payment.status) == "PENDING":
        if payload["type"] == "payment.succeeded":
            await apply_success(db, payment.id)
        else:
            await apply_failure(db, payment.id, payload.get("reason"))
    await db.execute(update(WebhookEvent).where(WebhookEvent.provider == provider_name, WebhookEvent.eventId == payload["id"]).values(processedAt=utcnow()))
    await db.commit()
    return {"ok": True}


async def apply_success(db: AsyncSession, payment_id: str) -> None:
    now = utcnow()
    # Prise en charge atomique PENDING → SUCCEEDED : deux confirmations simultanées n'appliquent qu'une fois.
    claimed = await db.execute(update(Payment).where(Payment.id == payment_id, Payment.status == "PENDING").values(status="SUCCEEDED", paidAt=now))
    if claimed.rowcount == 0:
        await db.rollback()
        return
    payment = (await db.execute(select(Payment).where(Payment.id == payment_id).execution_options(populate_existing=True))).scalar_one()
    db.add(Invoice(paymentId=payment.id, amountXof=payment.amountXof, number=await invoicing.next_number(db, now)))
    product = await db.get(Product, payment.productId) if payment.productId else None
    sub = await db.get(Subscription, payment.subscriptionId) if payment.subscriptionId else None
    plan_code = None
    valid_until = None
    if ev(payment.kind) == "PRODUCT" and product:
        # Crédits ajoutés une seule fois (journal unique par paiement) : un webhook rejoué n'ajoute rien.
        await credits.grant(db, payment.userId, ev(product.creditType), product.quantity, "PURCHASE", payment.id)
        await db.commit()
    elif sub:
        plan_row = await db.get(SubscriptionPlan, sub.planId)
        plan_code = ev(plan_row.code)
        # Un seul abonnement actif à la fois : les autres sont clôturés (changement de formule immédiat).
        await db.execute(update(Subscription).where(Subscription.userId == payment.userId, Subscription.id != sub.id,
                                                    Subscription.status.in_(["ACTIVE", "PAST_DUE", "PENDING"])).values(status="CANCELED"))
        base = sub.currentPeriodEnd if (ev(sub.status) == "ACTIVE" and sub.currentPeriodEnd and sub.currentPeriodEnd > now) else now
        valid_until = add_months(base, sub.months)
        sub.status, sub.currentPeriodEnd, sub.cancelAtPeriodEnd = "ACTIVE", valid_until, False
        await entitlements.set_(db, payment.userId, plan_code, valid_until)
        feats = await plan_config.features_of(db, plan_code)
        # Boosts inclus dans la formule (configurable) : crédités pour chaque mois acheté.
        if feats["boosts_monthly"] > 0:
            await credits.grant(db, payment.userId, "BOOST_120", feats["boosts_monthly"] * sub.months, "GRANT_PLAN", payment.id)
        # Jetons Match inclus : référence distincte, car l'unicité du journal ne tient pas compte du type.
        if feats["match_tokens_monthly"] > 0:
            await credits.grant(db, payment.userId, "MATCH_TOKEN", feats["match_tokens_monthly"] * sub.months, "GRANT_PLAN", f"{payment.id}:tokens")
        await db.commit()
    else:
        await db.commit()
    if ev(payment.kind) == "PRODUCT":
        await notifications.create(db, payment.userId, "SUBSCRIPTION_ACTIVATED", {"product": product.name if product else ""})
    elif sub:
        await notifications.create(db, payment.userId, "SUBSCRIPTION_ACTIVATED",
                                   {"plan": plan_code, "validUntil": (valid_until.isoformat(timespec="milliseconds") + "Z") if valid_until else None})


async def apply_failure(db: AsyncSession, payment_id: str, reason: str | None = None) -> None:
    payment = (await db.execute(select(Payment).where(Payment.id == payment_id).execution_options(populate_existing=True))).scalar_one()
    payment.status, payment.failureReason = "FAILED", reason[:200] if reason else None
    if payment.subscriptionId:
        sub = await db.get(Subscription, payment.subscriptionId)
        if sub:
            sub.status = "PAST_DUE" if ev(sub.status) == "ACTIVE" else "CANCELED"
    await db.commit()
    await notifications.create(db, payment.userId, "SUBSCRIPTION_EXPIRING", {"reason": "payment_failed"})


# ───────── KKiaPay ─────────

async def confirm_kkiapay(db: AsyncSession, user_id: str, reference: str, transaction_id: str) -> dict:
    """Confirmation après le widget : le navigateur ne fournit que `reference` + `transactionId` ; le statut et le montant viennent de KKiaPay."""
    cfg = await payment_config.effective()
    if provider(cfg).name != "kkiapay":
        raise AppError(404, "NOT_FOUND")
    # Par référence d'abord (paiement en attente) ; en repli par transaction = rejeu d'une confirmation déjà traitée.
    q = select(Payment).where(Payment.provider == "kkiapay", Payment.userId == user_id)
    payment = (await db.execute(q.where(Payment.providerRef == reference))).scalars().first() or \
        (await db.execute(q.where(Payment.providerRef == f"tx_{transaction_id}"))).scalars().first()
    if not payment:
        raise not_found("PAYMENT_NOT_FOUND")
    return await settle_kkiapay(db, payment.id, transaction_id)


async def handle_kkiapay_webhook(db: AsyncSession, raw: bytes, secret_header: str | None) -> dict:
    """Webhook KKiaPay : secret authentifié, puis RE-VÉRIFICATION de la transaction auprès de KKiaPay (le corps n'est jamais cru)."""
    cfg = await payment_config.effective()
    secret = cfg.webhook_secret
    if provider(cfg).name != "kkiapay" or not secret:
        raise not_found("UNKNOWN_PROVIDER")
    # KKiaPay renvoie tel quel le « hash secret » du tableau de bord dans x-kkiapay-secret.
    if not safe_equal(secret_header or "", secret):
        raise unauthorized("INVALID_SIGNATURE")
    try:
        body = json.loads(raw.decode("utf8"))
    except ValueError:
        raise bad_request("INVALID_PAYLOAD") from None
    tx_id = body.get("transactionId") if isinstance(body, dict) and isinstance(body.get("transactionId"), str) else ""
    if not TX_RE.match(tx_id):
        raise bad_request("INVALID_PAYLOAD")
    event = body.get("event") or "event"
    if not await _record_event(db, "kkiapay", f"{tx_id}:{event}", event):
        return {"duplicate": True}
    tx = await kkiapay.verify_transaction(cfg, tx_id)
    if tx and tx.reference and not tx.reference.startswith((kkiapay.REF_PREFIX, kkiapay.LEGACY_REF_PREFIX)):
        return {"ok": True, "ignored": True}  # transaction d'une autre application du même compte KKiaPay (ex. WaMarket) : ce n'est pas la nôtre
    refs = [f"tx_{tx_id}"] + ([tx.reference] if tx and tx.reference else [])
    payment = (await db.execute(select(Payment).where(Payment.provider == "kkiapay", Payment.providerRef.in_(refs)))).scalars().first()
    if not payment:
        return {"ok": True, "unmatched": True}  # la confirmation navigateur (confirm_kkiapay) rattrapera
    await settle_kkiapay(db, payment.id, tx_id)
    return {"ok": True}


async def settle_kkiapay(db: AsyncSession, payment_id: str, transaction_id: str) -> dict:
    payment = (await db.execute(select(Payment).where(Payment.id == payment_id).execution_options(populate_existing=True))).scalar_one()
    if ev(payment.status) != "PENDING":
        return {"status": ev(payment.status)}
    try:
        tx = await kkiapay.verify_transaction(await payment_config.effective(), transaction_id)
    except Exception:
        raise AppError(502, "PROVIDER_UNAVAILABLE", "Fournisseur de paiement injoignable") from None
    if not tx:
        raise bad_request("TRANSACTION_NOT_FOUND")
    if tx.status == "FAILED":
        await apply_failure(db, payment.id, tx.status.lower())
        return {"status": "FAILED"}
    if tx.status != "SUCCESS":
        return {"status": "PENDING"}
    # Montant exact exigé : un paiement partiel (ou celui d'un autre plan) n'active rien.
    if tx.amount != payment.amountXof:
        await apply_failure(db, payment.id, "amount_mismatch")
        return {"status": "FAILED"}
    # Une transaction ne sert qu'une fois : providerRef (unique) est remplacé par l'identifiant de transaction.
    try:
        payment.providerRef = f"tx_{transaction_id}"
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise AppError(409, "TRANSACTION_ALREADY_USED", "Transaction déjà utilisée") from None
    await apply_success(db, payment.id)
    return {"status": "SUCCEEDED"}


async def simulate_provider(db: AsyncSession, user_id: str, provider_ref: str, outcome: str) -> dict:
    """Simulation côté serveur du retour fournisseur (dev uniquement) : passe par le vrai chemin de webhook signé."""
    if get_settings().is_prod:
        raise AppError(404, "NOT_FOUND")
    payment = (await db.execute(select(Payment).where(Payment.provider == "mock", Payment.providerRef == provider_ref))).scalar_one_or_none()
    if not payment or payment.userId != user_id:
        raise not_found("PAYMENT_NOT_FOUND")
    payload = {"id": f"evt_{random_token(10)}", "type": "payment.succeeded" if outcome == "success" else "payment.failed", "providerRef": provider_ref}
    if outcome == "fail":
        payload["reason"] = "declined"
    raw = json.dumps(payload, separators=(",", ":")).encode()
    return await handle_webhook(db, "mock", raw, hmac_hex(get_settings().payment_webhook_secret, raw))


async def cancel(db: AsyncSession, user_id: str, resume: bool = False) -> dict:
    res = await db.execute(update(Subscription).where(Subscription.userId == user_id, Subscription.status == "ACTIVE").values(cancelAtPeriodEnd=not resume, updatedAt=utcnow()))
    if res.rowcount == 0:
        raise not_found("NO_ACTIVE_SUBSCRIPTION")
    await db.commit()
    return await current(db, user_id)


async def history(db: AsyncSession, user_id: str) -> list[dict]:
    pays = (await db.execute(select(Payment).where(Payment.userId == user_id).order_by(Payment.createdAt.desc()).limit(100))).scalars().all()
    out = []
    for p in pays:
        inv = (await db.execute(select(Invoice.number).where(Invoice.paymentId == p.id).limit(1))).scalar_one_or_none()
        prod = await db.get(Product, p.productId) if p.productId else None
        plan = None
        if p.subscriptionId:
            plan = (await db.execute(select(SubscriptionPlan.code).join(Subscription, Subscription.planId == SubscriptionPlan.id).where(Subscription.id == p.subscriptionId))).scalar_one_or_none()
        out.append({
            "id": p.id, "kind": ev(p.kind), "months": p.months, "product": prod.name if prod else None,
            "amountXof": p.amountXof, "currency": p.currency, "status": ev(p.status), "provider": p.provider, "plan": ev(plan) if plan else None,
            "createdAt": p.createdAt, "paidAt": p.paidAt, "invoiceNumber": inv,
        })
    return out


async def invoice(db: AsyncSession, user_id: str, payment_id: str) -> dict:
    """Données de la facture d'un paiement réussi du membre (JSON de l'écran et base du PDF)."""
    p = (await db.execute(select(Payment).where(Payment.id == payment_id, Payment.userId == user_id, Payment.status == "SUCCEEDED"))).scalar_one_or_none()
    inv = (await db.execute(select(Invoice).where(Invoice.paymentId == payment_id))).scalars().first() if p else None
    if not p or not inv:
        raise not_found("INVOICE_NOT_FOUND")
    user = await db.get(User, p.userId)
    name = (await db.execute(select(Profile.displayName).where(Profile.userId == p.userId))).scalar_one_or_none() or ""
    site = get_settings().site_name
    if ev(p.kind) == "PRODUCT":
        prod = await db.get(Product, p.productId) if p.productId else None
        desc = f"{site} — {prod.name if prod else ''}"
        line = prod.name if prod else site
    else:
        plan_name = ""
        if p.subscriptionId:
            plan_name = (await db.execute(select(SubscriptionPlan.name).join(Subscription, Subscription.planId == SubscriptionPlan.id).where(Subscription.id == p.subscriptionId))).scalar_one_or_none()
        desc = f"Abonnement {site} {plan_name} — {p.months} mois"
        line = f"Abonnement {site} {plan_name} · {p.months} mois"
    company = await invoicing.company(db)
    discount = int(p.discountXof or 0)
    promo_code = None
    if p.promoCodeId:
        from app.models.models import PromoCode

        promo_code = (await db.execute(select(PromoCode.code).where(PromoCode.id == p.promoCodeId))).scalar_one_or_none()
    label = (f"Code promo {promo_code}" if promo_code else "Réduction profil vérifié") if discount > 0 else None
    t = invoicing.totals(inv.amountXof, discount, company["vatPercent"])
    method = {"kkiapay": "Paiement en ligne (Mobile Money ou carte) via KKiaPay"}.get(p.provider, "Paiement en ligne")
    return {"number": inv.number, "issuedAt": inv.issuedAt, "customer": {"name": name, "email": user.email, "memberId": user.id[-8:].upper()}, "description": desc,
            "amountXof": inv.amountXof, "currency": p.currency, "provider": p.provider, "paidAt": p.paidAt, "seller": company, "discountLabel": label,
            "lines": [{"description": line, "quantity": 1, "unitXof": t["gross"], "totalXof": t["gross"]}], "totals": t,
            "payment": {"method": method, "reference": p.providerRef}}


async def run_expiry_job(db: AsyncSession, now: datetime.datetime | None = None) -> dict:
    """Expire les abonnements échus (ou les passe « impayé »), rappelle les échéances à J-3. Appelable manuellement (admin/tests)."""
    now = now or utcnow()
    due = (await db.execute(select(Subscription).where(Subscription.status == "ACTIVE", Subscription.currentPeriodEnd < now))).scalars().all()
    for s in due:
        s.status = "EXPIRED" if s.cancelAtPeriodEnd else "PAST_DUE"
        await db.commit()
        await sync_entitlement(db, s.userId, now)
        await notifications.create(db, s.userId, "SUBSCRIPTION_EXPIRING", {"expired": True})
    stale = await db.execute(update(Subscription).where(Subscription.status == "PAST_DUE", Subscription.currentPeriodEnd < now - PAST_DUE_GRACE_DAYS * DAY).values(status="EXPIRED"))
    await db.commit()
    soon = (await db.execute(select(Subscription).where(Subscription.status == "ACTIVE", Subscription.cancelAtPeriodEnd.is_(False),
                                                         Subscription.currentPeriodEnd >= now, Subscription.currentPeriodEnd < now + 3 * DAY))).scalars().all()
    reminded = 0
    for s in soon:
        already = (await db.execute(select(func.count()).select_from(Notification).where(
            Notification.userId == s.userId, Notification.type == "SUBSCRIPTION_EXPIRING", Notification.createdAt > now - 4 * DAY))).scalar_one()
        if not already:
            await notifications.create(db, s.userId, "SUBSCRIPTION_EXPIRING", {"endsAt": s.currentPeriodEnd.isoformat(timespec="milliseconds") + "Z" if s.currentPeriodEnd else None})
            reminded += 1
    return {"expired": len(due), "expiredStale": stale.rowcount, "reminded": reminded}


async def sync_entitlement(db: AsyncSession, user_id: str, now: datetime.datetime) -> None:
    """Recalcule les droits d'un membre à partir de ses abonnements réellement actifs."""
    row = (await db.execute(
        select(Subscription.currentPeriodEnd, SubscriptionPlan.code).join(SubscriptionPlan, SubscriptionPlan.id == Subscription.planId)
        .where(Subscription.userId == user_id, Subscription.status == "ACTIVE", Subscription.currentPeriodEnd > now)
        .order_by(Subscription.currentPeriodEnd.desc()).limit(1)
    )).first()
    if row:
        await entitlements.set_(db, user_id, ev(row[1]), row[0])
    else:
        await entitlements.set_(db, user_id, "FREE", None)
    await db.commit()


async def expiry_loop(maker) -> None:
    """Job d'expiration horaire (instance unique). À lancer au démarrage hors test (asyncio.create_task) ; multi-instances → cron avec verrou."""
    while True:
        await asyncio.sleep(3600)
        try:
            async with maker() as db:
                await run_expiry_job(db)
        except Exception:
            log.exception("expiry job")

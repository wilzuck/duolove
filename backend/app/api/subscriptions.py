"""Abonnements, achats ponctuels, codes promo, paiements, factures, webhooks fournisseurs."""
from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import payments, plan_config, promo
from app.core.auth import AuthUser, current_user, verified_user
from app.core.errors import bad_request
from app.core.flags import require_flag
from app.core.ratelimit import limit
from app.db.session import get_db
from app.schemas.payments import (
    Checkout, KkiapayConfirm, LegacyCheckout, PromoPreview, PromoRedeem, SimulateOutcome, SubscriptionCheckout,
)

router = APIRouter(tags=["subscriptions"])


@router.get("/subscriptions/plans")
async def plans(db: AsyncSession = Depends(get_db)):
    return await payments.catalog(db)


@router.get("/plans")
async def plans_alias(db: AsyncSession = Depends(get_db)):
    return await payments.catalog(db)


@router.get("/subscriptions/me")
async def me(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await payments.current(db, u.id)


@router.post("/subscriptions/checkout", status_code=201, dependencies=[require_flag("payments_enabled"), limit(10)])
async def checkout_legacy(body: LegacyCheckout, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await payments.checkout(db, u.id, body.plan, body.months)


@router.post("/checkout", status_code=201, dependencies=[require_flag("payments_enabled"), limit(10)])
async def checkout_any(body: Checkout, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    """Point d'entrée unique : abonnement (offre + durée) ou achat ponctuel (boost, pack). Le montant est toujours calculé serveur."""
    if isinstance(body, SubscriptionCheckout):
        return await payments.checkout(db, u.id, body.plan, body.months, body.promoCode)
    return await payments.checkout_product(db, u.id, body.code, body.promoCode)


@router.post("/promo/lookup", dependencies=[limit(10)])
async def promo_lookup(body: PromoRedeem, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Que vaut ce code pour moi ? Limité en fréquence : pas de recherche de codes par force brute."""
    return await promo.lookup(db, u.id, body.code)


@router.post("/promo/preview", dependencies=[limit(20)])
async def promo_preview(body: PromoPreview, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Aperçu de la remise (sans rien réserver) : le prix de base est lu en configuration, jamais fourni par le client."""
    t = body.target
    if isinstance(t, SubscriptionCheckout):
        base = (await plan_config.quote(db, t.plan, t.months))[1]["totalXof"]
    else:
        p = next((x for x in await plan_config.products(db) if x.code == t.code), None)
        if not p:
            raise bad_request("PRODUCT_NOT_FOUND")
        base = p.priceXof
    q = await promo.evaluate(db, u.id, body.code, base)
    return {"code": q.code, "percent": q.percent, "baseXof": base, "discountXof": q.discountXof, "finalXof": q.finalXof}


@router.post("/promo/redeem", dependencies=[limit(10)])
async def promo_redeem(body: PromoRedeem, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    """Code « jetons offerts » : crédite une seule fois par membre."""
    return await promo.redeem_tokens(db, u.id, body.code)


@router.post("/subscriptions/cancel")
async def cancel(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await payments.cancel(db, u.id)


@router.post("/subscriptions/resume")
async def resume(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await payments.cancel(db, u.id, True)


@router.get("/payments")
async def history(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await payments.history(db, u.id)


@router.get("/payments/{payment_id}/invoice")
async def invoice(payment_id: str, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await payments.invoice(db, u.id, payment_id)


@router.get("/payments/{payment_id}/invoice.pdf")
async def invoice_pdf(payment_id: str, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Facture PDF téléchargeable (réservée à son titulaire)."""
    import asyncio

    from fastapi.responses import Response

    from app.core import invoicing

    d = await payments.invoice(db, u.id, payment_id)
    fmt = lambda x: x.strftime("%d/%m/%Y") if x else ""  # noqa: E731
    pdf = await asyncio.to_thread(invoicing.render_pdf, {**d, "issuedAt": fmt(d["issuedAt"]), "paidAt": fmt(d["paidAt"])})
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="Facture-{d["number"]}.pdf"', "Cache-Control": "private, no-store"})


@router.post("/payments/webhook/{provider}")
async def webhook(provider: str, request: Request, x_duomatch_signature: str | None = Header(None), x_kkiapay_secret: str | None = Header(None),
                  db: AsyncSession = Depends(get_db)):
    """Webhook fournisseur : non authentifié par cookie, authentifié par signature HMAC du corps brut."""
    raw = await request.body()
    if not raw:
        raise bad_request("INVALID_PAYLOAD")
    if provider == "kkiapay":
        return await payments.handle_kkiapay_webhook(db, raw, x_kkiapay_secret)
    return await payments.handle_webhook(db, provider, raw, x_duomatch_signature)


@router.post("/payments/kkiapay/confirm", dependencies=[limit(20)])
async def confirm_kkiapay(body: KkiapayConfirm, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Après le widget KKiaPay : le serveur re-vérifie la transaction auprès de KKiaPay avant d'activer quoi que ce soit."""
    return await payments.confirm_kkiapay(db, u.id, body.reference, body.transactionId)


@router.post("/payments/mock/{ref}/complete")
async def simulate(ref: str, body: SimulateOutcome, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Page de paiement simulée (dev uniquement, 404 en production) : le serveur envoie lui-même le webhook signé."""
    return await payments.simulate_provider(db, u.id, ref, body.outcome)

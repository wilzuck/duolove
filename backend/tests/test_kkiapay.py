"""Paiement et remboursement KKiaPay (port de kkiapay.spec.ts). L'API KKiaPay est simulée : aucun appel réseau."""
import secrets

import pytest
from sqlalchemy import func, select

from app.core import kkiapay
from app.core.config import get_settings
from app.db.session import session_maker
from app.models.models import Payment
from tests.support_c import member, plan_of, set_role

RUN = secrets.token_hex(3).upper()  # les identifiants de transaction ne doivent pas se recouper entre exécutions
SECRET = "hash-secret-for-tests"


@pytest.fixture(scope="module", autouse=True)
def kk_env():
    with pytest.MonkeyPatch.context() as mp:
        for k, v in {"PAYMENT_PROVIDER": "kkiapay", "KKIAPAY_PUBLIC_KEY": "pk_test_fake", "KKIAPAY_PRIVATE_KEY": "private_fake", "KKIAPAY_SECRET_KEY": "secret_fake",
                     "KKIAPAY_WEBHOOK_SECRET": SECRET, "KKIAPAY_SANDBOX": "true", "SITE_NAME": "Crushduo"}.items():
            mp.setenv(k, v)
        get_settings.cache_clear()
        yield
    get_settings.cache_clear()


@pytest.fixture
def fake(monkeypatch):
    state = {"txs": {}}

    async def post_json(url, headers, body, timeout):
        # Comme le SDK officiel KKiaPay : clé publique dans x-api-key, clé privée dans x-private-key, secret dans x-secret-key.
        assert headers["x-api-key"] == "pk_test_fake" and headers["x-private-key"] == "private_fake" and headers["x-secret-key"] == "secret_fake"
        assert url == "https://api-sandbox.kkiapay.me/api/v1/transactions/status"
        tx = state["txs"].get(body["transactionId"])
        return (200, tx) if tx else (404, {})

    monkeypatch.setattr(kkiapay, "post_json", post_json)
    return state


async def confirm(a, widget, tx):
    return await a.agent.post("/api/payments/kkiapay/confirm", json={"reference": widget["reference"], "transactionId": tx})


async def test_checkout_renvoie_la_config_du_widget_et_n_active_rien(app, db, fake):
    a = await member(app, db)
    r = await a.agent.post("/api/subscriptions/checkout", json={"plan": "PREMIUM"})
    assert r.status_code == 201
    b = r.json()
    assert b["checkoutUrl"] is None
    assert b["widget"]["publicKey"] == "pk_test_fake" and b["widget"]["sandbox"] is True and b["widget"]["amount"] == 2500 and b["widget"]["name"] == "Crushduo"
    assert b["widget"]["reference"].startswith("crushduo_") and "Premium" in b["widget"]["reason"] and "crushduo" in b["widget"]["data"]
    assert await plan_of(a) == "FREE"
    assert "private_fake" not in r.text  # les clés privées ne sortent jamais


async def test_active_apres_verification_serveur_idempotent_et_facture(app, db, fake):
    a = await member(app, db)
    widget = (await a.agent.post("/api/subscriptions/checkout", json={"plan": "PREMIUM"})).json()["widget"]
    assert (await confirm(a, widget, f"TX_UNKNOWN_{RUN}")).status_code == 400  # transaction inconnue : rien ne change
    fake["txs"][f"TX_PENDING_{RUN}"] = {"status": "PENDING", "amount": 2500}
    assert (await confirm(a, widget, f"TX_PENDING_{RUN}")).json()["status"] == "PENDING"
    assert await plan_of(a) == "FREE"
    fake["txs"][f"TX_OK1_{RUN}"] = {"status": "SUCCESS", "amount": 2500}
    assert (await confirm(a, widget, f"TX_OK1_{RUN}")).json()["status"] == "SUCCEEDED"
    assert await plan_of(a) == "PREMIUM"
    assert (await confirm(a, widget, f"TX_OK1_{RUN}")).status_code == 200
    async with session_maker()() as s:
        assert (await s.execute(select(func.count()).select_from(Payment).where(Payment.userId == a.id, Payment.status == "SUCCEEDED"))).scalar_one() == 1
    hist = (await a.agent.get("/api/payments")).json()
    inv = (await a.agent.get(f"/api/payments/{hist[0]['id']}/invoice")).json()
    assert "Crushduo" in inv["description"] and inv["amountXof"] == 2500


async def test_refuse_montant_different_et_transaction_reutilisee(app, db, fake):
    a = await member(app, db)
    w1 = (await a.agent.post("/api/subscriptions/checkout", json={"plan": "VIP"})).json()["widget"]  # 5000
    fake["txs"][f"TX_SMALL_{RUN}"] = {"status": "SUCCESS", "amount": 2500}
    await confirm(a, w1, f"TX_SMALL_{RUN}")
    assert await plan_of(a) == "FREE"
    assert (await a.agent.get("/api/payments")).json()[0]["status"] == "FAILED"
    w2 = (await a.agent.post("/api/subscriptions/checkout", json={"plan": "PREMIUM"})).json()["widget"]  # 2500
    fake["txs"][f"TX_ONCE_{RUN}"] = {"status": "SUCCESS", "amount": 2500}
    await confirm(a, w2, f"TX_ONCE_{RUN}")
    assert await plan_of(a) == "PREMIUM"
    w3 = (await a.agent.post("/api/subscriptions/checkout", json={"plan": "PREMIUM"})).json()["widget"]
    reuse = await confirm(a, w3, f"TX_ONCE_{RUN}")  # même transaction sur un 2e paiement de même montant → refusée
    assert reuse.status_code == 409 and reuse.json()["error"]["code"] == "TRANSACTION_ALREADY_USED"


async def test_un_autre_membre_ne_peut_pas_confirmer(app, db, fake):
    a, b = await member(app, db), await member(app, db)
    w = (await a.agent.post("/api/subscriptions/checkout", json={"plan": "PREMIUM"})).json()["widget"]
    fake["txs"][f"TX_A_{RUN}"] = {"status": "SUCCESS", "amount": 2500}
    assert (await confirm(b, w, f"TX_A_{RUN}")).status_code == 404
    assert await plan_of(b) == "FREE"


async def test_webhook_secret_exige_reverification_et_rejeu_ignore(app, http, db, fake):
    a = await member(app, db)
    w = (await a.agent.post("/api/subscriptions/checkout", json={"plan": "PREMIUM"})).json()["widget"]
    fake["txs"][f"TX_HOOK_{RUN}"] = {"status": "SUCCESS", "amount": 2500, "partnerId": w["reference"]}
    body = f'{{"transactionId":"TX_HOOK_{RUN}","event":"transaction.success","isPaymentSucces":true}}'

    def post(secret=None):
        h = {"content-type": "application/json", **({"x-kkiapay-secret": secret} if secret else {})}
        return http.post("/api/payments/webhook/kkiapay", content=body, headers=h)

    assert (await post()).status_code == 401
    assert (await post("mauvais-secret")).status_code == 401
    assert await plan_of(a) == "FREE"
    assert (await post(SECRET)).status_code == 200
    assert await plan_of(a) == "PREMIUM"
    assert (await post(SECRET)).json()["duplicate"] is True
    # un webhook authentique pour une transaction que KKiaPay ne connaît pas n'active rien
    forged = f'{{"transactionId":"TX_FORGED_{RUN}","event":"transaction.success"}}'
    f = await http.post("/api/payments/webhook/kkiapay", content=forged, headers={"content-type": "application/json", "x-kkiapay-secret": SECRET})
    assert f.status_code == 200
    # une transaction d'une autre application du même compte KKiaPay est ignorée, sans rien activer
    fake["txs"][f"TX_OTHER_{RUN}"] = {"status": "SUCCESS", "amount": 2500, "partnerId": "wamarket_abc123def456"}
    other = await http.post("/api/payments/webhook/kkiapay", content=f'{{"transactionId":"TX_OTHER_{RUN}","event":"transaction.success"}}', headers={"content-type": "application/json", "x-kkiapay-secret": SECRET})
    assert other.status_code == 200 and other.json().get("ignored") is True


async def test_simulation_inactive_avec_kkiapay(app, db, fake):
    a = await member(app, db)
    assert (await a.agent.post("/api/payments/mock/mock_x/complete", json={"outcome": "success"})).status_code == 404


async def test_facture_pdf_titulaire_seulement_et_numerotation_continue(app, db, fake):
    from app.models.models import Invoice

    a, b = await member(app, db), await member(app, db)
    widget = (await a.agent.post("/api/subscriptions/checkout", json={"plan": "PREMIUM"})).json()["widget"]
    tx = f"TX_INV_{RUN}"
    fake["txs"][tx] = {"status": "SUCCESS", "amount": 2500}
    await confirm(a, widget, tx)
    pid = (await a.agent.get("/api/payments")).json()[0]["id"]
    r = await a.agent.get(f"/api/payments/{pid}/invoice.pdf")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf" and r.content.startswith(b"%PDF")
    assert "attachment" in r.headers["content-disposition"] and "Facture-CD-" in r.headers["content-disposition"]
    assert (await b.agent.get(f"/api/payments/{pid}/invoice.pdf")).status_code == 404  # pas la facture d'un autre membre
    data = (await a.agent.get(f"/api/payments/{pid}/invoice")).json()
    assert data["totals"]["total"] == 2500 and data["seller"]["legalName"] and data["lines"][0]["quantity"] == 1
    async with session_maker()() as s:
        nums = sorted((await s.execute(select(Invoice.number).where(Invoice.number.like("CD-%")))).scalars().all())
    assert len(nums) == len(set(nums))  # numéros uniques


async def test_facture_remise_et_tva_et_reglages(app, db, fake):
    from app.core import invoicing

    t = invoicing.totals(1250, 1250, 0)
    assert t == {"gross": 2500, "discount": 1250, "ht": 1250, "vat": 0, "vatPercent": 0, "total": 1250}
    v = invoicing.totals(1180, 0, 18)
    assert v["ht"] + v["vat"] == 1180 and v["vat"] == 180
    pdf = invoicing.render_pdf({"number": "CD-2026-000001", "issuedAt": "12/11/2026", "paidAt": "12/11/2026", "seller": {"legalName": "Crushduo", "address": "", "city": "Cotonou", "country": "Bénin", "registration": "", "email": "", "phone": "", "website": "https://crushduo.com", "footerNote": "Merci de votre confiance."},
                                "customer": {"name": "Awa Dossou", "email": "awa@example.com", "memberId": "AB12CD34"}, "lines": [{"description": "Abonnement Crushduo Premium · 1 mois", "quantity": 1, "unitXof": 2500, "totalXof": 2500}],
                                "totals": invoicing.totals(1250, 1250, 0), "discountLabel": "Réduction profil vérifié", "payment": {"method": "Paiement en ligne via KKiaPay", "reference": "tx_123"}})
    assert pdf.startswith(b"%PDF") and len(pdf) > 2000

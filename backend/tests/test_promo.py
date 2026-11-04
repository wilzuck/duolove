"""Codes promo : remise en pourcentage, jetons offerts, consultation (port de promo.spec.ts ; le parrainage relève du module referral)."""
import asyncio
import datetime

from sqlalchemy import select

from app.db.session import session_maker
from app.models.models import AuditLog, Payment, Refund
from tests.helpers import uid
from tests.support_c import admin, balances, member

new_code = lambda p="T": f"{p}{uid()}".upper()  # noqa: E731


def iso(delta_days: float) -> str:
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=delta_days)).isoformat()


async def create_promo(a, **body) -> dict:
    r = await a.agent.post("/api/admin/promos", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def test_seul_un_admin_cree_un_code_donnees_incoherentes_refusees_et_audit(app, db):
    u = await member(app, db)
    assert (await u.agent.post("/api/admin/promos", json={"code": new_code(), "kind": "PERCENT", "percent": 10})).status_code == 403
    a = await admin(app, db)
    assert (await a.agent.post("/api/admin/promos", json={"code": new_code(), "kind": "PERCENT", "percent": 95})).status_code == 400  # 90 % maximum
    assert (await a.agent.post("/api/admin/promos", json={"code": new_code(), "kind": "PERCENT", "tokens": 3})).status_code == 400
    p = await create_promo(a, code=new_code(), kind="PERCENT", percent=20)
    assert (await a.agent.post("/api/admin/promos", json={"code": p["code"], "kind": "PERCENT", "percent": 20})).status_code == 409
    async with session_maker()() as s:
        assert len((await s.execute(select(AuditLog).where(AuditLog.action == "promo.create", AuditLog.targetId == p["code"]))).scalars().all()) == 1


async def test_remise_calculee_par_le_serveur_apercu_et_paiement_concordent(app, db):
    a = await admin(app, db)
    p = await create_promo(a, code=new_code(), kind="PERCENT", percent=20)
    u = await member(app, db)
    prev = await u.agent.post("/api/promo/preview", json={"code": p["code"].lower(), "target": {"type": "subscription", "plan": "PREMIUM", "months": 1}})
    assert prev.status_code == 200
    b = prev.json()
    assert (b["percent"], b["baseXof"], b["discountXof"], b["finalXof"]) == (20, 2500, 500, 2000)
    co = await u.agent.post("/api/checkout", json={"type": "subscription", "plan": "PREMIUM", "months": 1, "promoCode": p["code"], "amountXof": 1})
    assert co.status_code == 201 and co.json()["amountXof"] == 2000
    async with session_maker()() as s:
        pay = (await s.execute(select(Payment).where(Payment.userId == u.id))).scalars().first()
        assert (pay.amountXof, pay.discountXof, pay.promoCodeId) == (2000, 500, p["id"])
    a2 = await member(app, db)  # remise aussi sur un achat ponctuel
    assert (await a2.agent.post("/api/checkout", json={"type": "product", "code": "TOKENS_5", "promoCode": p["code"]})).json()["amountXof"] == 800


async def test_un_code_ne_sert_qu_une_fois_par_membre_et_erreur_unique_pour_invalides(app, db):
    a = await admin(app, db)
    p = await create_promo(a, code=new_code(), kind="PERCENT", percent=10)
    u = await member(app, db)
    assert (await u.agent.post("/api/checkout", json={"type": "product", "code": "TOKENS_5", "promoCode": p["code"]})).status_code == 201
    again = await u.agent.post("/api/checkout", json={"type": "product", "code": "TOKENS_5", "promoCode": p["code"]})
    assert again.status_code == 409 and again.json()["error"]["code"] == "PROMO_ALREADY_USED"
    other = await member(app, db)
    expired = await create_promo(a, code=new_code("EXP"), kind="PERCENT", percent=10, startsAt=iso(-2), expiresAt=iso(-1))
    for bad in (new_code("NOPE"), expired["code"]):
        r = await other.agent.post("/api/checkout", json={"type": "product", "code": "TOKENS_5", "promoCode": bad})
        assert r.status_code == 400 and r.json()["error"]["code"] == "PROMO_INVALID"
    off = await create_promo(a, code=new_code("OFF"), kind="PERCENT", percent=10)
    assert (await a.agent.patch(f"/api/admin/promos/{off['id']}", json={"active": False})).status_code == 200
    assert (await other.agent.post("/api/checkout", json={"type": "product", "code": "TOKENS_5", "promoCode": off["code"]})).json()["error"]["code"] == "PROMO_INVALID"


async def test_paiement_echoue_libere_le_code_et_code_jetons_non_applicable(app, db):
    a = await admin(app, db)
    p = await create_promo(a, code=new_code(), kind="PERCENT", percent=50, maxRedemptions=1)
    u, v = await member(app, db), await member(app, db)
    co = await u.agent.post("/api/checkout", json={"type": "product", "code": "TOKENS_5", "promoCode": p["code"]})
    assert co.status_code == 201
    assert (await v.agent.post("/api/checkout", json={"type": "product", "code": "TOKENS_5", "promoCode": p["code"]})).json()["error"]["code"] == "PROMO_EXHAUSTED"
    await u.agent.post(f"/api/payments/mock/{co.json()['providerRef']}/complete", json={"outcome": "fail"})
    assert (await v.agent.post("/api/checkout", json={"type": "product", "code": "TOKENS_5", "promoCode": p["code"]})).status_code == 201
    t = await create_promo(a, code=new_code("TK"), kind="TOKENS", tokens=3)
    assert (await u.agent.post("/api/checkout", json={"type": "product", "code": "TOKENS_5", "promoCode": t["code"]})).json()["error"]["code"] == "PROMO_NOT_APPLICABLE"


async def test_plafond_global_respecte_sous_concurrence(app, db):
    a = await admin(app, db)
    p = await create_promo(a, code=new_code(), kind="PERCENT", percent=30, maxRedemptions=1)
    x, y = await member(app, db), await member(app, db)
    rs = await asyncio.gather(*[u.agent.post("/api/checkout", json={"type": "product", "code": "TOKENS_5", "promoCode": p["code"]}) for u in (x, y)])
    assert sorted(r.status_code for r in rs) == [201, 409]
    async with session_maker()() as s:
        assert len((await s.execute(select(Payment).where(Payment.promoCodeId == p["id"]))).scalars().all()) == 1


async def test_remise_correcte_au_remboursement(app, db):
    a = await admin(app, db)
    p = await create_promo(a, code=new_code(), kind="PERCENT", percent=40)
    u = await member(app, db)
    co = await u.agent.post("/api/checkout", json={"type": "subscription", "plan": "PREMIUM", "months": 1, "promoCode": p["code"]})
    await u.agent.post(f"/api/payments/mock/{co.json()['providerRef']}/complete", json={"outcome": "success"})
    req = await u.agent.post(f"/api/payments/{co.json()['paymentId']}/refund-request", json={"reason": "Je change d'avis"})
    assert (await a.agent.post(f"/api/admin/refunds/{req.json()['id']}/approve", json={})).status_code == 200
    async with session_maker()() as s:
        r = (await s.execute(select(Refund).where(Refund.paymentId == co.json()["paymentId"]))).scalars().first()
        assert r.amountXof == 1500  # 2500 − 40 %


async def test_jetons_offerts_une_fois_par_membre_et_plafond_global(app, db):
    a = await admin(app, db)
    p = await create_promo(a, code=new_code("TK"), kind="TOKENS", tokens=4, maxRedemptions=2)
    x, y, z = await member(app, db), await member(app, db), await member(app, db)
    r1 = await x.agent.post("/api/promo/redeem", json={"code": p["code"]})
    assert r1.status_code == 200 and r1.json()["tokens"] == 4
    assert (await balances(x.id))["MATCH_TOKEN"] == 4
    assert (await x.agent.post("/api/promo/redeem", json={"code": p["code"]})).json()["error"]["code"] == "PROMO_ALREADY_USED"
    assert (await balances(x.id))["MATCH_TOKEN"] == 4
    assert (await y.agent.post("/api/promo/redeem", json={"code": p["code"]})).status_code == 200
    assert (await z.agent.post("/api/promo/redeem", json={"code": p["code"]})).json()["error"]["code"] == "PROMO_EXHAUSTED"
    assert (await balances(z.id))["MATCH_TOKEN"] == 0
    lst = (await a.agent.get("/api/admin/promos")).json()
    assert next(q for q in lst if q["code"] == p["code"])["used"] == 2


async def test_rafales_simultanees_un_seul_credit_et_code_remise_sans_jetons(app, db):
    a = await admin(app, db)
    p = await create_promo(a, code=new_code("TK"), kind="TOKENS", tokens=2)
    u = await member(app, db)
    rs = await asyncio.gather(*[u.agent.post("/api/promo/redeem", json={"code": p["code"]}) for _ in range(3)])
    assert len([r for r in rs if r.status_code == 200]) == 1
    assert (await balances(u.id))["MATCH_TOKEN"] == 2
    pct = await create_promo(a, code=new_code(), kind="PERCENT", percent=10)
    assert (await u.agent.post("/api/promo/redeem", json={"code": pct["code"]})).json()["error"]["code"] == "PROMO_NOT_APPLICABLE"


async def test_consultation_d_un_code_memes_refus_que_l_utilisation(app, db):
    a = await admin(app, db)
    pct = await create_promo(a, code=new_code(), kind="PERCENT", percent=15)
    tk = await create_promo(a, code=new_code("TK"), kind="TOKENS", tokens=6)
    u = await member(app, db)
    b1 = (await u.agent.post("/api/promo/lookup", json={"code": pct["code"]})).json()
    assert b1["kind"] == "PERCENT" and b1["percent"] == 15
    b2 = (await u.agent.post("/api/promo/lookup", json={"code": tk["code"]})).json()
    assert b2["kind"] == "TOKENS" and b2["tokens"] == 6
    assert (await u.agent.post("/api/promo/lookup", json={"code": new_code("NOPE")})).json()["error"]["code"] == "PROMO_INVALID"
    await u.agent.post("/api/promo/redeem", json={"code": tk["code"]})
    assert (await u.agent.post("/api/promo/lookup", json={"code": tk["code"]})).json()["error"]["code"] == "PROMO_ALREADY_USED"

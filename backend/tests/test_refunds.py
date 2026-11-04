"""Remboursements (port de refunds.spec.ts)."""
import asyncio

from sqlalchemy import func, select, update

from app.core import credits as credits_core
from app.db.session import session_maker
from app.models.models import CreditTransaction, Notification, Payment, Refund, Subscription
from tests.support_c import admin, balances, buy, member, plan_of, set_role


async def pay_status(pid: str) -> str:
    async with session_maker()() as s:
        return (await s.get(Payment, pid)).status.value


async def buy_id(a, body) -> str:
    co = await buy(a, body)
    return co["paymentId"]


async def test_demande_membre_delai_proprietaire_doublon_et_approbation(app, db):
    u, other, ad = await member(app, db), await member(app, db), await admin(app, db)
    pid = await buy_id(u, {"type": "subscription", "plan": "PREMIUM", "months": 1})
    assert await plan_of(u) == "PREMIUM"
    assert (await other.agent.post(f"/api/payments/{pid}/refund-request", json={"reason": "pas à moi"})).status_code == 404
    assert (await u.agent.post(f"/api/payments/{pid}/refund-request", json={"reason": "x"})).status_code == 400  # motif trop court
    req = await u.agent.post(f"/api/payments/{pid}/refund-request", json={"reason": "Paiement fait par erreur"})
    assert req.status_code == 201
    assert (await u.agent.post(f"/api/payments/{pid}/refund-request", json={"reason": "encore une fois"})).json()["error"]["code"] == "REFUND_EXISTS"
    assert (await u.agent.get("/api/payments")).json()[0]["refund"] == "REQUESTED"
    # seul un administrateur traite
    assert (await u.agent.post(f"/api/admin/refunds/{req.json()['id']}/approve", json={})).status_code == 403
    ok = await ad.agent.post(f"/api/admin/refunds/{req.json()['id']}/approve", json={"note": "Erreur confirmée"})
    assert ok.json()["status"] == "COMPLETED"
    assert await pay_status(pid) == "REFUNDED"
    assert await plan_of(u) == "FREE"
    async with session_maker()() as s:
        assert (await s.execute(select(func.count()).select_from(Subscription).where(Subscription.userId == u.id, Subscription.status == "CANCELED"))).scalar_one() >= 1
        n = (await s.execute(select(Notification).where(Notification.userId == u.id, Notification.type == "REFUND_UPDATE"))).scalars().first()
        assert n.data["status"] == "COMPLETED"
    assert (await u.agent.get("/api/payments")).json()[0]["refund"] == "COMPLETED"
    assert len((await ad.agent.get("/api/admin/audit-logs?action=refund.approve")).json()["items"]) > 0
    # un paiement déjà remboursé ne se rembourse pas deux fois
    assert (await u.agent.post(f"/api/payments/{pid}/refund-request", json={"reason": "et encore"})).json()["error"]["code"] == "NOT_REFUNDABLE"


async def test_refuse_hors_delai_et_paiement_non_reussi(app, db):
    import datetime

    from app.core.ids import utcnow

    u = await member(app, db)
    pid = await buy_id(u, {"type": "product", "code": "BOOST_30"})
    async with session_maker()() as s:
        await s.execute(update(Payment).where(Payment.id == pid).values(paidAt=utcnow() - datetime.timedelta(days=10)))
        await s.commit()
    assert (await u.agent.post(f"/api/payments/{pid}/refund-request", json={"reason": "trop tard sans doute"})).json()["error"]["code"] == "REFUND_WINDOW_EXPIRED"
    pending = await u.agent.post("/api/checkout", json={"type": "product", "code": "BOOST_30"})
    assert (await u.agent.post(f"/api/payments/{pending.json()['paymentId']}/refund-request", json={"reason": "pas encore payé"})).json()["error"]["code"] == "NOT_REFUNDABLE"


async def test_rejet_le_paiement_reste_valide_et_nouvelle_demande_possible(app, db):
    u, ad = await member(app, db), await admin(app, db)
    pid = await buy_id(u, {"type": "product", "code": "BOOST_120"})
    r1 = await u.agent.post(f"/api/payments/{pid}/refund-request", json={"reason": "Je n’en veux plus"})
    assert (await ad.agent.post(f"/api/admin/refunds/{r1.json()['id']}/reject", json={"note": "Boost déjà utilisé"})).json()["status"] == "REJECTED"
    assert await pay_status(pid) == "SUCCEEDED"
    assert (await balances(u.id))["BOOST_120"] == 1
    assert (await u.agent.post(f"/api/payments/{pid}/refund-request", json={"reason": "Nouvelle demande motivée"})).status_code == 201


async def test_pack_reprend_seulement_les_credits_restants_et_rejeu_sans_effet(app, db):
    u, ad = await member(app, db), await admin(app, db)
    pid = await buy_id(u, {"type": "product", "code": "SUPERLIKE_5"})
    async with session_maker()() as s:  # un Super Like consommé (le consommé ne se reprend pas)
        await credits_core.consume(s, u.id, "SUPER_LIKE", 1, "test-consume")
        await s.commit()
    assert (await balances(u.id))["SUPER_LIKE"] == 4
    req = await u.agent.post(f"/api/payments/{pid}/refund-request", json={"reason": "Remboursement du reliquat"})
    a1 = await ad.agent.post(f"/api/admin/refunds/{req.json()['id']}/approve", json={})
    assert a1.json()["status"] == "COMPLETED" and a1.json()["creditsReversed"] == 4
    assert (await balances(u.id))["SUPER_LIKE"] == 0
    assert (await ad.agent.post(f"/api/admin/refunds/{req.json()['id']}/approve", json={})).json()["status"] == "COMPLETED"
    async with session_maker()() as s:
        assert (await s.execute(select(func.count()).select_from(CreditTransaction).where(CreditTransaction.userId == u.id, CreditTransaction.reason == "REFUND"))).scalar_one() == 1


async def test_rembourser_un_vip_reprend_boosts_et_jetons_inclus(app, db):
    u, ad = await member(app, db), await admin(app, db)
    pid = await buy_id(u, {"type": "subscription", "plan": "VIP", "months": 3})
    bal = await balances(u.id)
    assert bal["BOOST_120"] == 6 and bal["MATCH_TOKEN"] == 45
    req = await u.agent.post(f"/api/payments/{pid}/refund-request", json={"reason": "Changement de situation"})
    assert (await ad.agent.post(f"/api/admin/refunds/{req.json()['id']}/approve", json={})).json()["creditsReversed"] == 51  # 6 boosts + 45 jetons
    bal = await balances(u.id)
    assert bal["BOOST_120"] == 0 and bal["MATCH_TOKEN"] == 0
    assert await plan_of(u) == "FREE"


async def test_demande_admin_ne_peut_pas_etre_approuvee_par_son_auteur(app, db):
    u, a1, a2, mod = await member(app, db), await admin(app, db), await admin(app, db), await member(app, db)
    await set_role(mod.id, "MODERATOR")
    pid = await buy_id(u, {"type": "subscription", "plan": "PREMIUM", "months": 1})
    assert (await mod.agent.post("/api/admin/refunds", json={"paymentId": pid, "reason": "moderateur interdit"})).status_code == 403
    created = await a1.agent.post("/api/admin/refunds", json={"paymentId": pid, "reason": "Geste commercial suite à un incident"})
    assert created.status_code == 201
    rid = created.json()["id"]
    self_ = await a1.agent.post(f"/api/admin/refunds/{rid}/approve", json={})
    assert self_.status_code == 403 and self_.json()["error"]["code"] == "SELF_APPROVAL"
    assert await pay_status(pid) == "SUCCEEDED"
    assert (await a2.agent.post(f"/api/admin/refunds/{rid}/approve", json={})).json()["status"] == "COMPLETED"
    assert await pay_status(pid) == "REFUNDED"
    lst = await a2.agent.get("/api/admin/refunds?status=COMPLETED")
    assert any(r["id"] == rid and r["source"] == "ADMIN" for r in lst.json()["items"])


async def test_deux_approbations_simultanees_un_seul_remboursement(app, db):
    u, a1, a2 = await member(app, db), await admin(app, db), await admin(app, db)
    pid = await buy_id(u, {"type": "product", "code": "SUPERLIKE_5"})
    req = await u.agent.post(f"/api/payments/{pid}/refund-request", json={"reason": "Double clic de l’administrateur"})
    x, y = await asyncio.gather(a1.agent.post(f"/api/admin/refunds/{req.json()['id']}/approve", json={}), a2.agent.post(f"/api/admin/refunds/{req.json()['id']}/approve", json={}))
    assert [x.status_code, y.status_code] == [200, 200]
    async with session_maker()() as s:
        assert (await s.execute(select(func.count()).select_from(Refund).where(Refund.paymentId == pid))).scalar_one() == 1
        assert (await s.execute(select(func.count()).select_from(CreditTransaction).where(CreditTransaction.userId == u.id, CreditTransaction.reason == "REFUND"))).scalar_one() == 1
    assert (await balances(u.id))["SUPER_LIKE"] == 0
    assert await pay_status(pid) == "REFUNDED"

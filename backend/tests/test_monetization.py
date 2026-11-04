"""Catalogue, durées, achats, jetons inclus, administration des offres (port de monetization.spec.ts).
Les scénarios Super Like / boosts / likes envoyés relèvent des tests des modules swipes et boosts."""
import datetime

from tests.support_c import admin, balances, buy, member, plan_of, set_role


async def test_catalogue_expose_les_offres_avec_prix_par_duree(http):
    r = await http.get("/api/plans")
    assert r.status_code == 200
    body = r.json()
    plans = {p["code"]: p for p in body["plans"]}
    assert sorted(plans) == ["FREE", "PREMIUM", "VIP"]
    by = lambda code, m: next(p for p in plans[code]["prices"] if p["months"] == m)  # noqa: E731
    assert by("PREMIUM", 1)["totalXof"] == 2500 and by("PREMIUM", 1)["discountPercent"] == 0 and by("PREMIUM", 1)["monthlyEquivalentXof"] == 2500
    p3 = by("PREMIUM", 3)
    assert (p3["totalXof"], p3["discountPercent"], p3["monthlyEquivalentXof"], p3["savingsXof"]) == (6750, 10, 2250, 750)
    assert by("PREMIUM", 6)["totalXof"] == 12000 and by("PREMIUM", 12)["totalXof"] == 21000 and by("VIP", 12)["totalXof"] == 42000
    assert plans["FREE"]["prices"] == []
    f = plans["PREMIUM"]["features"]
    assert f["daily_likes_limit"] == -1 and f["super_likes_weekly"] == 5 and f["can_see_likes"] is True and f["ads_enabled"] is False
    assert plans["VIP"]["features"]["boosts_monthly"] == 2
    assert [p["code"] for p in body["products"]] == ["BOOST_30", "BOOST_120", "BOOST_1440", "SUPERLIKE_5", "SUPERLIKE_15", "SUPERLIKE_30", "TOKENS_5", "TOKENS_15", "TOKENS_30"]


async def test_montant_calcule_cote_serveur_et_entrees_invalides_refusees(app, db):
    a = await member(app, db)
    co = await a.agent.post("/api/checkout", json={"type": "subscription", "plan": "PREMIUM", "months": 3, "amount": 1, "priceXof": 1})
    assert co.status_code == 201
    assert co.json()["amountXof"] == 6750  # le « amount: 1 » du client est ignoré
    assert (await a.agent.post("/api/checkout", json={"type": "subscription", "plan": "PREMIUM", "months": 2})).status_code == 400
    assert (await a.agent.post("/api/checkout", json={"type": "subscription", "plan": "FREE", "months": 1})).status_code == 400
    assert (await a.agent.post("/api/checkout", json={"type": "product", "code": "INEXISTANT"})).status_code == 404
    assert await plan_of(a) == "FREE"


async def test_abonnement_3_mois_credite_boosts_et_jetons_inclus(app, db):
    a = await member(app, db)
    await buy(a, {"type": "subscription", "plan": "VIP", "months": 3})
    sub = (await a.agent.get("/api/subscriptions/me")).json()
    assert sub["plan"] == "VIP"
    until = datetime.datetime.fromisoformat(sub["validUntil"].replace("Z", "+00:00"))
    months = (until - datetime.datetime.now(datetime.timezone.utc)).total_seconds() / (30.4 * 86400)
    assert 2.9 < months < 3.1
    bal = await balances(a.id)
    assert bal["BOOST_120"] == 6
    assert bal["MATCH_TOKEN"] == 45  # 15 jetons Match inclus × 3 mois
    pay = (await a.agent.get("/api/payments")).json()[0]
    assert (pay["amountXof"], pay["months"], pay["status"]) == (13500, 3, "SUCCEEDED")  # 5000×3 −10 %


async def test_admin_modifie_prix_paiements_existants_inchanges_et_audit(app, http, db):
    u = await member(app, db)
    old = await buy(u, {"type": "subscription", "plan": "PREMIUM", "months": 3})
    ad = await admin(app, db)
    mod = await member(app, db)
    await set_role(mod.id, "MODERATOR")
    assert (await u.agent.patch("/api/admin/plans/PREMIUM", json={"priceXof": 1})).status_code == 403
    assert (await mod.agent.patch("/api/admin/plans/PREMIUM", json={"priceXof": 1})).status_code == 403
    assert (await ad.agent.patch("/api/admin/plans/PREMIUM", json={"priceXof": -5})).status_code == 400
    assert (await ad.agent.patch("/api/admin/plans/FREE", json={"priceXof": 100})).status_code == 403
    try:
        assert (await ad.agent.patch("/api/admin/plans/PREMIUM", json={"priceXof": 3000, "prices": [{"months": 3, "discountPercent": 15}]})).status_code == 200
        plans = (await http.get("/api/plans")).json()["plans"]
        p3 = next(p for p in next(p for p in plans if p["code"] == "PREMIUM")["prices"] if p["months"] == 3)
        assert p3["totalXof"] == 7650  # 3000×3 −15 %
        assert (await u.agent.post("/api/checkout", json={"type": "subscription", "plan": "PREMIUM", "months": 3})).json()["amountXof"] == 7650
        # l'ancien paiement garde son montant et l'abonnement actif sa période
        assert any(p["amountXof"] == old["amountXof"] for p in (await u.agent.get("/api/payments")).json())
        assert (await u.agent.get("/api/subscriptions/me")).json()["plan"] == "PREMIUM"
        logs = await ad.agent.get("/api/admin/audit-logs?action=plan.update")
        assert len(logs.json()["items"]) > 0
    finally:
        await ad.agent.patch("/api/admin/plans/PREMIUM", json={"priceXof": 2500, "prices": [{"months": 3, "discountPercent": 10}]})


async def test_quotas_viennent_de_la_configuration(app, http, db):
    ad = await admin(app, db)
    me = await member(app, db)
    free = next(p for p in (await http.get("/api/plans")).json()["plans"] if p["code"] == "FREE")["features"]
    try:
        assert (await ad.agent.patch("/api/admin/plans/FREE", json={"features": {**free, "daily_likes_limit": 2}})).status_code == 200
        assert (await me.agent.get("/api/subscriptions/me")).json()["limits"]["dailyLikes"] == 2
        assert (await ad.agent.patch("/api/admin/plans/FREE", json={"features": {**free, "daily_likes_limit": "beaucoup"}})).status_code == 400
    finally:
        await ad.agent.patch("/api/admin/plans/FREE", json={"features": free})


async def test_pack_credite_une_seule_fois_meme_rejoue(app, db):
    a = await member(app, db)
    co = await buy(a, {"type": "product", "code": "SUPERLIKE_5"})
    assert co["amountXof"] == 500
    assert (await balances(a.id))["SUPER_LIKE"] == 5
    replay = await a.agent.post(f"/api/payments/mock/{co['providerRef']}/complete", json={"outcome": "success"})
    assert replay.status_code == 200
    assert (await balances(a.id))["SUPER_LIKE"] == 5
    hist = (await a.agent.get("/api/payments")).json()
    assert len([p for p in hist if p["status"] == "SUCCEEDED"]) == 1
    h = hist[0]
    assert h["kind"] == "PRODUCT" and h["product"] == "Pack 5 Super Likes"
    assert "Pack 5 Super Likes" in (await a.agent.get(f"/api/payments/{h['id']}/invoice")).json()["description"]


async def test_echec_de_paiement_ne_credite_rien(app, db):
    a = await member(app, db)
    co = await a.agent.post("/api/checkout", json={"type": "product", "code": "SUPERLIKE_30"})
    await a.agent.post(f"/api/payments/mock/{co.json()['providerRef']}/complete", json={"outcome": "fail"})
    assert (await balances(a.id))["SUPER_LIKE"] == 0


async def test_jetons_inclus_premium_une_seule_fois_par_paiement(app, db):
    a = await member(app, db)
    co = await buy(a, {"type": "subscription", "plan": "PREMIUM", "months": 3})
    assert (await balances(a.id))["MATCH_TOKEN"] == 15
    await a.agent.post(f"/api/payments/mock/{co['providerRef']}/complete", json={"outcome": "success"})  # rejeu
    assert (await balances(a.id))["MATCH_TOKEN"] == 15


async def test_gratuit_sans_jeton_inclus(app, db):
    a = await member(app, db)
    assert (await balances(a.id))["MATCH_TOKEN"] == 0


async def test_annulation_et_reprise(app, db):
    a = await member(app, db)
    assert (await a.agent.post("/api/subscriptions/cancel")).status_code == 404
    await buy(a, {"type": "subscription", "plan": "PREMIUM", "months": 1})
    assert (await a.agent.post("/api/subscriptions/cancel")).json()["subscription"]["cancelAtPeriodEnd"] is True
    assert (await a.agent.post("/api/subscriptions/resume")).json()["subscription"]["cancelAtPeriodEnd"] is False


async def test_webhook_signature_invalide_refusee(http):
    r = await http.post("/api/payments/webhook/mock", content=b'{"id":"x"}', headers={"content-type": "application/json", "x-duomatch-signature": "00"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_SIGNATURE"
    assert (await http.post("/api/payments/webhook/inconnu", content=b"{}", headers={"content-type": "application/json"})).status_code == 404

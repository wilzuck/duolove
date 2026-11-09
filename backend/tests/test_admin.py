"""Administration : droits par rôle, modération, listes paginées, vue d'ensemble, tâches (nouveau en Python : le TS n'avait pas de test dédié)."""
from sqlalchemy import select

from app.db.session import session_maker
from app.models.models import ModerationAction, Report, User
from tests.helpers import uid
from tests.support_c import admin, buy, member, set_role


async def test_permissions_par_role(app, db):
    u, mod, ad = await member(app, db), await member(app, db), await admin(app, db)
    await set_role(mod.id, "MODERATOR")
    assert (await u.agent.get("/api/admin/badges")).status_code == 403
    assert (await mod.agent.get("/api/admin/badges")).status_code == 200
    assert (await mod.agent.get("/api/admin/overview")).status_code == 403  # ADMIN requis
    assert (await ad.agent.get("/api/admin/overview")).status_code == 200
    assert (await mod.agent.get("/api/admin/audit-logs")).status_code == 403
    assert (await ad.agent.patch(f"/api/admin/users/{u.id}/role", json={"role": "MODERATOR"})).status_code == 403  # SUPER_ADMIN requis


async def test_vue_d_ensemble_et_listes(app, db):
    ad, u = await admin(app, db), await member(app, db)
    await buy(u, {"type": "subscription", "plan": "PREMIUM", "months": 1})
    for _ in range(2):  # un curseur n'existe que s'il reste des lignes après 2 : il faut 3 abonnements, sans dépendre de données déjà présentes (base vide en CI)
        await buy(await member(app, db), {"type": "subscription", "plan": "PREMIUM", "months": 1})
    o = (await ad.agent.get("/api/admin/overview")).json()
    for k in ("users", "signups7", "revenueXof", "conversionRate", "retentionD7", "planDistribution", "recentSignups", "signupsPerDay", "topCountries", "refundedXof"):
        assert k in o
    assert o["revenueXof"] >= 2500 and o["users"] >= 2
    subs = (await ad.agent.get("/api/admin/subscriptions?limit=2")).json()
    assert len(subs["items"]) == 2 and subs["nextCursor"]
    page2 = (await ad.agent.get(f"/api/admin/subscriptions?limit=2&cursor={subs['nextCursor']}")).json()
    assert {i["id"] for i in subs["items"]}.isdisjoint({i["id"] for i in page2["items"]})
    pays = (await ad.agent.get("/api/admin/payments?limit=5")).json()["items"]
    assert pays and {"id", "amountXof", "status", "provider", "invoiceNumber", "refund"} <= set(pays[0])
    assert (await ad.agent.post("/api/admin/jobs/expire-subscriptions")).json().keys() >= {"expired", "expiredStale", "reminded"}


async def test_utilisateurs_recherche_email_reserve_aux_admins_et_sanctions(app, db):
    ad, mod, target = await admin(app, db), await member(app, db), await member(app, db)
    await set_role(mod.id, "MODERATOR")
    found = (await ad.agent.get(f"/api/admin/users?q={target.email}")).json()["items"]
    assert [i["id"] for i in found] == [target.id] and found[0]["email"] == target.email
    assert (await mod.agent.get(f"/api/admin/users?q={target.email}")).json()["items"] == []  # un modérateur ne cherche pas par e-mail
    assert (await mod.agent.get(f"/api/admin/users/{target.id}")).json()["email"] is None
    # sanctions : suspendre, un modérateur ne sanctionne ni un admin ni lui-même
    assert (await mod.agent.post(f"/api/admin/users/{ad.id}/suspend", json={"reason": "test interdit"})).json()["error"]["code"] == "CANNOT_SANCTION_STAFF"
    assert (await mod.agent.post(f"/api/admin/users/{mod.id}/suspend", json={"reason": "moi-même"})).status_code == 403
    assert (await mod.agent.post(f"/api/admin/users/{target.id}/suspend", json={"reason": "Comportement abusif", "days": 3})).json() == {"ok": True}
    async with session_maker()() as s:
        t = await s.get(User, target.id)
        assert t.status.value == "SUSPENDED" and t.suspendedUntil
    assert (await target.agent.get("/api/admin/badges")).status_code == 403
    assert (await mod.agent.post(f"/api/admin/users/{target.id}/unsuspend", json={"reason": "Erreur"})).status_code == 200
    assert (await mod.agent.post(f"/api/admin/users/{target.id}/ban", json={"reason": "Récidive"})).status_code == 200
    assert (await target.agent.get("/api/subscriptions/me")).status_code == 401  # sessions révoquées
    async with session_maker()() as s:
        actions = (await s.execute(select(ModerationAction.type).where(ModerationAction.targetUserId == target.id))).scalars().all()
        assert {a.value for a in actions} == {"SUSPEND", "UNSUSPEND", "BAN"}


async def test_signalements_et_role(app, db):
    ad, mod, reporter, target = await admin(app, db), await member(app, db), await member(app, db), await member(app, db)
    await set_role(mod.id, "MODERATOR")
    async with session_maker()() as s:
        r = Report(reporterId=reporter.id, targetId=target.id, reason="SPAM", details=f"d-{uid()}")
        s.add(r)
        await s.commit()
        rid = r.id
    items = (await mod.agent.get("/api/admin/reports?status=OPEN&limit=100")).json()["items"]
    row = next(i for i in items if i["id"] == rid)
    assert row["target"]["id"] == target.id and row["reporter"]["id"] == reporter.id and row["target"]["totalReports"] >= 1
    assert (await mod.agent.post(f"/api/admin/reports/{rid}/resolve", json={"status": "RESOLVED", "note": "ok"})).json() == {"ok": True}
    assert (await mod.agent.post("/api/admin/reports/inconnu/resolve", json={"status": "RESOLVED"})).status_code == 404


async def test_produits_et_audit(app, db):
    ad = await admin(app, db)
    assert (await ad.agent.patch("/api/admin/products/INCONNU", json={"priceXof": 100})).status_code == 404
    old = next(p for p in (await ad.agent.get("/api/admin/plans")).json()["products"] if p["code"] == "TOKENS_5")
    try:
        assert (await ad.agent.patch("/api/admin/products/TOKENS_5", json={"priceXof": 1100})).status_code == 200
        assert next(p for p in (await app_catalog(ad)) if p["code"] == "TOKENS_5")["priceXof"] == 1100
        assert (await ad.agent.patch("/api/admin/products/TOKENS_5", json={"priceXof": -1})).status_code == 400
    finally:
        await ad.agent.patch("/api/admin/products/TOKENS_5", json={"priceXof": old["priceXof"]})
    assert len((await ad.agent.get("/api/admin/audit-logs?action=product.update")).json()["items"]) > 0


async def app_catalog(ad):
    return (await ad.agent.get("/api/plans")).json()["products"]


async def test_overview_period_compares_and_fills_every_day(app, db):
    """`days` borné à 7/30/90 ; chaque série a une valeur par jour (zéro compris) ; la période précédente accompagne la courante."""
    ad = await admin(app, db)
    o = (await ad.agent.get("/api/admin/overview", params={"days": 7})).json()["period"]
    assert o["days"] == 7
    assert set(o["series"]) == {"signups", "likes", "matches", "messages", "revenue"}
    assert all(len(v) == 7 for v in o["series"].values())
    assert o["signups"]["current"] >= 1 and set(o["signups"]) == {"current", "previous"}
    assert o["signups"]["current"] == sum(p["value"] for p in o["series"]["signups"])
    assert (await ad.agent.get("/api/admin/overview", params={"days": 5})).json()["period"]["days"] == 30  # valeur inconnue : défaut
    assert len((await ad.agent.get("/api/admin/overview", params={"days": 90})).json()["period"]["series"]["signups"]) == 90


async def test_summary_counts_by_section_and_hides_money_from_moderators(app, db):
    ad, mod = await admin(app, db), await member(app, db)
    await set_role(mod.id, "MODERATOR")
    a = (await ad.agent.get("/api/admin/summary")).json()
    assert a["users"]["total"] >= 2 and a["users"].get("ACTIVE", 0) >= 2
    assert {"payments", "subscriptions", "refunds", "contact", "reports"} <= set(a) and "revenue30" in a["payments"]
    m = (await mod.agent.get("/api/admin/summary")).json()
    assert set(m) == {"users", "reports"}  # pas de chiffres financiers pour un modérateur


async def test_offrir_et_retirer_une_formule(app, db):
    ad, mod, u = await admin(app, db), await member(app, db), await member(app, db)
    await set_role(mod.id, "MODERATOR")
    body = {"plan": "VIP", "days": 10, "reason": "Cadeau partenaire"}
    assert (await mod.agent.post(f"/api/admin/users/{u.id}/grant-plan", json=body)).status_code == 403  # ADMIN requis
    assert (await ad.agent.post(f"/api/admin/users/{u.id}/grant-plan", json={**body, "days": 400})).status_code == 400  # durée bornée
    assert (await ad.agent.post(f"/api/admin/users/{u.id}/grant-plan", json={**body, "plan": "FREE"})).status_code == 400
    assert (await ad.agent.post(f"/api/admin/users/{u.id}/grant-plan", json=body)).status_code == 200
    me = (await u.agent.get("/api/subscriptions/me")).json()
    assert me["plan"] == "VIP" and me["validUntil"]
    detail = (await ad.agent.get(f"/api/admin/users/{u.id}")).json()
    assert detail["plan"] == "VIP" and detail["planValidUntil"]
    assert (await ad.agent.post(f"/api/admin/users/{u.id}/revoke-plan", json={"reason": "Fin du partenariat"})).status_code == 200
    assert (await u.agent.get("/api/subscriptions/me")).json()["plan"] == "FREE"
    assert (await ad.agent.post(f"/api/admin/users/{uid()}/grant-plan", json=body)).status_code == 404
    logs = (await ad.agent.get("/api/admin/audit-logs")).json()
    assert {"user.grant-plan", "user.revoke-plan"} <= {x["action"] for x in logs["items"]}

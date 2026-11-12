"""Codes promo : remise en pourcentage, jetons offerts, consultation (port de promo.spec.ts ; le parrainage relève du module referral)."""
import asyncio
import datetime

from sqlalchemy import select

from app.db.session import session_maker
from app.models.models import AuditLog, Payment, Refund
from tests.helpers import uid
from tests.support_c import admin, balances, member

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
async def _no_featured_left(app):
    yield
    from sqlalchemy import update

    from app.models.models import PromoCode
    async with session_maker()() as s:  # les tests n'ont pas à laisser de codes proposés actifs dans la base partagée
        await s.execute(update(PromoCode).where(PromoCode.code != "FONDATEUR").values(featured=False))
        await s.commit()


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


async def test_code_propose_aux_membres_affiche_avec_places_restantes_puis_masque(app, db):
    a = await admin(app, db)
    shown = await create_promo(a, code=new_code("FOND"), kind="TOKENS", tokens=2, maxRedemptions=1, featured=True)
    hidden = await create_promo(a, code=new_code("CACHE"), kind="PERCENT", percent=10)
    pct = await create_promo(a, code=new_code("PCT"), kind="PERCENT", percent=50, maxRedemptions=1000, featured=True)
    u, v = await member(app, db), await member(app, db)
    codes = lambda r: {x["code"]: x for x in r.json()["items"]}  # noqa: E731
    mine = codes(await u.agent.get("/api/promo/featured"))
    assert shown["code"] in mine and pct["code"] in mine and hidden["code"] not in mine  # un code non coché n'est jamais révélé
    assert mine[pct["code"]]["percent"] == 50 and mine[pct["code"]]["remaining"] == 1000 and mine[shown["code"]]["tokens"] == 2
    # Le membre le prend : il ne le voit plus ; la place est épuisée pour l'autre (plafond de 1).
    assert (await u.agent.post("/api/promo/redeem", json={"code": shown["code"]})).status_code == 200
    assert shown["code"] not in codes(await u.agent.get("/api/promo/featured"))
    assert shown["code"] not in codes(await v.agent.get("/api/promo/featured"))
    # L'administrateur peut retirer la proposition ou désactiver le code.
    assert (await a.agent.patch(f"/api/admin/promos/{pct['id']}", json={"featured": False})).status_code == 200
    assert pct["code"] not in codes(await v.agent.get("/api/promo/featured"))
    assert (await a.agent.patch(f"/api/admin/promos/{pct['id']}", json={"featured": True, "active": False})).status_code == 200
    assert pct["code"] not in codes(await v.agent.get("/api/promo/featured"))


async def test_delai_reel_apres_inscription_applique_par_le_serveur(app, db):
    from sqlalchemy import update

    from app.models.models import User
    a = await admin(app, db)
    p = await create_promo(a, code=new_code("H24"), kind="PERCENT", percent=50, maxRedemptions=1000, featured=True, claimHours=24)
    assert p["claimHours"] == 24
    assert (await a.agent.post("/api/admin/promos", json={"code": new_code(), "kind": "PERCENT", "percent": 10, "claimHours": 0})).status_code == 400
    fresh, old = await member(app, db), await member(app, db)
    async with session_maker()() as s:  # compte créé il y a 25 h : le délai est écoulé
        await s.execute(update(User).where(User.id == old.id).values(createdAt=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(hours=25)))
        await s.commit()
    seen = {x["code"]: x for x in (await fresh.agent.get("/api/promo/featured")).json()["items"]}
    assert p["code"] in seen and seen[p["code"]]["deadline"].endswith("Z")
    end = datetime.datetime.fromisoformat(seen[p["code"]]["deadline"].replace("Z", "+00:00"))
    assert 23.9 * 3600 < (end - datetime.datetime.now(datetime.timezone.utc)).total_seconds() <= 24 * 3600  # 24 h après l'inscription
    assert p["code"] not in {x["code"] for x in (await old.agent.get("/api/promo/featured")).json()["items"]}
    # Même refus en saisissant le code à la main : le délai est vérifié côté serveur, pas seulement masqué.
    assert (await fresh.agent.post("/api/promo/lookup", json={"code": p["code"]})).status_code == 200
    r = await old.agent.post("/api/promo/lookup", json={"code": p["code"]})
    assert r.status_code == 400 and r.json()["error"]["code"] == "PROMO_INVALID"


async def test_modifier_et_supprimer_un_code_promo(app, db):
    a = await admin(app, db)
    u = await member(app, db)
    p = await create_promo(a, code=new_code("ED"), kind="TOKENS", tokens=3, maxRedemptions=5)
    assert (await u.agent.delete(f"/api/admin/promos/{p['id']}")).status_code == 403
    # Modifier : plafond, délai et mise en avant ; le code, le type et la valeur ne changent pas.
    r = await a.agent.patch(f"/api/admin/promos/{p['id']}", json={"maxRedemptions": 50, "claimHours": 48, "featured": True})
    assert r.status_code == 200
    row = next(x for x in (await a.agent.get("/api/admin/promos")).json() if x["id"] == p["id"])
    assert row["maxRedemptions"] == 50 and row["claimHours"] == 48 and row["featured"] is True and row["tokens"] == 3
    # Utilisé une fois : plus de suppression, et le plafond ne descend pas sous les utilisations faites.
    assert (await u.agent.post("/api/promo/redeem", json={"code": p["code"]})).status_code == 200
    d = await a.agent.delete(f"/api/admin/promos/{p['id']}")
    assert d.status_code == 409 and d.json()["error"]["code"] == "PROMO_IN_USE"
    assert (await a.agent.patch(f"/api/admin/promos/{p['id']}", json={"maxRedemptions": 0})).status_code == 400
    # Jamais utilisé : suppression possible et tracée dans le journal.
    q = await create_promo(a, code=new_code("DEL"), kind="PERCENT", percent=10)
    assert (await a.agent.delete(f"/api/admin/promos/{q['id']}")).status_code == 204
    assert q["code"] not in {x["code"] for x in (await a.agent.get("/api/admin/promos")).json()}
    assert (await a.agent.delete(f"/api/admin/promos/{q['id']}")).status_code == 404
    async with session_maker()() as s:
        assert (await s.execute(select(AuditLog).where(AuditLog.action == "promo.delete", AuditLog.targetId == q["code"]))).scalars().first()


async def test_rappel_de_fin_d_offre_une_seule_fois_notification_et_email_selon_consentement(app, db):
    from sqlalchemy import func, update

    from app.core import promo as promosvc
    from app.models.models import EmailLog, Notification, PromoReminder, User
    a = await admin(app, db)
    # Délai de 720 h : la fenêtre « fin dans moins de 3 h » ne touche que les comptes créés il y a 717 à 720 h, donc seulement ceux de ce test.
    p = await create_promo(a, code=new_code("RAP"), kind="PERCENT", percent=50, maxRedemptions=1000, featured=True, claimHours=720)
    soon, quiet, early = await member(app, db), await member(app, db), await member(app, db)
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    async with session_maker()() as s:  # fin dans 2 h (avec / sans consentement aux offres) ; fin dans 20 h
        for m, left, consent in ((soon, 2, True), (quiet, 2, False), (early, 20, True)):
            await s.execute(update(User).where(User.id == m.id).values(createdAt=now - datetime.timedelta(hours=720 - left), marketingConsent=consent))
        await s.commit()
    for _ in range(3):  # deux balayages suffisent ; le troisième prouve qu'il n'y a pas de second rappel
        async with session_maker()() as s:
            await promosvc.remind_ending(s)
    async with session_maker()() as s:
        got = set((await s.execute(select(PromoReminder.userId).where(PromoReminder.promoId == p["id"]))).scalars().all())
        notes = {r.userId: r.data for r in (await s.execute(select(Notification).where(Notification.type == "ANNOUNCEMENT", Notification.userId.in_([soon.id, quiet.id, early.id]), Notification.data["code"].astext == p["code"]))).scalars().all()}
        count = (await s.execute(select(func.count()).select_from(Notification).where(Notification.userId == soon.id, Notification.type == "ANNOUNCEMENT", Notification.data["code"].astext == p["code"]))).scalar_one()
        mailed = (await s.execute(select(EmailLog.toEmail).where(EmailLog.subject.like("Votre offre de bienvenue%"), EmailLog.toEmail.in_([soon.email, quiet.email, early.email])))).scalars().all()
    await a.agent.patch(f"/api/admin/promos/{p['id']}", json={"active": False})  # ne pas laisser un code à fenêtre 720 h actif pour les exécutions suivantes
    assert {soon.id, quiet.id} <= got and early.id not in got
    assert count == 1 and notes[soon.id]["kind"] == "PROMO_ENDING" and notes[soon.id]["code"] == p["code"] and notes[soon.id]["percent"] == 50
    assert soon.email in mailed and quiet.email not in mailed and early.email not in mailed  # e-mail réservé aux membres ayant accepté les offres


async def test_un_code_propose_plus_ancien_reste_visible_malgre_des_codes_plus_recents_inutilisables(app, db):
    from sqlalchemy import update

    from app.models.models import PromoCode, User
    async with session_maker()() as s:  # isole le test : plus aucun autre code proposé (FONDATEUR est rétabli à la fin)
        was = list((await s.execute(select(PromoCode.id).where(PromoCode.featured.is_(True)))).scalars().all())
        await s.execute(update(PromoCode).values(featured=False))
        await s.commit()
    a = await admin(app, db)
    old = await create_promo(a, code=new_code("ANC"), kind="PERCENT", percent=50, featured=True)
    for i in range(6):  # six codes plus récents, avec un délai de 1 h : écoulé pour ce membre
        await create_promo(a, code=new_code(f"EXP{i}"), kind="PERCENT", percent=10, featured=True, claimHours=1)
    u = await member(app, db)
    async with session_maker()() as s:
        await s.execute(update(User).where(User.id == u.id).values(createdAt=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(hours=5)))
        await s.commit()
    items = (await u.agent.get("/api/promo/featured")).json()["items"]
    assert [x["code"] for x in items] == [old["code"]]
    async with session_maker()() as s:
        await s.execute(update(PromoCode).where(PromoCode.id.in_(was)).values(featured=True))
        await s.commit()


async def test_au_plus_trois_offres_affichees(app, db):
    from sqlalchemy import update

    from app.models.models import PromoCode
    async with session_maker()() as s:
        was = list((await s.execute(select(PromoCode.id).where(PromoCode.featured.is_(True)))).scalars().all())
        await s.execute(update(PromoCode).values(featured=False))
        await s.commit()
    a = await admin(app, db)
    for i in range(5):
        await create_promo(a, code=new_code(f"TRI{i}"), kind="PERCENT", percent=10 + i, featured=True)
    u = await member(app, db)
    assert len((await u.agent.get("/api/promo/featured")).json()["items"]) == 3
    async with session_maker()() as s:
        await s.execute(update(PromoCode).where(PromoCode.id.in_(was)).values(featured=True))
        await s.commit()

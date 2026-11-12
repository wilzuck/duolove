"""Accès payant obligatoire (modèle B) : interrupteur, blocage des membres sans formule, personnel exempté, délai de grâce, garde-fous."""
import datetime

import pytest
from sqlalchemy import delete, update

from app.core import access, entitlements
from app.db.session import session_maker
from app.models.models import Profile, SystemSetting, User
from tests.support_c import admin, member, set_role


@pytest.fixture(autouse=True)
async def clean(app):
    async def wipe():
        async with session_maker()() as s:
            await s.execute(delete(SystemSetting).where(SystemSetting.key == access.KEY))
            await s.commit()
        access.invalidate()

    await wipe()
    yield
    await wipe()


async def super_admin(app, db):
    ad = await admin(app, db)
    await set_role(ad.id, "SUPER_ADMIN")
    return ad


async def test_desactive_par_defaut_rien_n_est_bloque(app, db):
    u = await member(app, db)
    assert (await u.agent.get("/api/discovery")).status_code != 402
    assert (await u.agent.get("/api/users/me")).json()["access"] == {"required": False, "locked": False, "graceEndsAt": None}


async def test_membre_sans_formule_bloque_mais_garde_compte_profil_paiement(app, db):
    ad, u = await super_admin(app, db), await member(app, db)
    on = await ad.agent.put("/api/admin/access", json={"enabled": True, "graceDays": 0})
    assert on.status_code == 200 and on.json()["enabled"] is True
    await set_role(ad.id, "SUPER_ADMIN")
    # le membre existait avant l'activation mais sans délai de grâce (0 jour) : bloqué
    blocked = await u.agent.get("/api/discovery")
    assert blocked.status_code == 402 and blocked.json()["error"]["code"] == "ACCESS_PAYWALL"
    assert (await u.agent.get("/api/matches")).status_code == 402
    me = await u.agent.get("/api/users/me")
    assert me.status_code == 200 and me.json()["access"]["locked"] is True
    assert (await u.agent.get("/api/profiles/me")).status_code == 200
    assert (await u.agent.get("/api/plans")).status_code == 200
    pv = await u.agent.get("/api/access/preview")
    assert pv.status_code == 200 and set(pv.json()["counts"]) == {"city", "country", "activeWeek", "total"}
    assert (await u.agent.post("/api/checkout", json={"type": "subscription", "plan": "PREMIUM", "months": 1})).status_code != 402


async def test_formule_payante_et_personnel_passent(app, db):
    ad, paid, staff = await super_admin(app, db), await member(app, db), await member(app, db)
    await ad.agent.put("/api/admin/access", json={"enabled": True, "graceDays": 0})
    await set_role(staff.id, "MODERATOR")
    async with session_maker()() as s:
        await entitlements.set_(s, paid.id, "PREMIUM", datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(days=30))
        await s.commit()
    assert (await paid.agent.get("/api/discovery")).status_code != 402
    assert (await staff.agent.get("/api/discovery")).status_code != 402


async def test_delai_de_grace_des_anciens_membres_pas_des_nouveaux(app, db):
    ad, old = await super_admin(app, db), await member(app, db)
    await ad.agent.put("/api/admin/access", json={"enabled": True, "graceDays": 30, "trialDays": 0})
    new = await member(app, db)  # inscrit APRÈS l'activation
    async with session_maker()() as s:  # le « nouveau » est vraiment postérieur à la date d'activation
        await s.execute(update(User).where(User.id == new.id).values(createdAt=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)))
        await s.commit()
    m_old = (await old.agent.get("/api/users/me")).json()["access"]
    assert m_old["locked"] is False and m_old["graceEndsAt"] is not None
    assert (await old.agent.get("/api/discovery")).status_code != 402
    assert (await new.agent.get("/api/discovery")).status_code == 402


async def test_garde_fous_droits_et_reversibilite(app, db):
    plain, ad = await member(app, db), await super_admin(app, db)
    assert (await plain.agent.put("/api/admin/access", json={"enabled": True})).status_code == 403
    assert (await ad.agent.put("/api/admin/access", json={"enabled": True, "graceDays": 999})).status_code == 400
    await ad.agent.put("/api/admin/access", json={"enabled": True, "graceDays": 0})
    assert (await plain.agent.get("/api/discovery")).status_code == 402
    off = await ad.agent.put("/api/admin/access", json={"enabled": False, "graceDays": 0})  # coupure d'urgence
    assert off.status_code == 200 and off.json()["enabled"] is False
    assert (await plain.agent.get("/api/discovery")).status_code != 402


async def test_essai_gratuit_par_membre_puis_blocage(app, db):
    """Un nouvel inscrit a N jours gratuits depuis SON inscription ; passé ce délai, il est bloqué ; rallonger l'essai le rouvre."""
    from sqlalchemy import select

    ad, u = await super_admin(app, db), await member(app, db)
    await ad.agent.put("/api/admin/access", json={"enabled": True, "graceDays": 0, "trialDays": 14})
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    async with session_maker()() as s:  # l'activation date d'il y a 20 jours ; le membre s'est inscrit il y a 15 jours (donc APRÈS l'activation)
        row = (await s.execute(select(SystemSetting).where(SystemSetting.key == access.KEY))).scalar_one()
        row.value = {**row.value, "activatedAt": (now - datetime.timedelta(days=20)).isoformat()}
        await s.execute(update(User).where(User.id == u.id).values(createdAt=now - datetime.timedelta(days=15)))
        await s.execute(update(Profile).where(Profile.userId == u.id).values(onboardedAt=now - datetime.timedelta(days=15)))  # l'essai court depuis la fin du profil
        await s.commit()
    access.invalidate()
    assert (await u.agent.get("/api/discovery")).status_code == 402  # essai de 14 jours terminé hier
    await ad.agent.put("/api/admin/access", json={"enabled": True, "graceDays": 0, "trialDays": 30})
    st = (await u.agent.get("/api/users/me")).json()["access"]
    assert st["locked"] is False and st["graceEndsAt"] is not None  # essai rallongé : de nouveau ouvert


async def test_reduction_profil_verifie_au_paiement(app, db):
    """−X % si badge vérifié ET 2 photos approuvées ; non cumulée avec un code promo (le meilleur gagne) ; sans condition de sexe."""
    from sqlalchemy import select

    from app.models.models import Profile, ProfilePhoto

    ad, u, other = await super_admin(app, db), await member(app, db), await member(app, db)
    await ad.agent.put("/api/admin/access", json={"enabled": False, "graceDays": 0, "trialDays": 14, "verifiedDiscountPercent": 50})
    full = (await u.agent.post("/api/checkout", json={"type": "subscription", "plan": "PREMIUM", "months": 1})).json()["amountXof"]
    d = (await u.agent.get("/api/access/discount")).json()
    assert d["percent"] == 50 and d["eligible"] is False and d["verified"] is False
    async with session_maker()() as s:
        prof = (await s.execute(select(Profile).where(Profile.userId == u.id))).scalar_one()
        prof.verified = True  # badge : sans les photos, pas de réduction
        await s.commit()
    assert (await u.agent.get("/api/access/discount")).json()["eligible"] is False
    async with session_maker()() as s:
        for i in range(2):  # deux photos approuvées par la modération
            s.add(ProfilePhoto(profileId=prof.id, key=f"photos/test-{u.id}-{i}.webp", position=90 + i, width=800, height=1000, moderationStatus="APPROVED"))
        await s.commit()
    d = (await u.agent.get("/api/access/discount")).json()
    assert d["eligible"] is True and d["approvedPhotos"] >= 2
    half = (await u.agent.post("/api/checkout", json={"type": "subscription", "plan": "PREMIUM", "months": 1})).json()
    assert half["amountXof"] == full - full * 50 // 100 and half["discountXof"] == full * 50 // 100
    assert (await other.agent.post("/api/checkout", json={"type": "subscription", "plan": "PREMIUM", "months": 1})).json()["amountXof"] == full  # non vérifié : plein tarif


async def test_seuil_de_femmes_alerte_une_seule_fois(app, db, monkeypatch):
    from sqlalchemy import select

    from app.core import mail
    from app.models.models import Profile

    sent = []

    async def fake_send(to, subject, text, *a, **k):
        sent.append(subject)
        return True

    monkeypatch.setattr(mail, "send", fake_send)
    ad, w = await super_admin(app, db), await member(app, db)  # `member` crée une femme par défaut
    async with session_maker()() as s:
        prof = (await s.execute(select(Profile).where(Profile.userId == w.id))).scalar_one()
        prof.verified = True
        await s.execute(update(User).where(User.id == w.id).values(lastActiveAt=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)))
        await s.commit()
    await ad.agent.put("/api/admin/access", json={"enabled": False, "womenThreshold": 100000})
    assert await access.check_threshold() is False and sent == []  # seuil hors d'atteinte
    v = (await ad.agent.get("/api/admin/access")).json()
    assert v["women"]["count"] >= 1 and v["women"]["reached"] is False
    await ad.agent.put("/api/admin/access", json={"enabled": False, "womenThreshold": 1})
    assert await access.check_threshold() is True and len(sent) >= 1
    n = len(sent)
    assert await access.check_threshold() is False and len(sent) == n  # une seule alerte


async def _verified(app, db):
    from sqlalchemy import select

    from app.models.models import Profile, ProfilePhoto

    u = await member(app, db)
    async with session_maker()() as s:
        prof = (await s.execute(select(Profile).where(Profile.userId == u.id))).scalar_one()
        prof.verified = True
        for i in range(2):
            s.add(ProfilePhoto(profileId=prof.id, key=f"photos/v-{u.id}-{i}.webp", position=90 + i, width=800, height=1000, moderationStatus="APPROVED"))
        await s.commit()
    return u


async def _pay(u, months=1):
    co = await u.agent.post("/api/checkout", json={"type": "subscription", "plan": "PREMIUM", "months": months})
    assert co.status_code == 201, co.text
    await u.agent.post(f"/api/payments/mock/{co.json()['providerRef']}/complete", json={"outcome": "success"})
    return co.json()


async def test_reduction_limitee_aux_premiers_mois_payes(app, db):
    """Limite de 1 mois : un forfait de 3 mois n'est remisé que sur 1 mois ; ensuite plus de réduction (un forfait long ne contourne pas la limite)."""
    ad, u = await super_admin(app, db), await _verified(app, db)
    await ad.agent.put("/api/admin/access", json={"enabled": False, "verifiedDiscountPercent": 50, "verifiedDiscountMonths": 1})
    full3 = (await (await member(app, db)).agent.post("/api/checkout", json={"type": "subscription", "plan": "PREMIUM", "months": 3})).json()["amountXof"]
    co = await _pay(u, 3)
    assert co["discountXof"] == round(full3 / 3 * 0.5) and co["amountXof"] == full3 - co["discountXof"]
    d = (await u.agent.get("/api/access/discount")).json()
    assert d["eligible"] is False and d["remainingMonths"] == 0 and d["months"] == 1
    again = (await u.agent.post("/api/checkout", json={"type": "subscription", "plan": "PREMIUM", "months": 1})).json()
    assert again["discountXof"] == 0  # plus de réduction


async def test_reduction_plafonnee_au_nombre_de_beneficiaires(app, db):
    from sqlalchemy import func, select

    from app.models.models import Payment

    ad, first, second = await super_admin(app, db), await _verified(app, db), await _verified(app, db)
    async with session_maker()() as s:  # la base de test garde les bénéficiaires des exécutions précédentes : le plafond se règle sur leur nombre
        takers = (await s.execute(select(func.count(func.distinct(Payment.userId))).where(*access._verified_payments()))).scalar_one()
    await ad.agent.put("/api/admin/access", json={"enabled": False, "verifiedDiscountPercent": 30, "verifiedDiscountMonths": 0, "verifiedDiscountCap": takers + 1})
    assert (await first.agent.get("/api/access/discount")).json()["eligible"] is True
    await _pay(first)  # un bénéficiaire de plus : le plafond est atteint
    d2 = (await second.agent.get("/api/access/discount")).json()
    assert d2["capReached"] is True and d2["eligible"] is False
    assert (await first.agent.get("/api/access/discount")).json()["eligible"] is True  # un bénéficiaire garde son droit


async def test_l_essai_demarre_a_la_fin_du_profil(app, db):
    """Tant que le profil n'est pas terminé l'essai n'a pas commencé (jamais bloqué) ; il court depuis la fin du profil."""
    ad, u = await super_admin(app, db), await member(app, db)
    await ad.agent.put("/api/admin/access", json={"enabled": True, "graceDays": 0, "trialDays": 14})
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    async with session_maker()() as s:
        await s.execute(update(User).where(User.id == u.id).values(createdAt=now))  # inscrit après l'activation
        await s.execute(update(Profile).where(Profile.userId == u.id).values(onboardedAt=None))
        await s.commit()
    st = (await u.agent.get("/api/users/me")).json()["access"]
    assert st["locked"] is False and st["graceEndsAt"] is not None  # profil non terminé : essai pas commencé
    async with session_maker()() as s:  # profil terminé il y a 20 jours : l'essai de 14 jours est fini
        await s.execute(update(Profile).where(Profile.userId == u.id).values(onboardedAt=now - datetime.timedelta(days=20)))
        await s.commit()
    assert (await u.agent.get("/api/users/me")).json()["access"]["locked"] is True
    assert (await u.agent.get("/api/access/preview")).json()["trialDays"] == 14

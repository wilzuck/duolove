"""Accès payant obligatoire (modèle B) : interrupteur, blocage des membres sans formule, personnel exempté, délai de grâce, garde-fous."""
import datetime

import pytest
from sqlalchemy import delete, update

from app.core import access, entitlements
from app.db.session import session_maker
from app.models.models import SystemSetting, User
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

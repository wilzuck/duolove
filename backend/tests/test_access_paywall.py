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
    await ad.agent.put("/api/admin/access", json={"enabled": True, "graceDays": 30})
    new = await member(app, db)  # inscrit APRÈS l'activation
    async with session_maker()() as s:  # le « nouveau » est vraiment postérieur à la date d'activation
        await s.execute(update(User).where(User.id == new.id).values(createdAt=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(seconds=5)))
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

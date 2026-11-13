"""Mode maintenance : désactivé par défaut ; membres refusés (503), inscriptions fermées ; équipe et pages publiques épargnées."""
import pytest
from sqlalchemy import delete

from app.core import sitemode
from app.db.session import session_maker
from app.models.models import SystemSetting
from tests.helpers import PASSWORD, new_agent, uid
from tests.support_c import admin, member, set_role


@pytest.fixture(autouse=True)
async def _reset(app):
    async def wipe():
        async with session_maker()() as s:
            await s.execute(delete(SystemSetting).where(SystemSetting.key == sitemode.KEY))
            await s.commit()
        sitemode.invalidate()

    await wipe()
    yield
    await wipe()


async def test_off_by_default(app, db):
    anon = new_agent(app)
    assert (await anon.get("/api/site/status")).json()["maintenance"] is False
    m = await member(app, db)
    assert (await m.agent.get("/api/users/me")).status_code == 200


async def test_members_blocked_staff_and_public_pages_spared(app, db):
    a = await admin(app, db)
    mod = await member(app, db)
    await set_role(mod.id, "MODERATOR")
    m = await member(app, db)
    assert (await m.agent.put("/api/admin/maintenance", json={"enabled": True})).status_code == 403
    r = await a.agent.put("/api/admin/maintenance", json={"enabled": True, "messageFr": "Retour à 18 h", "messageEn": "Back at 6 pm"})
    assert r.status_code == 200 and r.json()["enabled"] is True and r.json()["since"]
    st = (await new_agent(app).get("/api/site/status")).json()
    assert st == {"maintenance": True, "messageFr": "Retour à 18 h", "messageEn": "Back at 6 pm", "since": r.json()["since"]}
    blocked = await m.agent.get("/api/users/me")
    assert blocked.status_code == 503 and blocked.json()["error"]["code"] == "MAINTENANCE"
    assert (await m.agent.get("/api/discovery/daily")).status_code == 503
    assert (await m.agent.post("/api/auth/logout")).status_code in (200, 204)  # se déconnecter reste possible
    # L'équipe continue de travailler.
    assert (await a.agent.get("/api/users/me")).status_code == 200
    assert (await a.agent.get("/api/admin/maintenance")).json()["enabled"] is True
    assert (await mod.agent.get("/api/users/me")).status_code == 200
    # Pages publiques ouvertes, inscriptions fermées.
    anon = new_agent(app)
    assert (await anon.get("/api/blog", params={"locale": "fr"})).status_code == 200
    reg = await anon.post("/api/auth/register", json={"displayName": "Nouveau", "email": f"x-{uid()}@test.duomatch", "password": PASSWORD, "birthDate": "1995-05-05",
                                                     "gender": "MAN", "country": "BJ", "city": "Cotonou", "acceptTerms": True})
    assert reg.status_code == 503 and reg.json()["error"]["code"] == "MAINTENANCE"
    # Fin de maintenance.
    await a.agent.put("/api/admin/maintenance", json={"enabled": False})
    m2 = await member(app, db)
    assert (await m2.agent.get("/api/users/me")).status_code == 200

"""Boîte de contact : envoi public validé, champ piège, limitation de débit, accès admin, changement de statut."""
import pytest
from sqlalchemy import delete

from app.core import ratelimit
from app.db.session import session_maker
from app.models.models import ContactMessage
from tests.helpers import new_agent
from tests.support_c import admin, member


@pytest.fixture(autouse=True)
async def _clean(app):
    async def wipe():
        async with session_maker()() as s:
            await s.execute(delete(ContactMessage))
            await s.commit()
        ratelimit.reset()

    await wipe()
    yield
    await wipe()


def code(r):
    return (r.json().get("error") or {}).get("code")


def ok_body(**over):
    return {"name": "Awa K.", "email": "Awa@Example.com", "topic": "billing", "message": "Mon paiement n'a pas été pris en compte.", "locale": "fr", **over}


async def test_public_send_then_admin_reads_and_handles(app, db):
    anon = new_agent(app)
    r = await anon.post("/api/contact", json=ok_body())
    assert r.status_code == 201, r.text
    adm = await admin(app, db)
    lst = await adm.agent.get("/api/admin/contact-messages")
    assert lst.status_code == 200
    items = lst.json()["items"]
    assert len(items) == 1 and items[0]["email"] == "awa@example.com" and items[0]["status"] == "NEW"
    assert lst.json()["counts"]["NEW"] == 1
    mid = items[0]["id"]
    assert (await adm.agent.patch(f"/api/admin/contact-messages/{mid}", json={"status": "ANSWERED"})).status_code == 200
    assert (await adm.agent.get("/api/admin/contact-messages")).json()["items"] == []
    done = (await adm.agent.get("/api/admin/contact-messages", params={"status": "ANSWERED"})).json()["items"]
    assert [m["id"] for m in done] == [mid]
    assert (await adm.agent.patch("/api/admin/contact-messages/inconnu", json={"status": "READ"})).status_code == 404


@pytest.mark.parametrize("over", [{"email": "pas-un-email"}, {"message": "court"}, {"name": "  "}, {"topic": "nimporte"}, {"message": "x" * 3001}])
async def test_validation_refuses_bad_input(app, over):
    r = await new_agent(app).post("/api/contact", json=ok_body(**over))
    assert r.status_code == 400, r.text


async def test_honeypot_is_accepted_silently_but_not_stored(app, db):
    assert (await new_agent(app).post("/api/contact", json=ok_body(website="http://spam"))).status_code == 201
    adm = await admin(app, db)
    assert (await adm.agent.get("/api/admin/contact-messages")).json()["items"] == []


async def test_rate_limited_after_five(app, monkeypatch):
    class _Prod:  # la limitation est inactive en environnement de test : on l'active pour ce test
        node_env = "production"

    monkeypatch.setattr(ratelimit, "get_settings", lambda: _Prod())
    anon = new_agent(app)
    for _ in range(5):
        assert (await anon.post("/api/contact", json=ok_body())).status_code == 201
    assert (await anon.post("/api/contact", json=ok_body())).status_code == 429


async def test_only_admins_read(app, db):
    assert (await new_agent(app).get("/api/admin/contact-messages")).status_code in (401, 403)
    m = await member(app, db)
    assert (await m.agent.get("/api/admin/contact-messages")).status_code == 403
    assert (await m.agent.patch("/api/admin/contact-messages/x", json={"status": "READ"})).status_code == 403

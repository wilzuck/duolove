"""Erreurs système : capture des 500 de l'API, des erreurs des tâches de fond et du site, regroupement, confidentialité, suivi admin."""
import logging

from sqlalchemy import delete, select

from app.core import errortrack
from app.models.models import SystemError as SysError
from tests.helpers import new_agent, uid
from tests.support_c import admin, member


async def _wipe(db):
    await db.execute(delete(SysError))
    await db.commit()


async def test_api_500_is_recorded_and_grouped(app, db):
    await _wipe(db)
    path = f"/api/_boom-{uid()}"

    async def boom():
        raise RuntimeError("panne 42 de test")

    app.add_api_route(path, boom, methods=["GET"])
    import httpx

    c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test")
    for _ in range(2):
        r = await c.get(path + "?token=secret")
        assert r.status_code == 500 and r.json()["error"]["code"] == "INTERNAL_ERROR" and "panne" not in r.text  # rien de technique pour le client
    rows = (await db.execute(select(SysError).where(SysError.source == "api"))).scalars().all()
    assert len(rows) == 1 and rows[0].count == 2 and rows[0].kind == "RuntimeError" and rows[0].status == 500
    assert rows[0].path == path and "secret" not in (rows[0].path or "") and "RuntimeError" in (rows[0].stack or "")


async def test_web_report_scrubs_and_groups(app, db):
    await _wipe(db)
    c = new_agent(app)
    for n in (1, 2):
        r = await c.post("/api/errors/report", json={"kind": "TypeError", "message": f"x is undefined chez awa{n}@mail.com id {n}23",
                                                     "path": f"/fr/messages/{'a' * 24}?q=1", "stack": "at f (app.js:1)"})
        assert r.status_code == 204
    rows = (await db.execute(select(SysError).where(SysError.source == "web"))).scalars().all()
    assert len(rows) == 1 and rows[0].count == 2  # même erreur malgré des chiffres différents
    assert "@" not in rows[0].message and rows[0].path == "/fr/messages/:id"
    assert (await c.post("/api/errors/report", json={"message": ""})).status_code == 400


async def test_background_job_errors_are_captured(app, db):
    await _wipe(db)
    errortrack.install_log_capture()
    try:
        raise ValueError("envoi impossible")
    except ValueError:
        logging.getLogger("duomatch.test_job").error("échec de la tâche", exc_info=True)
    assert await errortrack.flush(db) >= 1
    row = (await db.execute(select(SysError).where(SysError.source == "job"))).scalars().first()
    assert row.kind == "ValueError" and row.path == "duomatch.test_job" and "envoi impossible" in row.stack


async def test_admin_tracking_resolve_regress_reopen_delete(app, db):
    await _wipe(db)
    a = await admin(app, db)
    m = await member(app, db)
    await errortrack.record(db, source="web", kind="TypeError", message="boom", path="/fr/discover")
    assert (await m.agent.get("/api/admin/errors")).status_code == 403
    lst = (await a.agent.get("/api/admin/errors")).json()
    assert lst["open"] == 1 and lst["openBySource"] == {"web": 1}
    eid = lst["items"][0]["id"]
    assert (await a.agent.get("/api/admin/badges")).json()["errors"] == 1
    detail = (await a.agent.get(f"/api/admin/errors/{eid}")).json()
    assert detail["message"] == "boom" and "stack" in detail
    r = (await a.agent.post(f"/api/admin/errors/{eid}/resolve", json={"note": "corrigé dans le commit abc"})).json()
    assert r["resolvedAt"] and r["note"] == "corrigé dans le commit abc"
    assert (await a.agent.get("/api/admin/errors")).json()["open"] == 0
    # L'erreur revient : rouverte et marquée « revenue ».
    await errortrack.record(db, source="web", kind="TypeError", message="boom", path="/fr/discover")
    again = (await a.agent.get("/api/admin/errors")).json()["items"][0]
    assert again["resolvedAt"] is None and again["regressed"] is True and again["count"] == 2
    await a.agent.post(f"/api/admin/errors/{eid}/resolve", json={})
    assert (await a.agent.post(f"/api/admin/errors/{eid}/reopen")).json()["resolvedAt"] is None
    assert (await a.agent.delete(f"/api/admin/errors/{eid}")).status_code == 204
    assert (await a.agent.get(f"/api/admin/errors/{eid}")).status_code == 404

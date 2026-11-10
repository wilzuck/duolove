"""Compteur d'installations de l'application : enregistrement anonyme et idempotent, nombre public seulement au-dessus du seuil, détail dans l'admin."""
import uuid

from sqlalchemy import delete, func, select

from app.api import installs
from app.models.models import AppInstall
from tests.support_c import admin


def new_id() -> str:
    return str(uuid.uuid4())


async def test_enregistrement_idempotent_et_valide(http, db):
    i = new_id()
    before = (await db.execute(select(func.count()).select_from(AppInstall))).scalar_one()
    assert (await http.post("/api/installs", json={"id": i, "platform": "android"})).status_code == 202
    assert (await http.post("/api/installs", json={"id": i, "platform": "android"})).status_code == 202  # même appareil : pas compté deux fois
    assert (await db.execute(select(func.count()).select_from(AppInstall))).scalar_one() == before + 1
    assert (await http.post("/api/installs", json={"id": "pas-un-uuid", "platform": "ios"})).status_code == 400
    assert (await http.post("/api/installs", json={"id": new_id(), "platform": "windows-phone"})).status_code == 400
    await db.execute(delete(AppInstall).where(AppInstall.id == i))
    await db.commit()


async def test_nombre_public_masque_sous_le_seuil(http, db, monkeypatch):
    ids = [new_id() for _ in range(3)]
    for i in ids:
        await http.post("/api/installs", json={"id": i, "platform": "ios"})
    total = (await db.execute(select(func.count()).select_from(AppInstall))).scalar_one()
    monkeypatch.setattr(installs, "PUBLIC_MIN", total)  # « dépasser » : le total doit être strictement supérieur au seuil
    assert (await http.get("/api/installs/public")).json() == {"count": None}
    monkeypatch.setattr(installs, "PUBLIC_MIN", total - 1)
    assert (await http.get("/api/installs/public")).json() == {"count": total}
    await db.execute(delete(AppInstall).where(AppInstall.id.in_(ids)))
    await db.commit()


async def test_detail_dans_l_admin(app, db, http):
    ad = await admin(app, db)
    i = new_id()
    await http.post("/api/installs", json={"id": i, "platform": "desktop"})
    s = (await ad.agent.get("/api/admin/stats")).json()
    assert s["installs"]["total"] >= 1 and s["installs"]["desktop"] >= 1
    assert sum(p["value"] for p in s["series"]["installs"]) >= 1
    assert s["flows"]["installs"]["current"] >= 1
    await db.execute(delete(AppInstall).where(AppInstall.id == i))
    await db.commit()

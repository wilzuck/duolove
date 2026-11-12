"""Pays ouverts : valeurs par défaut, réglage par l'admin, inscription limitée aux pays ouverts, membres existants jamais bloqués."""
import pytest
from sqlalchemy import delete

from app.core import launch
from app.db.session import session_maker
from app.models.models import SystemSetting
from tests.helpers import uid
from tests.support_c import admin, member


@pytest.fixture(autouse=True)
async def clean(app):
    async def wipe():
        async with session_maker()() as s:
            await s.execute(delete(SystemSetting).where(SystemSetting.key == launch.KEY))
            await s.commit()

    await wipe()
    yield
    await wipe()


def signup(country: str, mail: str) -> dict:
    return {"email": mail, "password": "Motdepasse-Solide-42", "displayName": "Test", "birthDate": "1995-05-05", "gender": "WOMAN", "country": country, "city": "Ville", "acceptTerms": True}


async def test_par_defaut_six_pays_ouverts(app, http):
    r = await http.get("/api/launch-countries")
    assert r.status_code == 200 and r.json()["countries"] == ["BJ", "CI", "TG", "SN", "NE", "BF"]


async def test_inscription_refusee_hors_pays_ouverts_puis_acceptee_une_fois_ouvert(app, http, db):
    closed = await http.post("/api/auth/register", json=signup("FR", f"ferme-{uid()}@example.com"))
    assert closed.status_code == 403 and closed.json()["error"]["code"] == "COUNTRY_NOT_OPEN"
    ad = await admin(app, db)
    ok = await ad.agent.put("/api/admin/launch-countries", json={"countries": ["BJ", "FR"]})
    assert ok.status_code == 200 and ok.json()["countries"] == ["BJ", "FR"]
    opened = await http.post("/api/auth/register", json=signup("FR", f"ouvert-{uid()}@example.com"))
    assert opened.status_code in (200, 201), opened.text
    assert (await http.post("/api/auth/register", json=signup("CI", f"ci-{uid()}@example.com"))).status_code == 403  # CI n'est plus ouvert


async def test_membre_existant_hors_pays_ouvert_jamais_bloque(app, db):
    ad, u = await admin(app, db), await member(app, db)  # le pays du membre n'a pas d'importance
    assert (await ad.agent.put("/api/admin/launch-countries", json={"countries": ["NE"]})).status_code == 200
    assert (await u.agent.get("/api/users/me")).status_code == 200 and (await u.agent.get("/api/discovery")).status_code != 403


async def test_droits_et_validation(app, db):
    ad, u = await admin(app, db), await member(app, db)
    assert (await u.agent.put("/api/admin/launch-countries", json={"countries": ["BJ"]})).status_code == 403
    assert (await ad.agent.put("/api/admin/launch-countries", json={"countries": []})).status_code == 400
    assert (await ad.agent.put("/api/admin/launch-countries", json={"countries": ["XX"]})).status_code == 400  # aucun pays connu

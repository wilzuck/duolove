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


@pytest.fixture
async def cities_reset(app):
    yield
    async with session_maker()() as s:  # rétablit le réglage de la suite de tests : aucune restriction par ville
        await s.execute(delete(SystemSetting).where(SystemSetting.key == launch.CITIES_KEY))
        s.add(SystemSetting(key=launch.CITIES_KEY, value={"cities": []}))
        await s.commit()


def signup_city(city: str, mail: str) -> dict:
    return {**signup("BJ", mail), "city": city}


async def test_ouverture_par_ville_liste_d_attente_et_membres_existants(app, http, db, cities_reset):
    ad = await admin(app, db)
    # Par défaut : aucune restriction par ville (l'inscription reste ouverte partout) ; l'admin peut l'activer.
    async with session_maker()() as s:
        await s.execute(delete(SystemSetting).where(SystemSetting.key == launch.CITIES_KEY))
        await s.commit()
    assert (await http.get("/api/launch-countries")).json()["cities"] == []
    assert (await http.post("/api/auth/register", json=signup_city("Parakou", f"d-{uid()}@example.com"))).status_code in (200, 201)
    assert (await ad.agent.put("/api/admin/launch-cities", json={"cities": ["Abidjan", "Lomé", "Cotonou", "Abomey-Calavi"]})).status_code == 200
    closed = await http.post("/api/auth/register", json=signup_city("Parakou", f"p-{uid()}@example.com"))
    assert closed.status_code == 403 and closed.json()["error"]["code"] == "CITY_NOT_OPEN"
    for city in ("Cotonou", "cotonou", "LOMÉ", "lome", "Abomey-Calavi"):  # sans tenir compte des accents ni de la casse
        r = await http.post("/api/auth/register", json={**signup_city(city, f"v-{uid()}@example.com"), "country": "TG" if "om" in city.lower() and "abomey" not in city.lower() else "BJ"})
        assert r.status_code in (200, 201), (city, r.text)
    # Liste d'attente : publique, limitée, même réponse si l'adresse est déjà inscrite ; visible par l'admin avec le décompte par ville.
    mail = f"w-{uid()}@example.com"
    for _ in range(2):
        assert (await http.post("/api/waitlist", json={"email": mail, "country": "BJ", "city": "Parakou"})).status_code == 201
    wl = (await ad.agent.get("/api/admin/waitlist")).json()
    assert sum(1 for i in wl["items"] if i["email"] == mail) == 1 and any(c["city"] == "Parakou" and c["count"] >= 1 for c in wl["cities"])
    assert (await http.get("/api/admin/waitlist")).status_code in (401, 403)
    # L'admin règle les villes ; liste vide = aucune restriction ; les membres déjà inscrits ne sont jamais bloqués.
    ok = await ad.agent.put("/api/admin/launch-cities", json={"cities": ["Parakou", " parakou ", "Natitingou"]})
    assert ok.json()["cities"] == ["Parakou", "Natitingou"]
    assert (await http.post("/api/auth/register", json=signup_city("Parakou", f"p2-{uid()}@example.com"))).status_code in (200, 201)
    assert (await http.post("/api/auth/register", json=signup_city("Cotonou", f"c2-{uid()}@example.com"))).status_code == 403
    assert (await ad.agent.put("/api/admin/launch-cities", json={"cities": []})).json()["cities"] == []
    assert (await http.post("/api/auth/register", json=signup_city("Cotonou", f"c3-{uid()}@example.com"))).status_code in (200, 201)
    u = await member(app, db)
    assert (await u.agent.get("/api/auth/session")).status_code == 200  # un membre existant n'est pas touché

"""Pays de connexion (en-tête Cloudflare) : on garde le code pays, jamais l'IP ; l'écart avec le pays déclaré est signalé à la modération, sans rien bloquer."""
import pytest

from app.core import geo
from tests.helpers import PASSWORD, new_agent
from tests.support_c import admin, member


@pytest.mark.parametrize("raw,expected", [("FR", "FR"), ("bj", "BJ"), ("XX", None), ("T1", None), ("", None), ("FRA", None), ("1A", None)])
def test_code_pays_de_l_en_tete(raw, expected):
    assert geo.country_from_headers({"cf-ipcountry": raw}) == expected
    assert geo.country_from_headers({}) is None


async def test_ecart_pays_declare_pays_de_connexion_signale_sans_bloquer(app, db):
    ad, u = await admin(app, db), await member(app, db)
    declared = (await ad.agent.get(f"/api/admin/users/{u.id}")).json()["profile"]["country"]
    other = "FR" if declared != "FR" else "BJ"
    # connexion depuis un AUTRE pays que le pays déclaré
    c = new_agent(app)
    r = await c.post("/api/auth/login", json={"email": u.email, "password": PASSWORD}, headers={"CF-IPCountry": other})
    assert r.status_code == 200  # jamais bloqué
    d = (await ad.agent.get(f"/api/admin/users/{u.id}")).json()
    assert d["lastCountry"] == other
    row = next(x for x in (await ad.agent.get("/api/admin/users?mismatch=true&limit=100")).json()["items"] if x["id"] == u.id)
    assert row["countryMismatch"] is True and row["lastCountry"] == other and row["country"] == declared
    # connexion depuis le pays déclaré : plus d'écart
    r = await new_agent(app).post("/api/auth/login", json={"email": u.email, "password": PASSWORD}, headers={"CF-IPCountry": declared})
    assert r.status_code == 200
    ids = [x["id"] for x in (await ad.agent.get("/api/admin/users?mismatch=true&limit=100")).json()["items"]]
    assert u.id not in ids
    # sans en-tête (ou pays inconnu) : le dernier pays connu est conservé, rien n'est écrit
    await new_agent(app).post("/api/auth/login", json={"email": u.email, "password": PASSWORD}, headers={"CF-IPCountry": "XX"})
    assert (await ad.agent.get(f"/api/admin/users/{u.id}")).json()["lastCountry"] == declared

"""Saisie semi-automatique des villes : villes populaires, accents, seuil de 2 membres, pays inconnu."""
from sqlalchemy import update

from app.core.cities import POPULAR_CITIES, fold, suggest
from app.db.session import session_maker
from app.models.models import Profile
from tests.helpers import new_agent, seed_member, uid


def test_fold_ignores_accents_case_and_dashes():
    assert fold("Lomé") == fold("lome") == "lome"
    assert fold("Saint-Étienne") == fold("saint etienne")


def test_suggest_popular_cities_prefix_first_then_contains():
    out = suggest("TG", "ko", [])
    assert out[0] != "" and all("ko" in fold(c) for c in out)
    assert suggest("TG", "lo", [])[0] == "Lomé"
    # sans saisie : les plus peuplées d'abord
    assert suggest("BJ", "", [])[0] == "Cotonou"
    assert suggest("BJ", "", []) == list(POPULAR_CITIES["BJ"][:8])


def test_member_cities_need_two_members_and_do_not_duplicate_popular_ones():
    members = [("Lomé", 50), ("Aképé", 3), ("Zio", 1), ("lome", 9)]
    out = suggest("TG", "", members)
    assert "Aképé" in out or "Aképé" in suggest("TG", "ak", members)  # 3 membres : proposée
    assert "Zio" not in suggest("TG", "zi", members)  # 1 seul membre : jamais révélée
    assert [c.lower() for c in out].count("lomé") == 1  # pas de doublon avec « lome »
    assert suggest("XX", "a", members) == [] and suggest(None, "a", members) == []


async def test_endpoint_is_public_and_merges_member_cities(app, db):
    city = f"Zzville{uid()}"
    for _ in range(2):
        m = await seed_member(db, gender="WOMAN", seeking="MEN", city=city, country="TG")
    anon = new_agent(app)
    r = await anon.get("/api/places/cities", params={"country": "tg", "q": "lom"})
    assert r.status_code == 200 and r.json()["items"][0] == "Lomé"
    mine = (await anon.get("/api/places/cities", params={"country": "TG", "q": city[:8]})).json()["items"]
    assert city in mine  # deux membres y vivent
    # un seul membre : la ville n'apparaît pas
    lone = f"Zzsolo{uid()}"
    async with session_maker()() as s:
        await s.execute(update(Profile).where(Profile.userId == m["id"]).values(city=lone))
        await s.commit()
    assert lone not in (await anon.get("/api/places/cities", params={"country": "TG", "q": "Zzsolo"})).json()["items"]
    assert (await anon.get("/api/places/cities", params={"country": "ZZ", "q": "a"})).json() == {"items": []}

"""Mode de vie du profil : situation, études, tabac, alcool, religion (masquée par défaut) et signe astrologique calculé."""
import datetime

from app.core.lifestyle import zodiac
from tests.helpers import make_premium
from tests.support_c import member


def test_signe_astrologique_aux_dates_limites():
    d = datetime.date
    assert zodiac(d(1990, 1, 19)) == "capricorn" and zodiac(d(1990, 1, 20)) == "aquarius"
    assert zodiac(d(1990, 3, 20)) == "pisces" and zodiac(d(1990, 3, 21)) == "aries"
    assert zodiac(d(1990, 12, 21)) == "sagittarius" and zodiac(d(1990, 12, 22)) == "capricorn"
    assert zodiac(None) is None


async def test_options_facultatives_religion_masquee_par_defaut(app, db):
    me, other = await member(app, db), await member(app, db, gender="MAN")
    r = await me.agent.patch("/api/profiles/me", json={"maritalStatus": "SINGLE", "education": "MASTER", "smoking": "NEVER", "alcohol": "SOMETIMES", "religion": "CHRISTIAN"})
    assert r.status_code == 200, r.text
    mine = r.json()
    assert mine["religion"] == "CHRISTIAN" and mine["showReligion"] is False and mine["zodiac"]  # la personne voit sa propre valeur
    card = (await other.agent.get(f"/api/profiles/{me.id}")).json()
    assert card["maritalStatus"] == "SINGLE" and card["education"] == "MASTER" and card["smoking"] == "NEVER" and card["alcohol"] == "SOMETIMES"
    assert card["religion"] is None  # donnée sensible : cachée tant que la personne ne l'a pas rendue visible
    assert card["zodiac"] == mine["zodiac"]
    await me.agent.patch("/api/profiles/me", json={"showReligion": True})
    assert (await other.agent.get(f"/api/profiles/{me.id}")).json()["religion"] == "CHRISTIAN"
    # Effacer une valeur : null.
    cleared = (await me.agent.patch("/api/profiles/me", json={"smoking": None, "religion": None})).json()
    assert cleared["smoking"] is None and cleared["religion"] is None


async def test_valeur_inconnue_refusee(app, db):
    me = await member(app, db)
    for bad in ({"smoking": "TOUS_LES_JOURS"}, {"religion": "SECTE"}):
        r = await me.agent.patch("/api/profiles/me", json=bad)
        assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_valeurs_catalogue_et_libres_visibles_et_likables(app, db):
    me, other = await member(app, db), await member(app, db, gender="MAN")
    r = await me.agent.patch("/api/profiles/me", json={"values": ["HONESTY", "  Ma   famille ", "honesty"]})
    assert r.status_code == 200, r.text
    assert r.json()["values"] == ["HONESTY", "Ma famille"]  # espaces normalisés, doublon (casse) retiré
    card = (await other.agent.get(f"/api/profiles/{me.id}")).json()
    assert card["values"] == ["HONESTY", "Ma famille"]
    # Like et Super Like ciblés sur une valeur du profil ; une valeur qui n'y figure pas est refusée.
    bad = await other.agent.post("/api/swipes", json={"targetId": me.id, "action": "LIKE", "targetKind": "VALUE", "targetRef": "RESPECT"})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "INVALID_LIKE_TARGET"
    ok = await other.agent.post("/api/swipes", json={"targetId": me.id, "action": "LIKE", "targetKind": "VALUE", "targetRef": "HONESTY", "comment": "Moi aussi"})
    assert ok.status_code in (200, 201), ok.text
    vip = await member(app, db, gender="MAN")
    await make_premium(vip.id)
    sup = await vip.agent.post("/api/swipes", json={"targetId": me.id, "action": "SUPER_LIKE", "targetKind": "VALUE", "targetRef": "Ma famille"})
    assert sup.status_code in (200, 201), sup.text  # une valeur libre se like aussi


async def test_valeurs_refusees(app, db):
    me = await member(app, db)
    for bad in (["A"], ["x" * 25], ["appelle le 0612"], ["me@mail.com"], ["a b", "c d", "e f", "g h"]):
        r = await me.agent.patch("/api/profiles/me", json={"values": bad})
        assert r.status_code == 400, bad
    assert (await me.agent.patch("/api/profiles/me", json={"values": []})).json()["values"] == []

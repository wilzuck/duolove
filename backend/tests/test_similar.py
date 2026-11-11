"""Profils similaires : même genre et même pays, ni soi, ni la personne regardée, ni bloqués, ni déjà notés."""
from tests.support_c import member


async def test_profils_similaires(app, db):
    viewer, target = await member(app, db, gender="MAN"), await member(app, db)
    others = [await member(app, db) for _ in range(5)]
    men = await member(app, db, gender="MAN")  # autre genre : jamais proposé
    r = await viewer.agent.get(f"/api/profiles/{target.id}/similar")
    assert r.status_code == 200, r.text
    ids = [x["id"] for x in r.json()["items"]]
    assert len(ids) == 3 and set(ids) <= {o.id for o in others}  # trois au plus, parmi les femmes du même pays
    assert viewer.id not in ids and target.id not in ids and men.id not in ids
    assert set(r.json()["items"][0]) == {"id", "displayName", "age", "city", "country", "verified", "thumbUrl"}  # pas de donnée sensible
    # Une personne bloquée ou déjà notée n'apparaît plus.
    await viewer.agent.post(f"/api/blocks/{ids[0]}")
    await viewer.agent.post("/api/swipes", json={"targetId": ids[1], "action": "LIKE"})
    again = [x["id"] for x in (await viewer.agent.get(f"/api/profiles/{target.id}/similar")).json()["items"]]
    assert ids[0] not in again and ids[1] not in again
    # Profil introuvable ou bloqué : 404 comme la fiche.
    assert (await viewer.agent.get("/api/profiles/inconnu/similar")).status_code == 404
    await viewer.agent.post(f"/api/blocks/{target.id}")
    assert (await viewer.agent.get(f"/api/profiles/{target.id}/similar")).status_code == 404

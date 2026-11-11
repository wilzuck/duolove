"""Statut d'activité : visible entre personnes en match, masquable, réciproque, heure exacte réservée au mode discret."""
from tests.helpers import make_premium
from tests.support_c import matched, member


async def seen(a, other_id: str) -> dict:
    return (await a.agent.get(f"/api/profiles/activity?ids={other_id}")).json()["items"]


async def test_statut_visible_entre_matchs_sans_heure_exacte(app, db):
    w, m, _ = await matched(app, db)
    s = await seen(w, m.id)
    assert s[m.id]["state"] in ("online", "today") and s[m.id]["lastSeenAt"] is None  # offre gratuite : palier seulement


async def test_inconnu_non_renseigne(app, db):
    w, _, _ = await matched(app, db)
    stranger = await member(app, db)
    assert await seen(w, stranger.id) == {}


async def test_masquer_son_statut_est_reciproque(app, db):
    w, m, _ = await matched(app, db)
    assert (await w.agent.patch("/api/profiles/me/settings", json={"showActivity": False})).json()["showActivity"] is False
    assert await seen(m, w.id) == {}  # elle n'apparaît plus
    assert await seen(w, m.id) == {}  # et elle ne voit plus celui des autres


async def test_mode_discret_voit_tout_et_l_heure_exacte(app, db):
    w, m, _ = await matched(app, db)
    await w.agent.patch("/api/profiles/me/settings", json={"showActivity": False})
    await make_premium(w.id, "VIP")
    s = await seen(w, m.id)
    if m.id in s and s[m.id]["state"] != "online":
        assert s[m.id]["lastSeenAt"]
    assert await seen(m, w.id) == {}  # masquée pour les autres


async def test_premium_voit_l_activite_avant_un_match_sans_heure_exacte(app, db):
    w, _, _ = await matched(app, db)
    stranger = await member(app, db)
    assert await seen(w, stranger.id) == {}  # gratuit : seulement les matchs
    await make_premium(w.id, "PREMIUM")
    s = await seen(w, stranger.id)
    assert s[stranger.id]["state"] in ("online", "today", "week") and s[stranger.id]["lastSeenAt"] is None  # palier arrondi, jamais d'heure exacte
    await stranger.agent.patch("/api/profiles/me/settings", json={"showActivity": False})
    assert await seen(w, stranger.id) == {}  # la personne qui masque son activité reste masquée

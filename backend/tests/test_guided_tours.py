"""Guides de découverte : un guide vu (ou passé) n'est plus montré, sur aucun appareil ; « Revoir les guides » remet tout à zéro."""
from tests.helpers import new_agent
from tests.support_c import member


async def test_tours_seen_persist_and_reset(app, db):
    m = await member(app, db)
    assert (await m.agent.get("/api/users/me")).json()["toursSeen"] == []
    assert (await m.agent.post("/api/users/me/tours", json={"tour": "discover"})).json()["toursSeen"] == ["discover"]
    await m.agent.post("/api/users/me/tours", json={"tour": "discover"})  # sans doublon
    await m.agent.post("/api/users/me/tours", json={"tour": "messages"})
    assert (await m.agent.get("/api/users/me")).json()["toursSeen"] == ["discover", "messages"]
    assert (await m.agent.post("/api/users/me/tours", json={"tour": "<script>"})).status_code == 400
    assert (await m.agent.delete("/api/users/me/tours")).json()["toursSeen"] == []
    assert (await m.agent.get("/api/users/me")).json()["toursSeen"] == []
    assert (await new_agent(app).post("/api/users/me/tours", json={"tour": "discover"})).status_code == 401

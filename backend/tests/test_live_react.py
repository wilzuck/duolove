"""Menu Match : « J'aime » et « Passer » sur une personne qui a accepté (sans jeton)."""
from sqlalchemy import func, select

from app.models.models import LiveInvite, Match, Notification, Swipe
from tests.test_live import _isolate_online_members, buy_tokens, candidate, code, criteria, invite_id, run, scalar, seeker, tokens


async def accepted_setup(app, db, n=3):
    o = code()
    cands = [await candidate(app, db, o) for _ in range(n)]
    s = await seeker(app, db)
    assert (await s.agent.post("/api/live/searches", json=criteria(o))).json()["invited"] == n
    ids = [await invite_id(c) for c in cands]
    for c, i in zip(cands, ids):
        assert (await c.agent.post(f"/api/live/invites/{i}/accept")).status_code == 200
    return s, cands, ids


async def test_like_without_match_then_reciprocal_like_opens_free_chat(app, db):
    s, (c1, c2), (i1, i2) = await accepted_setup(app, db, 2)

    r = await s.agent.post(f"/api/live/invites/{i1}/like")
    assert r.status_code == 200 and r.json() == {"action": "LIKE", "matched": False, "conversationId": None}
    assert (await s.agent.post(f"/api/live/invites/{i1}/like")).status_code == 200  # rejouable, aucun doublon
    assert await scalar(select(func.count()).select_from(Swipe).where(Swipe.giverId == s.id, Swipe.targetId == c1.id)) == 1
    card = next(a for a in (await s.agent.get("/api/live/state")).json()["accepted"] if a["inviteId"] == i1)
    assert card["liked"] is True and card["conversationId"] is None and card["status"] == "ACCEPTED"
    assert await scalar(select(func.count()).select_from(Notification).where(Notification.userId == c1.id, Notification.type == "LIKE")) >= 1

    # c2 avait déjà aimé le chercheur (via Découvrir) : le like réciproque crée le match, sans jeton.
    assert (await c2.agent.post("/api/swipes", json={"targetId": s.id, "action": "LIKE"})).status_code == 200
    assert await tokens(s) == 0
    m = await s.agent.post(f"/api/live/invites/{i2}/like")
    assert m.status_code == 200 and m.json()["matched"] is True and m.json()["conversationId"]
    assert await tokens(s) == 0
    card2 = next(a for a in (await s.agent.get("/api/live/state")).json()["accepted"] if a["inviteId"] == i2)
    assert card2["conversationId"] == m.json()["conversationId"]  # « Ouvrir la conversation » sans passer par « Discuter »
    assert (await s.agent.post(f"/api/conversations/{card2['conversationId']}/messages", json={"body": "Salut"})).status_code == 201
    # « Discuter » reste possible mais ne débite rien quand le match existe déjà.
    await buy_tokens(s, 1)
    ch = await s.agent.post(f"/api/live/invites/{i2}/choose")
    assert ch.status_code == 200 and ch.json()["charged"] == 0 and await tokens(s) == 1


async def test_pass_removes_person_and_keeps_choices(app, db):
    s, (c1, c2), (i1, i2) = await accepted_setup(app, db, 2)
    r = await s.agent.post(f"/api/live/invites/{i1}/pass")
    assert r.status_code == 200 and r.json()["action"] == "PASS" and r.json()["matched"] is False
    st = (await s.agent.get("/api/live/state")).json()
    assert [a["inviteId"] for a in st["accepted"]] == [i2]
    assert st["search"]["choicesLeft"] == 2  # un « passer » ne consomme pas de choix
    assert (await scalar(select(Swipe.action).where(Swipe.giverId == s.id, Swipe.targetId == c1.id))).value == "PASS"
    assert (await scalar(select(LiveInvite.status).where(LiveInvite.id == i1))).value == "EXPIRED"
    assert (await s.agent.post(f"/api/live/invites/{i1}/choose")).status_code == 409  # plus disponible
    assert await scalar(select(func.count()).select_from(Match).where(Match.userAId.in_([s.id, c1.id]), Match.userBId.in_([s.id, c1.id]))) == 0


async def test_react_is_restricted_to_the_seeker_and_to_accepted_invites(app, db):
    o = code()
    c1, c2 = await candidate(app, db, o), await candidate(app, db, o)
    s = await seeker(app, db)
    await s.agent.post("/api/live/searches", json=criteria(o))
    i1, i2 = await invite_id(c1), await invite_id(c2)
    # En attente de réponse : ni like ni pass.
    for action in ("like", "pass"):
        r = await s.agent.post(f"/api/live/invites/{i1}/{action}")
        assert r.status_code == 409 and r.json()["error"]["code"] == "INVITE_CLOSED"
    await c1.agent.post(f"/api/live/invites/{i1}/accept")
    # Un tiers (même invité) ne peut pas agir sur l'invitation d'un autre.
    assert (await c2.agent.post(f"/api/live/invites/{i1}/like")).status_code == 404
    assert (await c1.agent.post(f"/api/live/invites/{i1}/pass")).status_code == 404
    assert (await s.agent.post("/api/live/invites/inconnue/like")).status_code == 404

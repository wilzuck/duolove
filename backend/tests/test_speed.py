"""Speed dating en texte : binômes (fonction pure), éligibilité, déroulé piloté par l'horloge, messages filtrés, décisions privées, match réciproque."""
import datetime

import pytest
from sqlalchemy import delete, select, update

from app.core import appsettings, flags as flags_core, speedsvc
from app.core.ids import utcnow
from app.core.realtime import emitted
from app.db.session import session_maker
from app.models.models import Conversation, FeatureFlag, Match, SpeedEvent, SpeedPair, SystemSetting
from tests.helpers import new_agent, uid
from tests.support_c import Member, admin, member


@pytest.fixture(autouse=True)
async def _clean(app):
    async def wipe():
        async with session_maker()() as s:
            await s.execute(delete(SpeedEvent))
            await s.execute(delete(SystemSetting).where(SystemSetting.key.in_(appsettings.KEYS)))
            await s.execute(delete(FeatureFlag))
            await s.commit()
        appsettings.invalidate()
        flags_core.invalidate()

    await wipe()
    yield
    await wipe()


def code(r):
    return (r.json().get("error") or {}).get("code")


def at(delta: datetime.timedelta) -> str:
    return ((utcnow() + delta).replace(microsecond=0)).isoformat() + "Z"


async def create(adm: Member, **over):
    body = {"title": "Soirée des cœurs", "startsAt": at(datetime.timedelta(hours=1)), "rounds": 3, "roundSeconds": 120, "capacity": 8, **over}
    return await adm.agent.post("/api/admin/speed-events", json=body)


async def shift(event_id: str, delta: datetime.timedelta) -> None:
    """Place le début de la session à `maintenant + delta` (négatif = déjà commencée)."""
    async with session_maker()() as s:
        await s.execute(update(SpeedEvent).where(SpeedEvent.id == event_id).values(startsAt=utcnow() + delta))
        await s.commit()


async def four(app, db) -> tuple[list[Member], str]:
    city = f"S-{uid()}"
    ms = [await member(app, db, city=city), await member(app, db, city=city, gender="MAN"), await member(app, db, city=city), await member(app, db, city=city, gender="MAN")]
    return ms, city


# ───────── binômes : fonction pure ─────────
def test_build_rounds_never_repeat_and_respect_compatibility():
    users = [f"u{i}" for i in range(7)]
    compat = lambda a, b: not ({a, b} == {"u0", "u1"})  # noqa: E731
    rounds = speedsvc.build_rounds(users, compat, 5, "seed")
    seen = set()
    for pairs in rounds:
        people = [p for pr in pairs for p in pr]
        assert len(people) == len(set(people))  # une seule personne par binôme et par tour
        for a, b in pairs:
            assert frozenset((a, b)) not in seen and compat(a, b)
            seen.add(frozenset((a, b)))
        assert len(pairs) == 3  # 7 personnes : 3 binômes, une personne se repose
    assert speedsvc.build_rounds(users, compat, 5, "seed") == rounds  # déterministe


def test_contact_info_filter():
    assert speedsvc.contact_info("appelle-moi au 06 12 34 56 78")
    assert speedsvc.contact_info("moi@exemple.com") and speedsvc.contact_info("https://x.y") and speedsvc.contact_info("www.x.y")
    assert not speedsvc.contact_info("Quel est ton plat préféré ?") and not speedsvc.contact_info("J'ai 32 ans et 2 enfants")


# ───────── droits, éligibilité, inscription ─────────
async def test_admin_only_and_validation(app, db):
    adm = await admin(app, db)
    ms, _ = await four(app, db)
    assert (await create(ms[0])).status_code == 403
    assert (await new_agent(app).post("/api/admin/speed-events", json={})).status_code == 401
    assert code(await create(adm, startsAt=at(datetime.timedelta(minutes=1)))) == "TOO_SOON"
    assert (await create(adm, ageMin=40, ageMax=30)).status_code == 400
    assert (await create(adm, roundSeconds=10)).status_code == 400
    r = await create(adm)
    assert r.status_code == 201 and r.json()["phase"] == "UPCOMING" and r.json()["registered"] == 0
    assert (await adm.agent.patch(f"/api/admin/speed-events/{r.json()['id']}", json={"title": "Nouveau titre"})).json()["title"] == "Nouveau titre"


async def test_registration_rules(app, db):
    adm = await admin(app, db)
    ms, city = await four(app, db)
    ev = (await create(adm, city=city, capacity=4, ageMin=18, ageMax=99)).json()
    other_city = await member(app, db, city=f"X-{uid()}")
    assert code(await other_city.agent.post(f"/api/speed-events/{ev['id']}/register")) == "NOT_ELIGIBLE"
    for m in ms:
        assert (await m.agent.post(f"/api/speed-events/{ev['id']}/register")).status_code == 201
    assert (await ms[0].agent.post(f"/api/speed-events/{ev['id']}/register")).status_code == 201  # idempotent
    extra = await member(app, db, city=city)
    assert code(await extra.agent.post(f"/api/speed-events/{ev['id']}/register")) == "EVENT_FULL"
    listed = (await ms[0].agent.get("/api/speed-events")).json()["items"]
    assert listed[0]["registered"] == 4 and listed[0]["myStatus"] == "REGISTERED" and listed[0]["spotsLeft"] == 0
    assert (await ms[3].agent.delete(f"/api/speed-events/{ev['id']}/register")).json()["event"]["registered"] == 3
    assert (await extra.agent.post(f"/api/speed-events/{ev['id']}/register")).status_code == 201  # une place s'est libérée
    old = await create(adm, ageMin=60, ageMax=70, city=city)
    assert code(await ms[0].agent.post(f"/api/speed-events/{old.json()['id']}/register")) == "NOT_ELIGIBLE"


# ───────── déroulé complet ─────────
async def test_full_run_messages_decisions_and_mutual_match(app, db):
    adm = await admin(app, db)
    ms, city = await four(app, db)
    w1, m1, w2, m2 = ms
    ev = (await create(adm, city=city, rounds=3)).json()
    for m in ms:
        await m.agent.post(f"/api/speed-events/{ev['id']}/register")
    await shift(ev["id"], datetime.timedelta(seconds=-10))
    rooms = {m.id: (await m.agent.get(f"/api/speed-events/{ev['id']}")).json() for m in ms}
    assert all(r["event"]["phase"] == "ROUND" and r["event"]["round"] == 1 and r["partner"] and r["pairId"] for r in rooms.values())
    async with session_maker()() as s:
        pairs = (await s.execute(select(SpeedPair).where(SpeedPair.eventId == ev["id"]))).scalars().all()
    assert len(pairs) == 4  # 2 femmes et 2 hommes : 4 rencontres possibles au total, jamais répétées
    by = {m.id: m for m in ms}
    first = rooms[w1.id]
    partner = by[first["partner"]["id"]]
    # messages : coordonnées refusées, texte accepté, le binôme le reçoit, personne d'autre
    assert code(await w1.agent.post(f"/api/speed-events/{ev['id']}/messages", json={"body": "écris-moi à moi@x.com"})) == "CONTACT_INFO"
    assert code(await w1.agent.post(f"/api/speed-events/{ev['id']}/messages", json={"body": "x" * 301})) == "INVALID_MESSAGE"
    sent = await w1.agent.post(f"/api/speed-events/{ev['id']}/messages", json={"body": "Quel est ton plat préféré ?"})
    assert sent.status_code == 201 and any(e[0] == partner.id and e[1] == "speed:message" for e in emitted)
    seen = (await partner.agent.get(f"/api/speed-events/{ev['id']}")).json()
    assert [x["body"] for x in seen["messages"]] == ["Quel est ton plat préféré ?"] and seen["messages"][0]["mine"] is False
    outsider = [m for m in ms if m.id not in (w1.id, partner.id)][0]
    assert all("Quel est ton plat" not in x["body"] for x in (await outsider.agent.get(f"/api/speed-events/{ev['id']}")).json()["messages"])
    # décision privée : jamais révélée à l'autre
    pid = first["pairId"]
    assert (await w1.agent.post(f"/api/speed-events/{ev['id']}/decisions", json={"pairId": pid, "decision": "INTEREST"})).json()["myDecision"] == "INTEREST"
    assert code(await w1.agent.post(f"/api/speed-events/{ev['id']}/decisions", json={"pairId": pid, "decision": "MAYBE"})) == "INVALID_DECISION"
    assert (await outsider.agent.post(f"/api/speed-events/{ev['id']}/decisions", json={"pairId": pid, "decision": "INTEREST"})).status_code == 404
    pv = (await partner.agent.get(f"/api/speed-events/{ev['id']}")).json()
    assert "decisionA" not in str(pv) and pv["myDecision"] is None
    # la fin du tour : plus de messages
    await shift(ev["id"], datetime.timedelta(seconds=-130))  # pause entre le tour 1 et le tour 2
    assert code(await w1.agent.post(f"/api/speed-events/{ev['id']}/messages", json={"body": "bonjour"})) == "NOT_IN_ROUND"
    # intérêt réciproque seulement du côté du premier binôme
    await partner.agent.post(f"/api/speed-events/{ev['id']}/decisions", json={"pairId": pid, "decision": "INTEREST"})
    await shift(ev["id"], -datetime.timedelta(hours=2))
    final = (await w1.agent.get(f"/api/speed-events/{ev['id']}")).json()
    assert final["event"]["status"] == "CLOSED" and len(final["results"]) == 1 and final["results"][0]["user"]["id"] == partner.id
    conv = final["results"][0]["conversationId"]
    assert (await w1.agent.get(f"/api/conversations/{conv}/messages")).status_code == 200  # une vraie conversation de match
    assert any(e[0] == w1.id and e[1] == "match:new" for e in emitted)
    for m in ms:
        if m.id not in (w1.id, partner.id):
            assert (await m.agent.get(f"/api/speed-events/{ev['id']}")).json()["results"] == []  # aucun rejet n'est révélé
    async with session_maker()() as s:
        assert len((await s.execute(select(Match))).scalars().all()) >= 1
        await speedsvc.sweep(s)  # idempotent : aucun second match
        assert (await s.execute(select(Conversation.id))).scalars().all()


async def test_not_enough_participants_cancels_and_leaving(app, db):
    adm = await admin(app, db)
    ms, city = await four(app, db)
    ev = (await create(adm, city=city)).json()
    for m in ms[:2]:
        await m.agent.post(f"/api/speed-events/{ev['id']}/register")
    await shift(ev["id"], datetime.timedelta(seconds=-5))
    r = (await ms[0].agent.get(f"/api/speed-events/{ev['id']}")).json()
    assert r["event"]["status"] == "CANCELED" and r["event"]["cancelReason"] == "NOT_ENOUGH_PARTICIPANTS"
    ev2 = (await create(adm, city=city)).json()
    for m in ms:
        await m.agent.post(f"/api/speed-events/{ev2['id']}/register")
    await shift(ev2["id"], datetime.timedelta(seconds=-5))
    mine = (await ms[0].agent.get(f"/api/speed-events/{ev2['id']}")).json()
    partner = [m for m in ms if m.id == mine["partner"]["id"]][0]
    await partner.agent.delete(f"/api/speed-events/{ev2['id']}/register")  # quitter en cours de session
    assert (await ms[0].agent.get(f"/api/speed-events/{ev2['id']}")).json()["partner"]["left"] is True
    assert code(await ms[0].agent.post(f"/api/speed-events/{ev2['id']}/messages", json={"body": "Coucou"})) == "PARTNER_LEFT"
    assert (await adm.agent.post(f"/api/admin/speed-events/{ev2['id']}/cancel")).json()["status"] == "CANCELED"
    assert code(await adm.agent.post(f"/api/admin/speed-events/{ev2['id']}/cancel")) == "EVENT_FINISHED"


async def test_blocked_people_never_meet_and_flag(app, db):
    adm = await admin(app, db)
    ms, city = await four(app, db)
    w1, m1, w2, m2 = ms
    await w1.agent.post(f"/api/blocks/{m1.id}")
    await w1.agent.post(f"/api/blocks/{m2.id}")  # w1 est bloquée avec tous les hommes : elle ne rencontre personne
    ev = (await create(adm, city=city, rounds=2)).json()
    for m in ms:
        await m.agent.post(f"/api/speed-events/{ev['id']}/register")
    await shift(ev["id"], datetime.timedelta(seconds=-5))
    await w1.agent.get(f"/api/speed-events/{ev['id']}")
    async with session_maker()() as s:
        pairs = (await s.execute(select(SpeedPair).where(SpeedPair.eventId == ev["id"]))).scalars().all()
    assert all(w1.id not in (p.userAId, p.userBId) for p in pairs)
    async with session_maker()() as s:
        s.add(FeatureFlag(key="speed_dating", enabled=False))
        await s.commit()
    flags_core.invalidate()
    assert code(await w1.agent.get("/api/speed-events")) == "FEATURE_DISABLED"
    assert code(await w2.agent.post(f"/api/speed-events/{ev['id']}/register")) == "FEATURE_DISABLED"

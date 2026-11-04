"""Messagerie, signalements/blocages et boosts (routes du fork B)."""
from types import SimpleNamespace

from sqlalchemy import func, select, update

from app.core import chat_service, credits, flags
from app.core.realtime import emitted
from app.db.session import session_maker
from app.models.models import Boost, Conversation, FeatureFlag, Match, Profile, Report

from tests.helpers import jpeg, login, seed_member, uid


async def scalar(stmt):
    async with session_maker()() as s:
        return (await s.execute(stmt)).scalar()


async def pair(app, db):
    """Deux membres en relation avec une conversation ouverte."""
    a = await seed_member(db, gender="MAN", seeking="WOMEN", city=f"C-{uid()}")
    b = await seed_member(db, gender="WOMAN", seeking="MEN", city=f"C-{uid()}")
    x, y = sorted([a["id"], b["id"]])
    async with session_maker()() as s:
        m = Match(userAId=x, userBId=y)
        s.add(m)
        await s.flush()
        conv = Conversation(matchId=m.id)
        s.add(conv)
        await s.commit()
        conv_id = conv.id
    return SimpleNamespace(**a, agent=await login(app, a["email"])), SimpleNamespace(**b, agent=await login(app, b["email"])), conv_id


async def set_flag(key, on):
    async with session_maker()() as s:
        row = (await s.execute(select(FeatureFlag).where(FeatureFlag.key == key))).scalar_one_or_none()
        if row:
            row.enabled = on
        else:
            s.add(FeatureFlag(key=key, enabled=on))
        await s.commit()
    flags.invalidate()


async def test_messages_history_read_delete_search(app, db):
    a, b, conv = await pair(app, db)
    chat_service.reset_send_log()
    r = await a.agent.post(f"/api/conversations/{conv}/messages", json={"body": "  Salut  "})
    assert r.status_code == 201 and r.json()["body"] == "Salut" and r.json()["mine"] is True
    assert any(e[0] == b.id and e[1] == "message:new" for e in emitted)

    h = (await b.agent.get(f"/api/conversations/{conv}/messages")).json()
    assert [m["body"] for m in h["items"]] == ["Salut"] and h["items"][0]["mine"] is False and h["nextCursor"] is None
    assert (await b.agent.post(f"/api/conversations/{conv}/read")).json() == {"read": 1}
    assert (await a.agent.get(f"/api/conversations/{conv}/messages")).json()["items"][0]["readAt"] is not None

    lst = (await b.agent.get("/api/conversations")).json()
    assert lst[0]["id"] == conv and lst[0]["lastMessage"]["body"] == "Salut" and lst[0]["unread"] == 0
    assert (await b.agent.get("/api/conversations", params={"q": "salu"})).json() != []
    assert (await b.agent.get("/api/conversations", params={"q": "zzzz-introuvable"})).json() == []

    # pagination par curseur
    for i in range(3):
        await a.agent.post(f"/api/conversations/{conv}/messages", json={"body": f"m{i}"})
    p1 = (await a.agent.get(f"/api/conversations/{conv}/messages", params={"limit": 2})).json()
    assert [m["body"] for m in p1["items"]] == ["m1", "m2"] and p1["nextCursor"]
    p2 = (await a.agent.get(f"/api/conversations/{conv}/messages", params={"limit": 2, "cursor": p1["nextCursor"]})).json()
    assert [m["body"] for m in p2["items"]] == ["Salut", "m0"]

    # seul l'auteur supprime ; le texte disparaît
    mid = r.json()["id"]
    assert (await b.agent.delete(f"/api/messages/{mid}")).status_code == 404
    assert (await a.agent.delete(f"/api/messages/{mid}")).json() == {"ok": True}
    msgs = (await b.agent.get(f"/api/conversations/{conv}/messages", params={"limit": 10})).json()["items"]
    assert next(m for m in msgs if m["id"] == mid)["body"] is None


async def test_conversation_access_control_and_validation(app, db):
    a, _b, conv = await pair(app, db)
    other = await seed_member(db, gender="MAN", seeking="WOMEN", city=f"C-{uid()}")
    o = await login(app, other["email"])
    assert (await o.get(f"/api/conversations/{conv}/messages")).status_code == 404
    assert (await o.post(f"/api/conversations/{conv}/messages", json={"body": "intrus"})).status_code == 404
    bad = await a.agent.post(f"/api/conversations/{conv}/messages", json={"body": "   "})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_block_closes_conversation_and_report(app, db):
    a, b, conv = await pair(app, db)
    chat_service.reset_send_log()
    assert (await a.agent.post(f"/api/blocks/{b.id}")).json() == {"ok": True}
    r = await b.agent.post(f"/api/conversations/{conv}/messages", json={"body": "hello"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "CONVERSATION_CLOSED"
    assert [x["userId"] for x in (await a.agent.get("/api/blocks")).json()] == [b.id]
    assert (await a.agent.delete(f"/api/blocks/{b.id}")).json() == {"ok": True}
    assert (await a.agent.get("/api/blocks")).json() == []
    assert (await a.agent.post(f"/api/blocks/{a.id}")).json()["error"]["code"] == "INVALID_TARGET"
    assert (await a.agent.post("/api/blocks/inconnu")).status_code == 404

    ok = await a.agent.post("/api/reports", json={"targetId": b.id, "reason": "SPAM", "details": " test "})
    assert ok.status_code == 201
    assert await scalar(select(func.count()).select_from(Report).where(Report.reporterId == a.id, Report.details == "test")) == 1
    assert (await a.agent.post("/api/reports", json={"targetId": a.id, "reason": "SPAM"})).status_code == 400
    assert (await a.agent.post("/api/reports", json={"targetId": b.id, "reason": "NOPE"})).json()["error"]["code"] == "VALIDATION_ERROR"


async def test_chat_image_and_flag(app, db):
    a, b, conv = await pair(app, db)
    chat_service.reset_send_log()
    r = await a.agent.post(f"/api/conversations/{conv}/images", files={"file": ("p.jpg", jpeg(), "image/jpeg")})
    assert r.status_code == 201
    att = r.json()["attachments"][0]
    assert att["mime"] == "image/webp"
    path = att["url"].split("/api", 1)[1]
    got = await b.agent.get("/api" + path)
    assert got.status_code == 200 and got.headers["content-type"] == "image/webp" and got.content[:4] == b"RIFF"
    intruder = await seed_member(db, gender="MAN", seeking="WOMEN", city=f"C-{uid()}")
    assert (await (await login(app, intruder["email"])).get("/api" + path)).status_code == 404
    assert (await a.agent.post(f"/api/conversations/{conv}/images", files={"file": ("x.jpg", b"pas une image", "image/jpeg")})).json()["error"]["code"] == "INVALID_IMAGE"
    assert (await a.agent.post(f"/api/conversations/{conv}/images")).json()["error"]["code"] in ("FILE_REQUIRED", "VALIDATION_ERROR")
    try:
        await set_flag("chat_images", False)
        off = await a.agent.post(f"/api/conversations/{conv}/images", files={"file": ("p.jpg", jpeg(), "image/jpeg")})
        assert off.status_code == 503 and off.json()["error"]["code"] == "FEATURE_DISABLED"
        assert (await a.agent.post(f"/api/conversations/{conv}/messages", json={"body": "texte ok"})).status_code == 201
    finally:
        await set_flag("chat_images", True)


async def test_boost_activation_atomic(app, db):
    a, _b, _c = await pair(app, db)
    none = await a.agent.post("/api/boosts/activate", json={"creditType": "BOOST_30"})
    assert none.status_code == 403 and none.json()["error"]["code"] == "NO_CREDITS"
    assert await scalar(select(func.count()).select_from(Boost).where(Boost.userId == a.id)) == 0  # rien créé si le crédit manque
    async with session_maker()() as s:
        await credits.grant(s, a.id, "BOOST_30", 2, "ADMIN_GRANT", f"t:{uid()}")
        await s.commit()
    r1 = await a.agent.post("/api/boosts/activate", json={"creditType": "BOOST_30"})
    assert r1.status_code == 200 and r1.json()["durationMinutes"] == 30
    r2 = await a.agent.post("/api/boosts/activate", json={"creditType": "BOOST_30"})
    assert r2.json()["startsAt"] == r1.json()["endsAt"]  # prolongé : les durées s'additionnent
    assert (await a.agent.get("/api/credits")).json()["balances"]["BOOST_30"] == 0
    assert len((await a.agent.get("/api/boosts")).json()) == 2
    assert (await a.agent.post("/api/boosts/activate", json={"creditType": "SUPER_LIKE"})).json()["error"]["code"] == "VALIDATION_ERROR"
    try:
        await set_flag("boosts", False)
        assert (await a.agent.post("/api/boosts/activate", json={"creditType": "BOOST_30"})).status_code == 503
    finally:
        await set_flag("boosts", True)
    tx = (await a.agent.get("/api/credits")).json()["transactions"]
    assert {t["reason"] for t in tx} == {"ADMIN_GRANT", "CONSUME"}

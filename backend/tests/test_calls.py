"""Appels audio/vidéo : cycle de vie, droits, blocages, plafonds pilotés par l'admin, appel manqué, jeton signé (sans enregistrement)."""
import base64
import datetime
import hashlib
import hmac
import json

import pytest
from sqlalchemy import delete, select, update

from app.core import appsettings, callprovider, callsvc, flags as flags_core
from app.core.ids import utcnow
from app.core.realtime import emitted
from app.db.session import session_maker
from app.models.models import CallSession, FeatureFlag, Notification, SystemSetting
from tests.helpers import new_agent
from tests.support_c import member
from tests.helpers import make_premium, set_plan_feature
from tests.support_c import matched as _matched


@pytest.fixture(autouse=True)
async def _appels_actifs(app):
    """Les appels sont coupés par défaut pour toutes les formules : ces tests les activent pour Premium, puis rétablissent."""
    old = await set_plan_feature("PREMIUM", "calls_enabled", True)
    yield
    await set_plan_feature("PREMIUM", "calls_enabled", bool(old))


async def matched(app, db):
    """Appels, rendez-vous et idées de messagerie sont réservés aux formules qui les incluent : les deux membres sont Premium."""
    w, m, conv = await _matched(app, db)
    await make_premium(w.id)
    await make_premium(m.id)
    return w, m, conv


@pytest.fixture(autouse=True)
async def _clean(app):
    async def wipe():
        async with session_maker()() as s:
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


async def call(a, conv, kind="AUDIO"):
    return await a.agent.post(f"/api/conversations/{conv}/calls", json={"kind": kind})


async def expire_ring(call_id: str) -> None:
    async with session_maker()() as s:
        await s.execute(update(CallSession).where(CallSession.id == call_id).values(ringExpiresAt=utcnow() - datetime.timedelta(seconds=1)))
        await s.commit()


async def test_full_cycle_and_events(app, db):
    w, m, conv = await matched(app, db)
    r = await call(w, conv, "VIDEO")
    assert r.status_code == 201
    c = r.json()
    assert c["status"] == "RINGING" and c["direction"] == "outgoing" and c["kind"] == "VIDEO" and c["simulated"] is True
    assert any(e[0] == m.id and e[1] == "call:incoming" and e[2]["direction"] == "incoming" for e in emitted)
    cur = (await m.agent.get("/api/calls/current")).json()["call"]
    assert cur["id"] == c["id"] and cur["other"]["id"] == w.id
    acc = await m.agent.post(f"/api/calls/{c['id']}/accept")
    assert acc.status_code == 200 and acc.json()["status"] == "ACTIVE" and acc.json()["answeredAt"]
    assert any(e[0] == w.id and e[1] == "call:update" and e[2]["status"] == "ACTIVE" for e in emitted)
    tok = (await w.agent.get(f"/api/calls/{c['id']}/token")).json()
    assert tok["provider"] == "mock" and tok["callId"] == c["id"]
    end = await w.agent.post(f"/api/calls/{c['id']}/end")
    assert end.json()["status"] == "ENDED" and end.json()["endedAt"]
    assert (await w.agent.post(f"/api/calls/{c['id']}/end")).json()["status"] == "ENDED"  # idempotent
    assert (await m.agent.get("/api/calls/current")).json()["call"] is None
    assert code(await w.agent.get(f"/api/calls/{c['id']}/token")) == "CALL_NOT_ACTIVE"


async def test_decline_cancel_and_roles(app, db):
    w, m, conv = await matched(app, db)
    c = (await call(w, conv)).json()
    assert code(await w.agent.post(f"/api/calls/{c['id']}/accept")) == "FORBIDDEN"  # on ne répond pas à son propre appel
    assert code(await m.agent.post(f"/api/calls/{c['id']}/cancel")) == "FORBIDDEN"
    assert (await m.agent.post(f"/api/calls/{c['id']}/decline")).json()["status"] == "DECLINED"
    assert code(await m.agent.post(f"/api/calls/{c['id']}/accept")) == "CALL_NOT_ACTIVE"
    c2 = (await call(w, conv)).json()
    assert (await w.agent.post(f"/api/calls/{c2['id']}/cancel")).json()["status"] == "CANCELED"
    out = await member(app, db)
    await make_premium(out.id)  # le refus attendu est celui de la conversation (404), pas celui de la formule
    assert (await out.agent.post(f"/api/calls/{c2['id']}/end")).status_code == 404
    assert (await out.agent.get(f"/api/calls/{c2['id']}/token")).status_code == 404
    assert (await call(out, conv)).status_code == 404
    assert (await new_agent(app).post(f"/api/conversations/{conv}/calls", json={"kind": "AUDIO"})).status_code == 401
    assert code(await call(w, conv, "HOLOGRAM")) == "INVALID_KIND"


async def test_busy_and_missed_with_notification(app, db):
    w, m, conv = await matched(app, db)
    c = (await call(w, conv)).json()
    assert code(await call(w, conv)) == "CALL_BUSY"
    assert code(await call(m, conv)) == "CALL_BUSY"  # l'appelé n'ouvre pas un second appel vers son appelant
    await expire_ring(c["id"])
    assert (await m.agent.get("/api/calls/current")).json()["call"] is None
    async with session_maker()() as s:
        row = await s.get(CallSession, c["id"])
        assert row.status == "MISSED"
        notes = (await s.execute(select(Notification.id).where(Notification.userId == m.id, Notification.type == "CALL_MISSED"))).all()
        assert len(notes) == 1
    assert (await call(w, conv)).status_code == 201  # libre à nouveau


async def test_blocks_close_the_room(app, db):
    w, m, conv = await matched(app, db)
    c = (await call(w, conv)).json()
    await m.agent.post(f"/api/calls/{c['id']}/accept")
    assert (await m.agent.post(f"/api/blocks/{w.id}")).status_code == 200
    assert code(await w.agent.get(f"/api/calls/{c['id']}/token")) == "CONVERSATION_CLOSED"  # plus de jeton après un blocage
    await w.agent.post(f"/api/calls/{c['id']}/end")
    assert code(await call(w, conv)) == "CONVERSATION_CLOSED"


async def test_admin_limits_flag_and_pause(app, db):
    w, m, conv = await matched(app, db)
    async with session_maker()() as s:
        await appsettings.update(s, {"calls.max_per_day": 1, "calls.ring_seconds": 15})
    first = (await call(w, conv)).json()
    await w.agent.post(f"/api/calls/{first['id']}/cancel")
    assert code(await call(w, conv)) == "CALL_LIMIT"
    async with session_maker()() as s:
        await appsettings.update(s, {"calls.max_per_day": 20})
        s.add(FeatureFlag(key="calls", enabled=False))
        await s.commit()
    flags_core.invalidate()
    assert code(await call(w, conv)) == "FEATURE_DISABLED"
    async with session_maker()() as s:
        await s.execute(delete(FeatureFlag))
        await s.commit()
    flags_core.invalidate()
    assert (await m.agent.post("/api/engagement/me/pause", json={})).status_code in (200, 201)
    assert code(await call(w, conv)) == "CALLEE_UNAVAILABLE"  # sans révéler la pause
    assert code(await call(m, conv)) == "PAUSED"


async def test_max_duration_ends_call_and_config(app, db):
    w, m, conv = await matched(app, db)
    c = (await call(w, conv)).json()
    await m.agent.post(f"/api/calls/{c['id']}/accept")
    async with session_maker()() as s:
        await s.execute(update(CallSession).where(CallSession.id == c["id"]).values(answeredAt=utcnow() - datetime.timedelta(minutes=61)))
        await s.commit()
    assert code(await w.agent.get(f"/api/calls/{c['id']}/token")) == "CALL_NOT_ACTIVE"
    async with session_maker()() as s:
        assert (await s.get(CallSession, c["id"])).status == "ENDED"
    cfg = (await w.agent.get("/api/engagement/config")).json()["calls"]
    assert cfg == {"enabled": True, "simulated": True, "ringSeconds": 45, "maxMinutes": 60}
    async with session_maker()() as s:
        assert await callsvc.sweep(s) >= 0
        st = await callsvc.stats(s, utcnow() - datetime.timedelta(days=1))
    assert st["started"] >= 1 and st["answered"] >= 1


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def test_livekit_token_is_signed_scoped_and_not_recording():
    tok = callprovider.livekit_token(api_key="APIkey", api_secret="s3cret", room="call-1", identity="u1", name="Awa", ttl_seconds=600, kind="AUDIO", now=1_000_000)
    head, body, sig = tok.split(".")
    assert hmac.compare_digest(_b64d(sig), hmac.new(b"s3cret", f"{head}.{body}".encode(), hashlib.sha256).digest())
    assert json.loads(_b64d(head)) == {"alg": "HS256", "typ": "JWT"}
    p = json.loads(_b64d(body))
    assert p["iss"] == "APIkey" and p["sub"] == "u1" and p["exp"] == 1_000_600 and p["nbf"] < 1_000_000
    v = p["video"]
    assert v["room"] == "call-1" and v["roomJoin"] is True and v["canPublishSources"] == ["microphone"]
    assert not {"roomAdmin", "roomRecord", "recorder", "ingressAdmin", "roomCreate"} & set(v)  # aucun droit d'administration ni d'enregistrement
    vid = callprovider.livekit_token(api_key="k", api_secret="s", room="r", identity="u", name="n", ttl_seconds=60, kind="VIDEO", now=1)
    assert json.loads(_b64d(vid.split(".")[1]))["video"]["canPublishSources"] == ["microphone", "camera"]


def test_config_validation():
    from app.core.config import Settings
    with pytest.raises(ValueError):
        Settings(CALL_PROVIDER="livekit")
    with pytest.raises(ValueError):
        Settings(CALL_PROVIDER="zoom")

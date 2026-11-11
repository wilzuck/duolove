"""Phase 4 — fidélisation éthique : mode pause, périodes de repos, regroupement, plafond d'e-mails, rappels facultatifs, conseils de profil."""
import datetime

import pytest
from sqlalchemy import delete, select, update

from app.core import appsettings, datesvc, flags as flags_core, mail, notifications, realtime
from app.core.ids import utcnow
from app.db.session import session_maker
from app.models.models import DateProposal, FeatureFlag, Notification, NotificationPreference, Profile, SystemSetting
from tests.helpers import new_agent, uid
from tests.support_c import admin, member
from tests.helpers import make_premium
from tests.support_c import matched as _matched


async def matched(app, db):
    """Appels, rendez-vous et idées de messagerie sont réservés aux formules qui les incluent : les deux membres sont Premium."""
    w, m, conv = await _matched(app, db)
    await make_premium(w.id)
    await make_premium(m.id)
    return w, m, conv
from tests.test_dates import accepted


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


@pytest.fixture
def capture(monkeypatch):
    """Capte les alertes en direct et les e-mails réellement envoyés."""
    out = {"live": [], "mail": []}

    async def emit(user, event, data):
        if event == "notification:new":
            out["live"].append((user, data["type"]))

    async def send(to, subject, body, html=None, **kw):
        out["mail"].append((to, subject))

    monkeypatch.setattr(realtime, "emit_to_user", emit)
    monkeypatch.setattr(mail, "send", send)
    monkeypatch.setattr(notifications.mail, "send", send)
    return out


async def rows(user_id: str, type_: str | None = None) -> list[Notification]:
    async with session_maker()() as s:
        q = select(Notification).where(Notification.userId == user_id)
        return [n for n in (await s.execute(q.order_by(Notification.createdAt))).scalars() if type_ is None or n.type.value == type_]


# ───────── mode pause ─────────
async def test_pause_hides_profile_silences_actions_and_resumes(app, db):
    w, m, conv = await matched(app, db)
    city = (await w.agent.get("/api/profiles/me")).json()["city"]
    fresh = await member(app, db, city=city, gender="MAN")
    assert fresh.id in [i["id"] for i in (await w.agent.get("/api/discovery?limit=30")).json()["items"]]
    r = await fresh.agent.post("/api/engagement/me/pause", json={"days": 7})
    assert r.status_code == 200 and r.json()["pause"]["active"] is True and r.json()["pause"]["endsAt"]
    assert (await fresh.agent.get("/api/users/me")).json()["profile"]["paused"] is True
    assert fresh.id not in [i["id"] for i in (await w.agent.get("/api/discovery?limit=30")).json()["items"]]  # invisible des autres
    feed = (await fresh.agent.get("/api/discovery?limit=30")).json()
    assert feed["items"] == [] and feed["paused"] is True  # et rien n'est proposé à la personne en pause
    assert code(await fresh.agent.post("/api/swipes", json={"targetId": w.id, "action": "LIKE"})) == "PAUSED"
    assert code(await fresh.agent.get("/api/discovery/daily")) == "PAUSED"
    # Les conversations existantes ne sont pas coupées.
    assert (await m.agent.post(f"/api/conversations/{conv}/messages", json={"body": "Toujours là pour discuter"})).status_code == 201
    back = await fresh.agent.delete("/api/engagement/me/pause")
    assert back.json()["pause"]["active"] is False
    assert fresh.id in [i["id"] for i in (await w.agent.get("/api/discovery?limit=30")).json()["items"]]  # de retour, sans condition


async def test_pause_limits_are_set_by_the_admin_and_resume_is_never_blocked(app, db):
    a, u = await admin(app, db), await member(app, db)
    await a.agent.patch("/api/admin/settings", json={"values": {"pause.max_days": 10}})
    assert code(await u.agent.post("/api/engagement/me/pause", json={"days": 11})) == "INVALID_PAUSE"
    r = await u.agent.post("/api/engagement/me/pause", json={})
    ends = datetime.datetime.fromisoformat(r.json()["pause"]["endsAt"].replace("Z", ""))
    assert 9.9 < (ends - utcnow()).total_seconds() / 86400 <= 10.01  # sans durée : plafonnée par l'admin, jamais infinie
    assert code(await a.agent.patch("/api/admin/settings", json={"values": {"pause.max_days": 400}})) == "INVALID_SETTING"
    # Fonction coupée : plus de nouvelle pause, mais la reprise reste possible.
    await a.agent.put("/api/admin/feature-flags/pause_mode", json={"enabled": False})
    other = await member(app, db)
    assert code(await other.agent.post("/api/engagement/me/pause", json={"days": 3})) == "FEATURE_DISABLED"
    assert (await u.agent.delete("/api/engagement/me/pause")).json()["pause"]["active"] is False


async def test_pause_excludes_from_live_match(app, db):
    w, m, _ = await matched(app, db)
    assert (await m.agent.post("/api/engagement/me/pause", json={"days": 2})).status_code == 200
    r = await m.agent.post("/api/live/searches", json={"heightMin": 150, "heightMax": 190})
    assert code(r) == "PAUSED"


# ───────── périodes de repos ─────────
def around_now(offset_minutes: int = 0) -> dict:
    """Une période de repos qui contient l'instant présent, dans le fuseau décalé de `offset_minutes`."""
    now = utcnow()
    local = (now.hour * 60 + now.minute + offset_minutes) % 1440
    f = lambda v: f"{(v % 1440) // 60:02d}:{(v % 1440) % 60:02d}"  # noqa: E731
    return {"quietStart": f(local - 60), "quietEnd": f(local + 60), "tzOffsetMinutes": offset_minutes}


async def test_quiet_hours_keep_the_row_but_send_no_alert_or_email(app, db, capture):
    u = await member(app, db)
    async with session_maker()() as s:
        await s.execute(update(NotificationPreference).where(NotificationPreference.userId == u.id).values(emailMatches=True))
        await s.commit()
    r = await u.agent.put("/api/engagement/me/rhythm", json=around_now(120))
    assert r.json()["quiet"]["activeNow"] is True and r.json()["quiet"]["start"] and r.json()["quiet"]["tzOffsetMinutes"] == 120
    async with session_maker()() as s:
        await notifications.create(s, u.id, "MATCH", {"conversationId": "x"})
        await notifications.create(s, u.id, "SECURITY_ALERT", {"event": "password_changed"})
    assert [n.type.value for n in await rows(u.id)] == ["MATCH", "SECURITY_ALERT"]  # tout est conservé dans l'application
    assert capture["live"] == [(u.id, "SECURITY_ALERT")] and capture["mail"] == []  # seule l'alerte de sécurité est poussée
    # Hors période de repos : alerte et e-mail normaux.
    await u.agent.put("/api/engagement/me/rhythm", json={"quietStart": None, "quietEnd": None})
    capture["live"].clear()
    async with session_maker()() as s:
        await notifications.create(s, u.id, "MATCH", {"conversationId": "y"})
    assert capture["live"] == [(u.id, "MATCH")] and len(capture["mail"]) == 1


async def test_quiet_hours_validation_and_midnight_window(app, db):
    u = await member(app, db)
    assert code(await u.agent.put("/api/engagement/me/rhythm", json={"quietStart": "22:00"})) == "INVALID_QUIET"
    assert code(await u.agent.put("/api/engagement/me/rhythm", json={"quietStart": "25:00", "quietEnd": "07:00"})) == "INVALID_TIME"
    assert (await u.agent.put("/api/engagement/me/rhythm", json={"tzOffsetMinutes": 5000})).status_code == 400
    from app.core.rhythm import in_quiet_hours
    p = NotificationPreference(userId=u.id, quietStart=22 * 60, quietEnd=7 * 60, tzOffsetMinutes=0)
    at = lambda h: datetime.datetime(2026, 11, 4, h, 30)  # noqa: E731
    assert in_quiet_hours(p, at(23)) and in_quiet_hours(p, at(3)) and not in_quiet_hours(p, at(12))  # fenêtre à cheval sur minuit
    p.tzOffsetMinutes = 120  # 21 h UTC = 23 h locales
    assert in_quiet_hours(p, at(21)) and not in_quiet_hours(p, at(5))


async def test_paused_member_receives_silently(app, db, capture):
    u = await member(app, db)
    await u.agent.post("/api/engagement/me/pause", json={"days": 3})
    async with session_maker()() as s:
        await notifications.create(s, u.id, "LIKE", {"fromUserId": "z"})
    assert len(await rows(u.id, "LIKE")) == 1 and capture["live"] == []  # retrouvé au retour, sans alerte


# ───────── regroupement et plafond d'e-mails ─────────
async def test_messages_of_a_conversation_are_grouped(app, db):
    w, m, conv = await matched(app, db)
    for i in range(3):
        assert (await w.agent.post(f"/api/conversations/{conv}/messages", json={"body": f"Message numéro {i}"})).status_code == 201
    got = await rows(m.id, "MESSAGE")
    assert len(got) == 1 and got[0].data["count"] == 3 and got[0].data["conversationId"] == conv
    await m.agent.post(f"/api/notifications/{got[0].id}/read")
    await w.agent.post(f"/api/conversations/{conv}/messages", json={"body": "Un nouveau message après lecture"})
    assert len(await rows(m.id, "MESSAGE")) == 2  # après lecture, une nouvelle ligne repart à 1
    # Deux conversations distinctes ne se mélangent pas.
    w2, m2, conv2 = await matched(app, db)
    await w2.agent.post(f"/api/conversations/{conv2}/messages", json={"body": "Autre conversation"})
    assert len(await rows(m2.id, "MESSAGE")) == 1 and (await rows(m2.id, "MESSAGE"))[0].data["conversationId"] == conv2


async def test_email_cap_per_day_is_set_by_the_admin(app, db, capture):
    a, u = await admin(app, db), await member(app, db)
    async with session_maker()() as s:
        await s.execute(update(NotificationPreference).where(NotificationPreference.userId == u.id).values(emailMatches=True, emailLikes=True))
        await s.commit()
    await a.agent.patch("/api/admin/settings", json={"values": {"notifications.max_emails_per_day": 2}})
    async with session_maker()() as s:
        for t in ("MATCH", "LIKE", "MATCH", "LIKE"):
            await notifications.create(s, u.id, t, {"conversationId": uid()})
    assert len(capture["mail"]) == 2  # plafond atteint : les autres notifications restent dans l'application, sans e-mail
    assert len(await rows(u.id)) == 4
    capture["mail"].clear()
    await a.agent.patch("/api/admin/settings", json={"values": {"notifications.max_emails_per_day": 0}})
    async with session_maker()() as s:
        await notifications.create(s, u.id, "MATCH", {"conversationId": uid()})
    assert capture["mail"] == []  # 0 = aucun e-mail non essentiel
    assert code(await a.agent.patch("/api/admin/settings", json={"values": {"notifications.max_emails_per_day": 99}})) == "INVALID_SETTING"


async def test_one_email_per_hour_per_conversation(app, db, capture):
    w, m, conv = await matched(app, db)
    async with session_maker()() as s:
        await s.execute(update(NotificationPreference).where(NotificationPreference.userId == m.id).values(emailMessages=True))
        await s.commit()
    for i in range(4):
        await w.agent.post(f"/api/conversations/{conv}/messages", json={"body": f"Message {i} pour tester"})
    assert len([x for x in capture["mail"] if x[1] == "Nouveau message sur CrushDuo"]) == 1  # 4 messages, un seul e-mail


# ───────── rappels de rendez-vous facultatifs ─────────
async def test_date_reminders_can_be_turned_off(app, db):
    w, m, conv = await matched(app, db)
    did = await accepted(w, m, conv)
    await w.agent.put(f"/api/dates/{did}/reminder", json={"minutesBefore": 60})
    await m.agent.put(f"/api/dates/{did}/reminder", json={"minutesBefore": 60})
    assert (await w.agent.put("/api/engagement/me/rhythm", json={"dateReminders": False})).json()["dateReminders"] is False
    async with session_maker()() as s:
        start = (await s.get(DateProposal, did)).startsAt
        assert (await datesvc.run_reminders(s, start - datetime.timedelta(minutes=30)))["reminded"] == 2  # traités, une seule fois
    assert not await rows(w.id, "DATE_REMINDER") and len(await rows(m.id, "DATE_REMINDER")) == 1


# ───────── conseils de profil ─────────
async def test_profile_tips_reflect_real_state_and_flag(app, db):
    a, u = await admin(app, db), await member(app, db)
    t = (await u.agent.get("/api/engagement/me/tips")).json()
    codes = [x["code"] for x in t["items"]]
    assert len(codes) <= 4 and "photos" in codes and "bio" in codes and next(x for x in t["items"] if x["code"] == "photos")["have"] == 1
    assert (await new_agent(app).get("/api/engagement/me/tips")).status_code == 401
    ids = [p["id"] for p in (await u.agent.get("/api/engagement/prompts")).json()["items"]][:3]
    await u.agent.put("/api/engagement/me/prompts", json={"items": [{"promptId": i, "answer": "Une réponse sincère"} for i in ids]})
    async with session_maker()() as s:
        await s.execute(update(Profile).where(Profile.userId == u.id).values(bio="x" * 120, verified=True))
        await s.commit()
    codes = [x["code"] for x in (await u.agent.get("/api/engagement/me/tips")).json()["items"]]
    assert "bio" not in codes and "prompts" not in codes and "verify" not in codes  # un conseil disparaît dès qu'il est réalisé
    await a.agent.put("/api/admin/feature-flags/profile_tips", json={"enabled": False})
    assert code(await u.agent.get("/api/engagement/me/tips")) == "FEATURE_DISABLED"


async def test_rhythm_metrics_are_real(app, db):
    a, u = await admin(app, db), await member(app, db)
    before = (await a.agent.get("/api/admin/engagement/metrics")).json()["rhythm"]
    await u.agent.post("/api/engagement/me/pause", json={"days": 2})
    await u.agent.put("/api/engagement/me/rhythm", json={"quietStart": "22:00", "quietEnd": "07:00"})
    after = (await a.agent.get("/api/admin/engagement/metrics")).json()["rhythm"]
    assert after["pausedNow"] == before["pausedNow"] + 1 and after["quietHoursUsers"] == before["quietHoursUsers"] + 1

"""Question du jour : planification admin, rotation du fonds, réponse, révélation réciproque sur les cartes, flag, validation."""
import datetime

import pytest
from sqlalchemy import delete, select

from app.core import dailyqsvc, flags as flags_core
from app.core.ids import utcnow
from app.db.session import session_maker
from app.models.models import DailyQuestion, DailyQuestionAnswer, FeatureFlag
from tests.helpers import new_agent
from tests.support_c import admin, member


@pytest.fixture(autouse=True)
async def _clean(app):
    async def wipe():
        async with session_maker()() as s:
            await s.execute(delete(DailyQuestionAnswer))
            await s.execute(delete(FeatureFlag))
            await s.execute(delete(DailyQuestion).where(DailyQuestion.textFr.like("TEST %")))
            await s.commit()
        flags_core.invalidate()

    await wipe()
    yield
    await wipe()


def code(r):
    return (r.json().get("error") or {}).get("code")


def body(day=None, **over):
    return {"day": day, "textFr": "TEST Un dimanche idéal ?", "textEn": "TEST An ideal Sunday?",
            "options": [{"fr": "Famille", "en": "Family"}, {"fr": "Balade", "en": "Walk"}, {"fr": "Sport", "en": "Sport"}], **over}


async def test_rotation_is_deterministic_and_schedule_wins(app, db):
    adm = await admin(app, db)
    async with session_maker()() as s:
        a = await dailyqsvc.question_for(s, datetime.date(2030, 1, 1))
        b = await dailyqsvc.question_for(s, datetime.date(2030, 1, 1))
        c = await dailyqsvc.question_for(s, datetime.date(2030, 1, 2))
    assert a and a.id == b.id and c and c.id != a.id  # le fonds tourne chaque jour, sans hasard
    day = (utcnow() + datetime.timedelta(days=40)).date()
    r = await adm.agent.post("/api/admin/daily-questions", json=body(day.isoformat()))
    assert r.status_code == 201 and [o["key"] for o in r.json()["options"]] == ["o1", "o2", "o3"]
    async with session_maker()() as s:
        assert (await dailyqsvc.question_for(s, day)).id == r.json()["id"]  # la date planifiée l'emporte sur la rotation
    assert code(await adm.agent.post("/api/admin/daily-questions", json=body(day.isoformat()))) == "DAY_TAKEN"


async def test_admin_validation_roles_and_edit_lock(app, db):
    adm = await admin(app, db)
    m = await member(app, db)
    assert (await m.agent.post("/api/admin/daily-questions", json=body())).status_code == 403
    assert (await new_agent(app).get("/api/admin/daily-questions")).status_code == 401
    assert (await adm.agent.post("/api/admin/daily-questions", json=body(options=[{"fr": "Seul", "en": "Only"}]))).status_code == 400
    assert code(await adm.agent.post("/api/admin/daily-questions", json=body(options=[{"fr": "Même", "en": "A"}, {"fr": "même", "en": "B"}]))) == "INVALID_OPTIONS"
    q = (await adm.agent.post("/api/admin/daily-questions", json=body())).json()
    listed = (await adm.agent.get("/api/admin/daily-questions")).json()["items"]
    assert any(i["id"] == q["id"] and i["answers"] == 0 for i in listed)
    # une fois qu'un membre a répondu, les choix ne changent plus (les réponses resteraient sans sens)
    async with session_maker()() as s:
        s.add(DailyQuestionAnswer(questionId=q["id"], userId=m.id, optionKey="o1"))
        await s.commit()
    assert code(await adm.agent.patch(f"/api/admin/daily-questions/{q['id']}", json={"options": [{"fr": "X", "en": "X"}, {"fr": "Y", "en": "Y"}]})) == "QUESTION_ANSWERED"
    assert (await adm.agent.patch(f"/api/admin/daily-questions/{q['id']}", json={"textFr": "TEST Texte corrigé ?"})).status_code == 200
    assert (await adm.agent.delete(f"/api/admin/daily-questions/{q['id']}")).status_code == 204


async def test_answer_and_reciprocal_reveal(app, db):
    adm = await admin(app, db)
    today = utcnow().date().isoformat()
    async with session_maker()() as s:
        await s.execute(delete(DailyQuestion).where(DailyQuestion.day == utcnow().date()))
        await s.commit()
    q = (await adm.agent.post("/api/admin/daily-questions", json=body(today))).json()
    a, b = await member(app, db), await member(app, db, gender="MAN")
    st = (await a.agent.get("/api/engagement/daily-question")).json()
    assert st["enabled"] and st["question"]["id"] == q["id"] and st["myAnswer"] is None
    assert code(await a.agent.post("/api/engagement/daily-question/answer", json={"optionKey": "o9"})) == "INVALID_OPTION"
    assert (await b.agent.post("/api/engagement/daily-question/answer", json={"optionKey": "o2"})).json()["myAnswer"] == "o2"
    # a n'a pas répondu : aucune réponse des autres n'est révélée
    async with session_maker()() as s:
        assert await dailyqsvc.reveal_for(s, a.id, [b.id]) == {}
    assert (await a.agent.post("/api/engagement/daily-question/answer", json={"optionKey": "o2"})).json()["myAnswer"] == "o2"
    async with session_maker()() as s:
        assert await dailyqsvc.reveal_for(s, a.id, [b.id]) == {b.id: {"optionKey": "o2", "same": True}}
    await a.agent.post("/api/engagement/daily-question/answer", json={"optionKey": "o1"})  # on peut changer d'avis
    async with session_maker()() as s:
        assert (await dailyqsvc.reveal_for(s, a.id, [b.id]))[b.id]["same"] is False
        n = (await s.execute(select(DailyQuestionAnswer).where(DailyQuestionAnswer.userId == a.id))).scalars().all()
        assert len(n) == 1  # une seule réponse par membre
    stats = (await adm.agent.get("/api/admin/engagement/metrics")).json()["dailyQuestion"]
    assert stats["todayAnswers"] == 2


async def test_flag_off_hides_everything(app, db):
    m = await member(app, db)
    async with session_maker()() as s:
        s.add(FeatureFlag(key="daily_question", enabled=False))
        await s.commit()
    flags_core.invalidate()
    assert (await m.agent.get("/api/engagement/daily-question")).json()["enabled"] is False
    assert code(await m.agent.post("/api/engagement/daily-question/answer", json={"optionKey": "o1"})) == "FEATURE_DISABLED"

"""Soirées Match en direct : création par l'admin, inscription, rappels envoyés une seule fois, annulation, droits."""
import datetime

import pytest
from sqlalchemy import delete, select

from app.core import live_events, mail
from app.core.ids import utcnow
from app.db.session import session_maker
from app.models.models import LiveEvent, Notification
from tests.support_c import admin, member


@pytest.fixture(autouse=True)
async def clean(app):
    async def wipe():
        async with session_maker()() as s:
            await s.execute(delete(LiveEvent))
            await s.commit()

    await wipe()
    yield
    await wipe()


def at(minutes: int) -> str:
    return (utcnow() + datetime.timedelta(minutes=minutes)).isoformat(timespec="seconds") + "Z"


async def make(ad, minutes=30, **kw):
    r = await ad.agent.post("/api/admin/live-events", json={"title": "Soirée de Cotonou", "startsAt": at(minutes), "durationMinutes": 120, "city": "Cotonou", **kw})
    assert r.status_code == 201, r.text
    return r.json()


async def notes(user_id: str, stage: str) -> int:
    async with session_maker()() as s:
        rows = (await s.execute(select(Notification.data).where(Notification.userId == user_id, Notification.type == "LIVE_EVENT"))).scalars().all()
    return len([d for d in rows if d.get("stage") == stage])


async def test_creation_inscription_et_desinscription(app, db):
    ad, u = await admin(app, db), await member(app, db)
    ev = await make(ad, 600)
    assert ev["phase"] == "upcoming" and ev["rsvps"] == 0
    got = (await u.agent.get("/api/live/events")).json()
    assert [e["id"] for e in got["events"]] == [ev["id"]] and got["events"][0]["rsvped"] is False and got["onlineNow"] >= 0
    assert (await u.agent.put(f"/api/live/events/{ev['id']}/rsvp")).json() == {"rsvped": True}
    assert (await u.agent.put(f"/api/live/events/{ev['id']}/rsvp")).status_code == 200  # idempotent
    got = (await u.agent.get("/api/live/events")).json()["events"][0]
    assert got["rsvped"] is True and got["rsvps"] == 1
    assert (await u.agent.delete(f"/api/live/events/{ev['id']}/rsvp")).json() == {"rsvped": False}
    assert (await u.agent.get("/api/live/events")).json()["events"][0]["rsvps"] == 0


async def test_droits_et_validation(app, db):
    ad, u = await admin(app, db), await member(app, db)
    assert (await u.agent.post("/api/admin/live-events", json={"title": "Pirate", "startsAt": at(600)})).status_code == 403
    assert (await ad.agent.post("/api/admin/live-events", json={"title": "Passée", "startsAt": at(-60)})).status_code == 400
    assert (await ad.agent.post("/api/admin/live-events", json={"title": "ab", "startsAt": at(600)})).status_code == 400
    assert (await u.agent.put("/api/live/events/inconnu/rsvp")).status_code == 404


async def test_rappel_une_heure_avant_puis_debut_une_seule_fois(app, db):
    ad, inscrit, autre = await admin(app, db), await member(app, db), await member(app, db)
    ev = await make(ad, 30)
    await inscrit.agent.put(f"/api/live/events/{ev['id']}/rsvp")
    mail.outbox.clear()
    async with session_maker()() as s:
        first = await live_events.run_due(s)
        again = await live_events.run_due(s)
    assert first == {"reminded": 1, "started": 0} and again == {"reminded": 0, "started": 0}
    assert await notes(inscrit.id, "reminder") == 1 and await notes(autre.id, "reminder") == 0
    assert [m for m in mail.outbox if m["to"] == inscrit.email and "commence dans une heure" in m["subject"]]
    assert not [m for m in mail.outbox if m["to"] == autre.email]
    # au début : une notification « c'est parti », sans nouvel e-mail
    mail.outbox.clear()
    async with session_maker()() as s:
        go = await live_events.run_due(s, utcnow() + datetime.timedelta(minutes=31))
        go2 = await live_events.run_due(s, utcnow() + datetime.timedelta(minutes=32))
    assert go == {"reminded": 0, "started": 1} and go2 == {"reminded": 0, "started": 0}
    assert await notes(inscrit.id, "start") == 1 and not mail.outbox


async def test_creee_a_la_derniere_minute_pas_de_double_envoi(app, db):
    ad, u = await admin(app, db), await member(app, db)
    ev = await make(ad, 10)
    await u.agent.put(f"/api/live/events/{ev['id']}/rsvp")
    async with session_maker()() as s:
        late = await live_events.run_due(s, utcnow() + datetime.timedelta(minutes=11))  # déjà commencée : seule la notification de début part
        nxt = await live_events.run_due(s, utcnow() + datetime.timedelta(minutes=12))
    assert late == {"reminded": 0, "started": 1} and nxt == {"reminded": 0, "started": 0}
    assert await notes(u.id, "reminder") == 0 and await notes(u.id, "start") == 1


async def test_annulation_retire_la_soiree_et_arrete_les_rappels(app, db):
    ad, u = await admin(app, db), await member(app, db)
    ev = await make(ad, 30)
    await u.agent.put(f"/api/live/events/{ev['id']}/rsvp")
    assert (await ad.agent.post(f"/api/admin/live-events/{ev['id']}/cancel")).json()["phase"] == "canceled"
    assert (await u.agent.get("/api/live/events")).json()["events"] == []
    async with session_maker()() as s:
        assert await live_events.run_due(s) == {"reminded": 0, "started": 0}
    assert (await u.agent.put(f"/api/live/events/{ev['id']}/rsvp")).status_code == 404
    assert any(i["id"] == ev["id"] and i["phase"] == "canceled" for i in (await ad.agent.get("/api/admin/live-events")).json()["items"])

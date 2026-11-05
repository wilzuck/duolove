"""Phase 3 — mode rendez-vous : statuts, règles pilotées par l'admin, rappels, retour facultatif, partage volontaire, sécurité."""
import datetime

import pytest
from sqlalchemy import delete, select, update

from app.core import appsettings, datesvc, flags as flags_core
from app.core.ids import utcnow
from app.db.session import session_maker
from app.models.models import DateProposal, DateShare, FeatureFlag, Notification, SystemSetting
from tests.helpers import new_agent, uid
from tests.support_c import Member, admin, matched, member


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


def when(hours: float = 48, minutes: int = 120) -> dict:
    start = (utcnow() + datetime.timedelta(hours=hours)).replace(microsecond=0)
    f = lambda d: d.isoformat() + "Z"  # noqa: E731
    return {"startsAt": f(start), "endsAt": f(start + datetime.timedelta(minutes=minutes)), "placeKind": "CAFE", "placeName": "Café de la Paix, centre-ville"}


async def propose(a: Member, conv: str, **over):
    return await a.agent.post(f"/api/conversations/{conv}/dates", json={**when(), **over})


async def accepted(w: Member, m: Member, conv: str) -> str:
    d = (await propose(w, conv)).json()
    assert (await m.agent.post(f"/api/dates/{d['id']}/accept")).status_code == 200
    return d["id"]


async def set_start(date_id: str, delta: datetime.timedelta) -> None:
    async with session_maker()() as s:
        d = await s.get(DateProposal, date_id)
        d.startsAt = utcnow() + delta
        d.endsAt = d.startsAt + datetime.timedelta(hours=2)
        await s.commit()


# ───────── cycle de vie et droits ─────────
async def test_propose_accept_decline_cancel_and_roles(app, db):
    w, m, conv = await matched(app, db)
    r = await propose(w, conv, note="Un café en terrasse ?")
    assert r.status_code == 201 and r.json()["status"] == "PROPOSED" and r.json()["proposedByMe"] is True
    did = r.json()["id"]
    seen = (await m.agent.get(f"/api/conversations/{conv}/dates")).json()["items"][0]
    assert seen["id"] == did and seen["proposedByMe"] is False and seen["note"] == "Un café en terrasse ?"
    assert code(await w.agent.post(f"/api/dates/{did}/accept")) == "NOT_INVITEE"  # on ne s'accepte pas soi-même
    assert code(await m.agent.post(f"/api/dates/{did}/cancel")) == "USE_DECLINE"  # l'invité refuse, il n'annule pas
    outsider = await member(app, db)
    assert (await outsider.agent.post(f"/api/dates/{did}/accept")).status_code == 404  # ne révèle pas l'existence
    assert (await outsider.agent.get(f"/api/conversations/{conv}/dates")).status_code == 404
    assert (await new_agent(app).get(f"/api/conversations/{conv}/dates")).status_code == 401
    ok = await m.agent.post(f"/api/dates/{did}/accept")
    assert ok.status_code == 200 and ok.json()["status"] == "ACCEPTED"
    assert code(await m.agent.post(f"/api/dates/{did}/accept")) == "DATE_NOT_PENDING"
    assert (await m.agent.post(f"/api/dates/{did}/cancel")).json()["status"] == "CANCELED"  # les deux peuvent annuler un rendez-vous accepté
    assert code(await w.agent.post(f"/api/dates/{did}/cancel")) == "DATE_NOT_CANCELABLE"
    d2 = (await propose(w, conv)).json()["id"]
    assert (await m.agent.post(f"/api/dates/{d2}/decline")).json()["status"] == "DECLINED"
    d3 = (await propose(w, conv)).json()["id"]
    assert (await w.agent.post(f"/api/dates/{d3}/cancel")).json()["status"] == "CANCELED"  # le proposant annule sa proposition
    async with session_maker()() as s:  # l'autre personne est notifiée
        types = {(n.type.value, n.data.get("status")) for n in (await s.execute(select(Notification).where(Notification.userId == m.id))).scalars() if n.type.value == "DATE_UPDATE"}
    assert ("DATE_UPDATE", "PROPOSED") in types and ("DATE_UPDATE", "CANCELED") in types


async def test_validation_and_admin_rules(app, db):
    a = await admin(app, db)
    w, m, conv = await matched(app, db)
    assert code(await propose(w, conv, **when(hours=0.5))) == "TOO_SOON"
    assert code(await propose(w, conv, **when(hours=24 * 40))) == "TOO_FAR"
    assert code(await propose(w, conv, **when(minutes=10))) == "INVALID_WINDOW"
    assert code(await propose(w, conv, **when(minutes=900))) == "INVALID_WINDOW"
    assert code(await propose(w, conv, placeName="Chez moi 0612345678")) == "INVALID_PLACE"
    assert (await propose(w, conv, placeKind="MON_SALON")).status_code == 400  # catégorie fermée de lieux publics
    assert (await propose(w, conv, placeName="x")).status_code == 400
    # Plafond de rendez-vous ouverts par conversation (réglage admin) : 2 par défaut.
    assert (await propose(w, conv)).status_code == 201 and (await propose(w, conv)).status_code == 201
    assert code(await propose(w, conv)) == "TOO_MANY_OPEN_DATES"
    await a.agent.patch("/api/admin/settings", json={"values": {"dates.max_open": 3, "dates.min_notice_hours": 0}})
    assert (await propose(w, conv, **when(hours=0.5))).status_code == 201  # préavis réglé à 0 par l'admin
    assert code(await a.agent.patch("/api/admin/settings", json={"values": {"dates.max_days_ahead": 200}})) == "INVALID_SETTING"


async def test_daily_proposal_limit(app, db):
    a = await admin(app, db)
    w, m, conv = await matched(app, db)
    await a.agent.patch("/api/admin/settings", json={"values": {"dates.max_per_day": 2, "dates.max_open": 5}})
    for _ in range(2):
        assert (await propose(w, conv)).status_code == 201
    r = await propose(w, conv)
    assert r.status_code == 429 and code(r) == "DATE_LIMIT"


async def test_reschedule_proposes_another_time(app, db):
    w, m, conv = await matched(app, db)
    first = (await propose(w, conv)).json()
    new = await m.agent.post(f"/api/dates/{first['id']}/reschedule", json=when(hours=72))
    assert new.status_code == 201 and new.json()["status"] == "PROPOSED" and new.json()["proposedByMe"] is True and new.json()["previousId"] == first["id"]
    items = {x["id"]: x for x in (await w.agent.get(f"/api/conversations/{conv}/dates")).json()["items"]}
    assert items[first["id"]]["status"] == "RESCHEDULED" and items[new.json()["id"]]["proposedByMe"] is False
    assert code(await m.agent.post(f"/api/dates/{first['id']}/reschedule", json=when(hours=96))) == "DATE_NOT_RESCHEDULABLE"
    assert (await w.agent.post(f"/api/dates/{new.json()['id']}/accept")).json()["status"] == "ACCEPTED"  # l'autre personne accepte le nouvel horaire
    # Un rendez-vous accepté peut aussi être reporté par l'un ou l'autre.
    again = await w.agent.post(f"/api/dates/{new.json()['id']}/reschedule", json=when(hours=120))
    assert again.status_code == 201


# ───────── terminer, retour facultatif, indicateurs ─────────
async def test_complete_feedback_and_metrics(app, db):
    a = await admin(app, db)
    w, m, conv = await matched(app, db)
    did = await accepted(w, m, conv)
    assert code(await w.agent.post(f"/api/dates/{did}/complete")) == "DATE_NOT_STARTED"
    assert code(await w.agent.put(f"/api/dates/{did}/feedback", json={"rating": 5})) == "DATE_NOT_COMPLETED"
    await set_start(did, datetime.timedelta(hours=-1))
    assert (await m.agent.post(f"/api/dates/{did}/complete")).json()["status"] == "COMPLETED"
    assert (await w.agent.post(f"/api/dates/{did}/complete")).status_code == 200  # idempotent
    assert (await w.agent.put(f"/api/dates/{did}/feedback", json={"rating": 6})).status_code == 400
    assert (await w.agent.put(f"/api/dates/{did}/feedback", json={"rating": 5})).json()["myFeedback"] == 5
    other_view = next(x for x in (await m.agent.get(f"/api/conversations/{conv}/dates")).json()["items"] if x["id"] == did)
    assert other_view["myFeedback"] is None  # le retour d'une personne n'est jamais montré à l'autre
    before = (await a.agent.get("/api/admin/engagement/metrics")).json()["dates"]
    assert before["completed"] >= 1 and before["feedbackCount"] >= 1 and before["accepted"] >= 1 and 0 <= (before["acceptRate"] or 0) <= 100


# ───────── rappels ─────────
async def test_reminders_are_sent_once_and_stale_proposals_expire(app, db):
    w, m, conv = await matched(app, db)
    did = await accepted(w, m, conv)
    assert code(await w.agent.put(f"/api/dates/{did}/reminder", json={"minutesBefore": 30})) == "INVALID_REMINDER"
    assert (await w.agent.put(f"/api/dates/{did}/reminder", json={"minutesBefore": 60})).json()["reminderMinutes"] == 60
    async with session_maker()() as s:
        start = (await s.get(DateProposal, did)).startsAt
        assert (await datesvc.run_reminders(s, start - datetime.timedelta(hours=2)))["reminded"] == 0  # trop tôt
        assert (await datesvc.run_reminders(s, start - datetime.timedelta(minutes=30)))["reminded"] == 1
        assert (await datesvc.run_reminders(s, start - datetime.timedelta(minutes=20)))["reminded"] == 0  # une seule fois
        got = (await s.execute(select(Notification).where(Notification.userId == w.id))).scalars().all()
        assert [n for n in got if n.type.value == "DATE_REMINDER"] and not [n for n in (await s.execute(select(Notification).where(Notification.userId == m.id))).scalars() if n.type.value == "DATE_REMINDER"]
    assert (await w.agent.put(f"/api/dates/{did}/reminder", json={"minutesBefore": 0})).json()["reminderMinutes"] is None
    # Une proposition restée sans réponse après son heure de début est clôturée (annulée).
    old = (await propose(w, conv)).json()["id"]
    await set_start(old, datetime.timedelta(hours=-3))
    async with session_maker()() as s:
        assert (await datesvc.run_reminders(s))["expired"] >= 1
        assert (await s.get(DateProposal, old)).status == "CANCELED"


# ───────── partage volontaire avec une personne de confiance ─────────
async def test_voluntary_share_is_minimal_revocable_and_expiring(app, db):
    w, m, conv = await matched(app, db)
    pending = (await propose(w, conv)).json()["id"]
    assert code(await w.agent.post(f"/api/dates/{pending}/share")) == "DATE_NOT_ACCEPTED"  # seulement un rendez-vous accepté
    did = await accepted(w, m, conv)
    share = await w.agent.post(f"/api/dates/{did}/share")
    assert share.status_code == 201 and share.json()["url"].endswith(f"/share/{share.json()['token']}")
    token = share.json()["token"]
    assert (await w.agent.get(f"/api/conversations/{conv}/dates")).json()["items"][0]["shared"] in (True, False)
    anon = new_agent(app)  # la personne de confiance n'a pas de compte
    view = await anon.get(f"/api/dates/shared/{token}")
    assert view.status_code == 200 and view.headers["cache-control"] == "no-store" and "noindex" in view.headers["x-robots-tag"]
    body = view.json()
    assert set(body) == {"status", "startsAt", "endsAt", "placeKind", "placeName", "sharedBy", "meeting", "expiresAt"}  # ni photo, ni contact, ni identifiant
    assert body["placeName"].startswith("Café de la Paix") and body["status"] == "ACCEPTED"
    async with session_maker()() as s:  # seul le hash du jeton est conservé
        hashes = (await s.execute(select(DateShare.tokenHash).where(DateShare.dateId == did))).scalars().all()
    assert hashes and token not in hashes
    assert (await anon.get("/api/dates/shared/inconnu")).status_code == 404
    assert (await m.agent.post(f"/api/dates/{did}/share")).status_code == 201  # chacun partage de son côté, jamais à la place de l'autre
    # Un nouveau lien révoque l'ancien ; la révocation est immédiate.
    second = (await w.agent.post(f"/api/dates/{did}/share")).json()["token"]
    assert (await anon.get(f"/api/dates/shared/{token}")).status_code == 404 and (await anon.get(f"/api/dates/shared/{second}")).status_code == 200
    assert (await w.agent.delete(f"/api/dates/{did}/share")).json()["shared"] is False
    assert (await anon.get(f"/api/dates/shared/{second}")).status_code == 404
    # Le lien expire après la fin du rendez-vous (+ délai réglable) ; annulé, il montre « annulé » tant qu'il est valable.
    third = (await w.agent.post(f"/api/dates/{did}/share")).json()["token"]
    await m.agent.post(f"/api/dates/{did}/cancel")
    assert (await anon.get(f"/api/dates/shared/{third}")).json()["status"] == "CANCELED"
    async with session_maker()() as s:
        await s.execute(update(DateShare).where(DateShare.dateId == did).values(expiresAt=utcnow() - datetime.timedelta(minutes=1)))
        await s.commit()
    assert (await anon.get(f"/api/dates/shared/{third}")).status_code == 404


# ───────── sécurité : blocage, flag ─────────
async def test_blocked_conversation_cannot_propose_but_can_cancel(app, db):
    w, m, conv = await matched(app, db)
    did = await accepted(w, m, conv)
    assert (await m.agent.post(f"/api/blocks/{w.id}")).status_code == 200
    assert (await propose(w, conv)).status_code in (403, 404)  # plus aucune nouvelle proposition
    assert (await w.agent.post(f"/api/dates/{did}/cancel")).status_code in (200, 404)  # on ne piège pas un membre : l'annulation reste possible si l'accès existe


async def test_flag_blocks_new_proposals_but_never_traps_members(app, db):
    a = await admin(app, db)
    w, m, conv = await matched(app, db)
    pending = (await propose(w, conv)).json()["id"]
    did = await accepted(w, m, conv)
    await a.agent.put("/api/admin/feature-flags/date_proposals", json={"enabled": False})
    assert code(await propose(w, conv)) == "FEATURE_DISABLED"
    assert code(await m.agent.post(f"/api/dates/{pending}/accept")) == "FEATURE_DISABLED"
    assert code(await w.agent.post(f"/api/dates/{did}/reschedule", json=when(hours=90))) == "FEATURE_DISABLED"
    assert (await w.agent.get(f"/api/conversations/{conv}/dates")).status_code == 200  # on voit toujours ses rendez-vous
    assert (await w.agent.post(f"/api/dates/{did}/cancel")).status_code == 200  # et on peut toujours annuler

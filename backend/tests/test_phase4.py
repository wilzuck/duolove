"""Phase 4 (valeur Premium) : garantie Duo, priorité pendant une soirée, coach de premier message, Super Like accompagné d'un message."""
import datetime

import pytest
from sqlalchemy import delete, select, update

from app.core import appsettings, guarantee, live_events
from app.core.ids import utcnow
from app.db.session import session_maker
from app.models.models import DuoGuaranteeGrant, LiveEvent, Match, Profile, Subscription, SubscriptionPlan, Swipe, SystemSetting
from tests.helpers import make_premium, seed_member, uid
from tests.support_c import matched, member

KEYS = ("guarantee.enabled", "guarantee.days", "guarantee.window_days", "guarantee.min_likes", "live.priority_bonus")


@pytest.fixture(autouse=True)
async def _clean(app):
    async def wipe():
        async with session_maker()() as s:
            await s.execute(delete(SystemSetting).where(SystemSetting.key.in_(KEYS)))
            await s.execute(delete(LiveEvent).where(LiveEvent.title.like("phase4-%")))
            await s.commit()
        appsettings.invalidate()

    await wipe()
    yield
    await wipe()


async def _subscriber(db, likes: int, *, age_days: int = 31, matched_with: str | None = None):
    """Abonné Premium dont l'abonnement date de `age_days` jours et qui a envoyé `likes` likes ; éventuellement avec un duo."""
    m = await seed_member(db, gender="MAN", seeking="WOMEN", city=f"C-{uid()}")
    await make_premium(m["id"], days=30)
    async with session_maker()() as s:
        plan_id = (await s.execute(select(SubscriptionPlan.id).where(SubscriptionPlan.code == "PREMIUM"))).scalar_one()
        sub = Subscription(userId=m["id"], planId=plan_id, status="ACTIVE", provider="mock", months=1, createdAt=utcnow() - datetime.timedelta(days=age_days),
                           currentPeriodEnd=utcnow() + datetime.timedelta(days=30))
        s.add(sub)
        await s.flush()
        await s.execute(update(Profile).where(Profile.userId == m["id"]).values(completeness=100))
        for _ in range(likes):
            t = await seed_member(db, gender="WOMAN", seeking="MEN", city="Lomé")
            s.add(Swipe(giverId=m["id"], targetId=t["id"], action="LIKE"))
            if matched_with is None:
                continue
        if matched_with:
            s.add(Match(userAId=m["id"], userBId=matched_with))
        await s.commit()
        return m, sub.id, sub.currentPeriodEnd


async def test_guarantee_disabled_by_default(app, db):
    m, sub_id, _ = await _subscriber(db, 3)
    assert await guarantee.run_all(db) == 0
    assert (await db.execute(select(DuoGuaranteeGrant).where(DuoGuaranteeGrant.userId == m["id"]))).first() is None


async def test_guarantee_grants_days_once_per_window(app, db):
    other = await seed_member(db, gender="WOMAN", seeking="MEN", city="Lomé")
    ok, sub_ok, end_before = await _subscriber(db, 3)
    young, _, _ = await _subscriber(db, 3, age_days=5)  # période pas écoulée
    few, _, _ = await _subscriber(db, 1)  # pas assez de likes
    duo, _, _ = await _subscriber(db, 3, matched_with=other["id"])  # a eu un duo
    async with session_maker()() as s:
        await appsettings.update(s, {"guarantee.enabled": 1, "guarantee.min_likes": 3, "guarantee.days": 7})
    await db.commit()
    assert await guarantee.run_all(db) >= 1
    got = {g.userId for g in (await db.execute(select(DuoGuaranteeGrant))).scalars()}
    assert ok["id"] in got and not ({young["id"], few["id"], duo["id"]} & got)
    await db.refresh((await db.get(Subscription, sub_ok)))
    assert (await db.get(Subscription, sub_ok)).currentPeriodEnd >= end_before + datetime.timedelta(days=7) - datetime.timedelta(seconds=5)
    await guarantee.run_all(db)  # rien de plus : la fenêtre repart du dernier octroi
    assert len([g for g in (await db.execute(select(DuoGuaranteeGrant).where(DuoGuaranteeGrant.userId == ok["id"]))).scalars()]) == 1


async def test_live_priority_only_for_paid_members_during_an_event(app, db):
    prem = await seed_member(db, gender="WOMAN", seeking="MEN", city="Lomé")
    free = await seed_member(db, gender="WOMAN", seeking="MEN", city="Lomé")
    await make_premium(prem["id"])
    now = utcnow()
    assert await live_events.priority_ids(db, [prem["id"], free["id"]], "Lomé", now) == set()  # pas de soirée en cours
    ev = LiveEvent(title="phase4-soiree", city=None, startsAt=now - datetime.timedelta(minutes=5), endsAt=now + datetime.timedelta(hours=1))
    db.add(ev)
    await db.commit()
    assert await live_events.priority_ids(db, [prem["id"], free["id"]], "Lomé", now) == {prem["id"]}
    ev.city = "Abidjan"
    await db.commit()
    assert await live_events.priority_ids(db, [prem["id"]], "Lomé", now) == set()  # soirée d'une autre ville
    assert await live_events.priority_ids(db, [prem["id"]], "abidjan", now) == {prem["id"]}


async def test_coach_uses_the_other_profile_and_needs_a_plan(app, db):
    w, m, conv = await matched(app, db)
    async with session_maker()() as s:
        await s.execute(update(Profile).where(Profile.userId == m.id).values(occupation="Architecte"))
        await s.commit()
    r = await w.agent.get(f"/api/conversations/{conv}/coach")
    assert r.status_code == 403  # réservé aux formules qui incluent les idées de messagerie
    await make_premium(w.id)
    items = (await w.agent.get(f"/api/conversations/{conv}/coach")).json()["items"]
    assert any("Architecte" in i["text"] and i["kind"] == "PERSONAL" for i in items) and len(items) <= 3
    en = (await w.agent.get(f"/api/conversations/{conv}/coach", params={"locale": "en"})).json()["items"]
    assert any("Architecte" in i["text"] and i["text"].startswith("I saw") for i in en)
    outsider = await member(app, db)
    await make_premium(outsider.id)
    assert (await outsider.agent.get(f"/api/conversations/{conv}/coach")).status_code == 404


async def test_super_like_can_carry_a_message(app, db):
    a = await member(app, db, city="Lomé", gender="MAN")
    b = await member(app, db, city="Lomé")
    await make_premium(a.id)
    r = await a.agent.post("/api/swipes", json={"targetId": b.id, "action": "SUPER_LIKE", "comment": "Ton sourire m'a arrêté net."})
    assert r.status_code == 200, r.text
    row = (await db.execute(select(Swipe).where(Swipe.giverId == a.id, Swipe.targetId == b.id))).scalar_one()
    assert row.action.value == "SUPER_LIKE" and row.comment == "Ton sourire m'a arrêté net."


async def test_gold_plan_catalog_priority_and_badge(app, db):
    from app.core import entitlements, plan_config, profile_card

    gold = await seed_member(db, gender="WOMAN", seeking="MEN", city="Lomé")
    prem = await seed_member(db, gender="WOMAN", seeking="MEN", city="Lomé")
    free = await seed_member(db, gender="WOMAN", seeking="MEN", city="Lomé")
    await entitlements.set_(db, gold["id"], "GOLD", utcnow() + datetime.timedelta(days=30))
    await make_premium(prem["id"])
    await db.commit()
    assert await plan_config.priority_visibility_ids(db, [gold["id"], prem["id"], free["id"]]) == {gold["id"]}
    # Une formule Gold expirée n'a plus la priorité.
    await entitlements.set_(db, free["id"], "GOLD", utcnow() - datetime.timedelta(days=1))
    await db.commit()
    assert gold["id"] in await plan_config.priority_visibility_ids(db, [gold["id"], free["id"]]) and free["id"] not in await plan_config.priority_visibility_ids(db, [free["id"]])
    # Catalogue public : Gold à 10 000 FCFA par mois par défaut, les quatre durées de base.
    viewer = await member(app, db)
    plans = {p["code"]: p for p in (await viewer.agent.get("/api/plans")).json()["plans"]}
    g = plans["GOLD"]
    assert g["features"]["priority_visibility"] is True and g["features"]["boosts_monthly"] == 6 and g["features"]["super_likes_weekly"] == 30
    assert next(p for p in g["prices"] if p["months"] == 1)["totalXof"] == g["priceXof"]
    assert {p["months"] for p in g["prices"]} >= {1, 3, 6, 12}
    # Badge Gold sur la fiche, jamais pour les autres formules.
    prof = (await db.execute(select(Profile).where(Profile.userId.in_([gold["id"], prem["id"]])))).scalars().all()
    cards = {c.profile.userId: profile_card.to_card(c)["gold"] for c in await profile_card.load_cards(db, list(prof))}
    assert cards == {gold["id"]: True, prem["id"]: False}


async def test_gold_purchase_activates_the_plan(app, db):
    from tests.support_c import buy, plan_of

    u = await member(app, db)
    res = await buy(u, {"type": "subscription", "plan": "GOLD", "months": 1})
    assert res is not None
    assert await plan_of(u) == "GOLD"
    lim = (await u.agent.get("/api/subscriptions/me")).json()["limits"]
    assert lim["priorityVisibility"] is True and lim["incognito"] is True and lim["superLikesWeekly"] == 30

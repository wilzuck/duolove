"""Formule de 7 jours : créée DÉSACTIVÉE, activée par l'administration, achat sans engagement (7 jours exacts, jetons proportionnés, facture « 7 jours », un seul rappel la veille)."""
import datetime

import pytest
from sqlalchemy import select, update

from app.core import payments
from app.core.ids import utcnow
from app.db.session import session_maker
from app.models.models import Notification, PlanPrice, Subscription
from tests.support_c import admin, balances, buy, member


@pytest.fixture(autouse=True)
async def _restore(app):
    """Remet la formule de 7 jours dans son état d'origine (désactivée, prix par défaut) après chaque test."""
    yield
    async with session_maker()() as s:
        await s.execute(update(PlanPrice).where(PlanPrice.months == 0).values(active=False, amountOverride=None))
        await s.commit()


async def set_week(ad, active: bool, override: int | None = None, plan: str = "PREMIUM"):
    r = await ad.agent.patch(f"/api/admin/plans/{plan}", json={"prices": [{"months": 0, "discountPercent": 0, "amountOverride": override, "active": active}]})
    assert r.status_code == 200, r.text


async def plans_of(m):
    return {p["code"]: p for p in (await m.agent.get("/api/plans")).json()["plans"]}


async def test_desactivee_par_defaut_puis_activee_par_l_admin_avec_prix_par_defaut(app, db):
    ad, u = await admin(app, db), await member(app, db)
    async with session_maker()() as s:  # les lignes existent pour chaque formule payante, inactives
        rows = (await s.execute(select(PlanPrice).where(PlanPrice.months == 0))).scalars().all()
        assert len(rows) == 2 and not any(r.active for r in rows)
    assert not any(p["months"] == 0 for p in (await plans_of(u))["PREMIUM"]["prices"])
    off = await u.agent.post("/api/checkout", json={"type": "subscription", "plan": "PREMIUM", "months": 0})
    assert off.status_code == 400 and off.json()["error"]["code"] == "PRICE_NOT_AVAILABLE"
    await set_week(ad, True)
    week = next(p for p in (await plans_of(u))["PREMIUM"]["prices"] if p["months"] == 0)
    assert week["totalXof"] == 1000 and week["monthlyEquivalentXof"] == 1000 and week["savingsXof"] == 0  # 40 % de 2 500, arrondi à 50
    vip = next(p for p in (await plans_of(u))["VIP"]["prices"] if p["months"] == 0) if any(p["months"] == 0 for p in (await plans_of(u))["VIP"]["prices"]) else None
    assert vip is None  # chaque formule s'active séparément
    await set_week(ad, True, override=800)  # prix choisi par l'administration
    assert next(p for p in (await plans_of(u))["PREMIUM"]["prices"] if p["months"] == 0)["totalXof"] == 800


async def test_achat_7_jours_duree_exacte_jetons_proportionnes_et_facture(app, db):
    ad, u = await admin(app, db), await member(app, db)
    await set_week(ad, True, override=900)
    before = (await balances(u.id)).get("MATCH_TOKEN", 0)
    co = await buy(u, {"type": "subscription", "plan": "PREMIUM", "months": 0})
    assert co["amountXof"] == 900
    sub = (await u.agent.get("/api/subscriptions/me")).json()
    assert sub["plan"] == "PREMIUM"
    ends = datetime.datetime.fromisoformat(sub["validUntil"].replace("Z", "+00:00")).replace(tzinfo=None)
    assert datetime.timedelta(days=6, hours=23) < ends - utcnow() <= datetime.timedelta(days=7, minutes=1)  # 7 jours, pas un mois
    assert (await balances(u.id)).get("MATCH_TOKEN", 0) - before == 1  # 5 jetons par mois × 7/30 ≈ 1
    hist = (await u.agent.get("/api/payments")).json()
    assert hist[0]["months"] == 0 and hist[0]["amountXof"] == 900
    # Un second achat de 7 jours PROLONGE la période déjà payée.
    await buy(u, {"type": "subscription", "plan": "PREMIUM", "months": 0})
    ends2 = datetime.datetime.fromisoformat((await u.agent.get("/api/subscriptions/me")).json()["validUntil"].replace("Z", "+00:00")).replace(tzinfo=None)
    assert datetime.timedelta(days=13, hours=23) < ends2 - utcnow() <= datetime.timedelta(days=14, minutes=1)


async def test_un_seul_rappel_la_veille_pour_une_formule_de_7_jours(app, db):
    ad, u, monthly = await admin(app, db), await member(app, db), await member(app, db)
    await set_week(ad, True)
    await buy(u, {"type": "subscription", "plan": "PREMIUM", "months": 0})
    await buy(monthly, {"type": "subscription", "plan": "PREMIUM", "months": 1})
    now = utcnow()
    async with session_maker()() as s:
        sent = await payments.send_renewal_reminders(s, now)  # juste après l'achat : 7 jours restants
    async with session_maker()() as s:
        week_sub = (await s.execute(select(Subscription).where(Subscription.userId == u.id))).scalar_one()
        assert week_sub.months == 0
    async def count(uid: str) -> int:
        async with session_maker()() as s:
            return len((await s.execute(select(Notification.id).where(Notification.userId == uid, Notification.type == "SUBSCRIPTION_EXPIRING"))).scalars().all())
    assert await count(u.id) == 0 and sent >= 0  # pas de rappel J-7 le jour de l'achat d'une formule de 7 jours
    async with session_maker()() as s:  # la veille de la fin : exactement un rappel
        await payments.send_renewal_reminders(s, week_sub.currentPeriodEnd - datetime.timedelta(hours=20))
    assert await count(u.id) == 1
    async with session_maker()() as s:
        await payments.send_renewal_reminders(s, week_sub.currentPeriodEnd - datetime.timedelta(hours=10))
    assert await count(u.id) == 1  # pas de doublon


def test_prix_par_defaut_et_equivalents():
    from app.core.constants import duration_label, months_equiv, price_for_duration
    assert price_for_duration(2500, 0, 0) == 1000 and price_for_duration(5000, 0, 0) == 2000 and price_for_duration(100, 0, 0) == 50
    assert price_for_duration(2500, 0, 0, 700) == 700
    assert months_equiv(0) == pytest.approx(7 / 30) and months_equiv(3) == 3
    assert duration_label(0) == "7 jours" and duration_label(1) == "1 mois"
    assert payments.scaled(5, 0) == 1 and payments.scaled(15, 0) == 4 and payments.scaled(2, 0) == 0 and payments.scaled(5, 3) == 15

"""Photos dans les messages : fonctionnalité de formule `chat_images_enabled` (Gratuit non, Premium et VIP oui)."""
from sqlalchemy import select

from app.core import plan_config
from app.core.constants import DEFAULT_PLANS
from app.db.session import session_maker
from app.models.models import SubscriptionPlan


def test_defaults_per_plan():
    assert DEFAULT_PLANS["FREE"]["features"]["chat_images_enabled"] is False
    assert DEFAULT_PLANS["PREMIUM"]["features"]["chat_images_enabled"] is True
    assert DEFAULT_PLANS["VIP"]["features"]["chat_images_enabled"] is True


async def test_existing_plans_gain_the_key_without_losing_admin_changes(app, db):
    """Une formule enregistrée avant l'ajout de la fonctionnalité reçoit la valeur par défaut, sans écraser les réglages de l'administrateur."""
    async with session_maker()() as s:
        plan = (await s.execute(select(SubscriptionPlan).where(SubscriptionPlan.code == "VIP"))).scalar_one()
        original = dict(plan.features)
        legacy = {k: v for k, v in original.items() if k != "chat_images_enabled"}
        legacy["daily_likes_limit"] = 777  # réglage de l'administrateur à conserver
        plan.features = legacy
        await s.commit()
    try:
        async with session_maker()() as s:
            await plan_config.ensure_defaults(s)
        async with session_maker()() as s:
            feats = (await s.execute(select(SubscriptionPlan.features).where(SubscriptionPlan.code == "VIP"))).scalar_one()
        assert feats["chat_images_enabled"] is True and feats["daily_likes_limit"] == 777
    finally:
        async with session_maker()() as s:
            plan = (await s.execute(select(SubscriptionPlan).where(SubscriptionPlan.code == "VIP"))).scalar_one()
            plan.features = original
            await s.commit()
        plan_config.invalidate()


async def test_limits_expose_chat_images(app, db):
    from app.core import entitlements
    from tests.helpers import make_premium, seed_member

    m = await seed_member(db, gender="MAN", seeking="WOMEN", city="Lomé")
    assert (await entitlements.get(db, m["id"]))["limits"]["chatImages"] is False
    await make_premium(m["id"], "VIP")
    plan_config.invalidate()
    assert (await entitlements.get(db, m["id"]))["limits"]["chatImages"] is True

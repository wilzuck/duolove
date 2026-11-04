"""Flags appliqués côté serveur pour boosts, Match en direct, Super Likes, photos de chat et parrainage (suite de test_flags.py)."""
import pytest
from sqlalchemy import delete, func, select, update

from app.core import flags as flags_core
from app.db.session import session_maker
from app.models.models import FeatureFlag, Profile, Referral, User
from tests.helpers import PASSWORD, login, uid
from tests.support_c import admin, balances, member


@pytest.fixture(autouse=True)
async def _clean(app):
    async def wipe():
        async with session_maker()() as s:
            await s.execute(delete(FeatureFlag))
            await s.commit()
        flags_core.invalidate()

    await wipe()
    yield
    await wipe()


def set_flag(a, key, enabled):
    return a.agent.put(f"/api/admin/feature-flags/{key}", json={"enabled": enabled})


def code_of(r):
    return (r.json().get("error") or {}).get("code")


async def register(http, referral=None):
    email = f"fl-{uid()}-{uid()}@test.duomatch"
    body = {"displayName": "Nouveau", "email": email, "password": PASSWORD, "birthDate": "1995-05-05", "gender": "MAN",
            "country": "TG", "city": f"R-{uid()}", "acceptTerms": True, **({"referralCode": referral} if referral else {})}
    r = await http.post("/api/auth/register", json=body)
    return r, email


async def test_boosts_live_superlikes_chat_images(app, db, http):
    a, u, target = await admin(app, db), await member(app, db), await member(app, db, gender="MAN")

    await set_flag(a, "boosts", False)
    assert code_of(await u.agent.post("/api/boosts/activate", json={"creditType": "BOOST_30"})) == "FEATURE_DISABLED"
    await set_flag(a, "boosts", True)
    assert code_of(await u.agent.post("/api/boosts/activate", json={"creditType": "BOOST_30"})) != "FEATURE_DISABLED"

    await set_flag(a, "live_match", False)
    assert (await u.agent.get("/api/live/state")).status_code == 503
    await set_flag(a, "live_match", True)
    assert (await u.agent.get("/api/live/state")).status_code == 200

    await set_flag(a, "super_likes", False)
    assert code_of(await u.agent.post("/api/swipes", json={"targetId": target.id, "action": "SUPER_LIKE"})) == "FEATURE_DISABLED"
    assert (await u.agent.post("/api/swipes", json={"targetId": target.id, "action": "LIKE"})).status_code == 200  # les likes normaux continuent
    await set_flag(a, "super_likes", True)

    await set_flag(a, "chat_images", False)
    assert (await u.agent.post("/api/conversations/inconnue/images")).status_code == 503
    await set_flag(a, "chat_images", True)
    assert (await u.agent.post("/api/conversations/inconnue/images")).status_code != 503


async def test_referral_flag_pending_rewarded_on_reenable(app, db, http):
    a, p = await admin(app, db), await member(app, db)
    code = (await p.agent.get("/api/referral/me")).json()["code"]

    await set_flag(a, "referral_program", False)
    assert (await p.agent.get("/api/referral/me")).json()["enabled"] is False
    off, _ = await register(http, code)
    assert off.status_code == 201  # l'inscription n'est jamais bloquée par le parrainage
    async with session_maker()() as s:
        assert (await s.execute(select(func.count()).select_from(Referral).where(Referral.referrerId == p.id))).scalar_one() == 0

    await set_flag(a, "referral_program", True)
    on, email = await register(http, code)
    assert on.status_code == 201
    async with session_maker()() as s:
        fid = (await s.execute(select(User.id).where(User.email == email))).scalar_one()
        await s.execute(update(User).where(User.id == fid).values(emailVerifiedAt=func.now()))
        await s.execute(update(Profile).where(Profile.userId == fid).values(completeness=100))
        await s.commit()
    await set_flag(a, "referral_program", False)
    f = await login(app, email)
    await f.get("/api/live/state")  # qualifié mais programme coupé : rien n'est versé
    assert (await balances(p.id))["MATCH_TOKEN"] == 0
    async with session_maker()() as s:
        assert (await s.execute(select(func.count()).select_from(Referral).where(Referral.refereeId == fid, Referral.status == "PENDING"))).scalar_one() == 1
    await set_flag(a, "referral_program", True)
    await f.get("/api/live/state")
    assert (await balances(p.id))["MATCH_TOKEN"] == 5

"""Parrainage : code stable, rattachement à l'inscription, récompense unique, plafond, parrain suspendu. Port de promo.spec.ts (partie parrainage)."""
import asyncio
from types import SimpleNamespace

from sqlalchemy import func, select, update

from app.core import flags
from app.core.constants import REFERRAL
from app.core.ids import utcnow
from app.db.session import session_maker
from app.models.models import CreditTransaction, Notification, Profile, Referral, User

from tests.helpers import PASSWORD, login, new_agent, seed_member, uid


async def run(stmt):
    async with session_maker()() as s:
        res = await s.execute(stmt)
        await s.commit()
        return res


async def scalar(stmt):
    async with session_maker()() as s:
        return (await s.execute(stmt)).scalar()


async def member(app, db):
    m = await seed_member(db, gender="WOMAN", seeking="MEN", city=f"P-{uid()}")
    return SimpleNamespace(**m, agent=await login(app, m["email"]))


async def tokens(u):
    return (await u.agent.get("/api/credits")).json()["balances"]["MATCH_TOKEN"]


async def register(app, referral_code=None):
    email = f"ref-{uid()}-{uid()}@test.duomatch"
    body = {"displayName": "Filleul", "email": email, "password": PASSWORD, "birthDate": "1995-05-05", "gender": "MAN",
            "country": "TG", "city": f"R-{uid()}", "acceptTerms": True, **({"referralCode": referral_code} if referral_code else {})}
    c = new_agent(app)
    r = await c.post("/api/auth/register", json=body)
    await c.aclose()
    return r, email


async def qualify(app, email):
    """Rend le filleul qualifié (profil 100 % + e-mail vérifié) puis déclenche la vérification comme le fait l'application."""
    await run(update(User).where(User.email == email).values(emailVerifiedAt=utcnow()))
    uid_ = await scalar(select(User.id).where(User.email == email))
    await run(update(Profile).where(Profile.userId == uid_).values(completeness=100))
    agent = await login(app, email)
    await agent.get("/api/live/state")
    return SimpleNamespace(id=uid_, agent=agent)


async def count(model, *where):
    return await scalar(select(func.count()).select_from(model).where(*where))


async def test_stable_code_and_attach(app, db):
    p = await member(app, db)
    s1 = (await p.agent.get("/api/referral/me")).json()
    assert len(s1["code"]) == 8 and all(ch in "ABCDEFGHJKMNPQRSTUVWXYZ23456789" for ch in s1["code"])
    assert (await p.agent.get("/api/referral/me")).json()["code"] == s1["code"]
    r, _ = await register(app, s1["code"].lower())
    assert r.status_code == 201
    assert await count(Referral, Referral.referrerId == p.id, Referral.status == "PENDING") == 1
    body = (await p.agent.get("/api/referral/me")).json()
    assert (body["invited"], body["pending"], body["rewarded"], body["tokensEarned"]) == (1, 1, 0, 0)


async def test_unknown_code_is_ignored(app, db):
    r, email = await register(app, "ZZZZZZZZ")
    assert r.status_code == 201
    uid_ = await scalar(select(User.id).where(User.email == email))
    assert await count(Referral, Referral.refereeId == uid_) == 0


async def test_reward_once_when_qualified(app, db):
    p = await member(app, db)
    code = (await p.agent.get("/api/referral/me")).json()["code"]
    r, email = await register(app, code)
    assert r.status_code == 201
    # Profil incomplet : rien.
    await run(update(User).where(User.email == email).values(emailVerifiedAt=utcnow()))
    agent = await login(app, email)
    await agent.get("/api/live/state")
    assert await tokens(p) == 0
    # Qualifié : parrain +5, filleul +2 (+3 de cadeau de profil, distinct).
    await qualify(app, email)
    assert await tokens(p) == REFERRAL.REFERRER_TOKENS
    bal = (await agent.get("/api/credits")).json()["balances"]["MATCH_TOKEN"]
    assert bal == REFERRAL.REFEREE_TOKENS + 3
    # Rejeu : rien de plus, même en concurrence.
    await qualify(app, email)
    await asyncio.gather(*[agent.get("/api/live/state") for _ in range(3)])
    assert await tokens(p) == REFERRAL.REFERRER_TOKENS
    assert (await agent.get("/api/credits")).json()["balances"]["MATCH_TOKEN"] == bal
    uid_ = await scalar(select(User.id).where(User.email == email))
    assert await count(Referral, Referral.refereeId == uid_, Referral.status == "REWARDED") == 1
    body = (await p.agent.get("/api/referral/me")).json()
    assert (body["rewarded"], body["pending"], body["tokensEarned"]) == (1, 0, REFERRAL.REFERRER_TOKENS)
    assert await count(Notification, Notification.userId == p.id, Notification.type == "REFERRAL_REWARD") == 1


async def test_cap_per_referrer(app, db):
    p = await member(app, db)
    code = (await p.agent.get("/api/referral/me")).json()["code"]
    for _ in range(REFERRAL.MAX_REWARDED_PER_REFERRER):
        f = await member(app, db)
        async with session_maker()() as s:
            s.add(Referral(referrerId=p.id, refereeId=f.id, status="REWARDED", rewardedAt=utcnow()))
            await s.commit()
    _, email = await register(app, code)
    q = await qualify(app, email)
    assert await tokens(p) == 0
    assert (await q.agent.get("/api/credits")).json()["balances"]["MATCH_TOKEN"] == REFERRAL.REFEREE_TOKENS + 3


async def test_suspended_referrer_gets_nothing_and_auth_required(app, db, http):
    assert (await http.get("/api/referral/me")).status_code == 401
    p = await member(app, db)
    code = (await p.agent.get("/api/referral/me")).json()["code"]
    _, email = await register(app, code)
    await run(update(User).where(User.id == p.id).values(status="SUSPENDED"))
    await qualify(app, email)
    assert await count(CreditTransaction, CreditTransaction.userId == p.id) == 0


async def test_flag_off_ignores_code_and_blocks_reward(app, db):
    p = await member(app, db)
    code = (await p.agent.get("/api/referral/me")).json()["code"]
    from app.models.models import FeatureFlag

    async def set_flag(on):
        async with session_maker()() as s:
            row = (await s.execute(select(FeatureFlag).where(FeatureFlag.key == "referral_program"))).scalar_one_or_none()
            if row:
                row.enabled = on
            else:
                s.add(FeatureFlag(key="referral_program", enabled=on))
            await s.commit()
        flags.invalidate()

    try:
        await set_flag(False)
        r, email = await register(app, code)
        assert r.status_code == 201
        uid_ = await scalar(select(User.id).where(User.email == email))
        assert await count(Referral, Referral.refereeId == uid_) == 0  # code ignoré
        assert (await p.agent.get("/api/referral/me")).json()["enabled"] is False
    finally:
        await set_flag(True)

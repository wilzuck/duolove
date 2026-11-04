"""Menu Match : critères, cadeau de jetons, accès (essais / formule), invitations, choix payé en jetons. Port de live.spec.ts."""
import asyncio
import datetime
import random
import string
from types import SimpleNamespace

from sqlalchemy import func, select, update

from app.core import credits, realtime
from app.core.constants import LIVE
from app.core.ids import utcnow
from app.core.live_criteria import accepts_seeker, matches_criteria
from app.core.live_service import on_presence
from app.db.session import session_maker
from app.models.models import Block, CreditTransaction, Entitlement, LiveInvite, LiveSearch, Match, Profile, User

from tests.helpers import login, seed_member, uid


async def run(stmt):
    async with session_maker()() as s:
        res = await s.execute(stmt)
        await s.commit()
        return res


async def scalar(stmt):
    async with session_maker()() as s:
        return (await s.execute(stmt)).scalar()


async def member(app, db, gender="MAN"):
    m = await seed_member(db, gender=gender, seeking="MEN" if gender == "WOMAN" else "WOMEN", city=f"L-{uid()}")
    return SimpleNamespace(**m, agent=await login(app, m["email"]))


def code() -> str:
    return "".join(random.choice(string.ascii_uppercase) for _ in range(2))


async def set_profile(u, **data):
    await run(update(Profile).where(Profile.userId == u.id).values(**data))


async def premium(user_id):
    until = utcnow() + datetime.timedelta(days=30)
    async with session_maker()() as s:
        from app.core import entitlements

        await entitlements.set_(s, user_id, "PREMIUM", until)
        await s.commit()


def criteria(origin, **extra):
    return {"seeking": "MEN", "ageMin": 18, "ageMax": 60, "originCountry": origin, **extra}


async def tokens(u):
    return (await u.agent.get("/api/credits")).json()["balances"]["MATCH_TOKEN"]


async def backdate(user_id):
    await run(update(LiveSearch).where(LiveSearch.userId == user_id).values(createdAt=utcnow() - datetime.timedelta(minutes=20)))


async def buy_tokens(u, qty=5):
    async with session_maker()() as s:
        await credits.grant(s, u.id, "MATCH_TOKEN", qty, "PURCHASE", f"test:{uid()}")
        await s.commit()


async def candidate(app, db, origin):
    m = await member(app, db, "MAN")
    await set_profile(m, originCountry=origin)
    return m


async def seeker(app, db, plan="PREMIUM"):
    s = await member(app, db, "WOMAN")
    if plan == "PREMIUM":
        await premium(s.id)
    return s


# ───────── critères (fonctions pures) ─────────
def test_criteria_pure():
    base = SimpleNamespace(gender="MAN", birthDate=datetime.datetime(1995, 1, 1), country="TG", intent="SERIOUS", hasChildren=None,
                           likesPets=True, living="ALONE", heightCm=180, originCountry="TG")
    now = datetime.datetime(2026, 6, 1, tzinfo=datetime.timezone.utc)

    def crit(**o):
        return {"seeking": "MEN", "ageMin": 18, "ageMax": 60, "hasChildren": "ANY", "likesPets": "ANY", "living": "ANY", **o}

    assert matches_criteria(crit(), base, now)
    assert not matches_criteria(crit(seeking="WOMEN"), base, now)
    assert not matches_criteria(crit(ageMin=40), base, now)
    assert matches_criteria(crit(likesPets="YES"), base, now)
    assert not matches_criteria(crit(likesPets="NO"), base, now)
    assert not matches_criteria(crit(hasChildren="NO"), base, now)  # information absente : jamais devinée
    assert matches_criteria(crit(hasChildren="NO"), SimpleNamespace(**{**vars(base), "hasChildren": False}), now)
    assert not matches_criteria(crit(living="FAMILY"), base, now)
    assert matches_criteria(crit(heightMin=170, heightMax=185), base, now)
    assert not matches_criteria(crit(heightMin=185), base, now)
    assert not matches_criteria(crit(heightMin=150), SimpleNamespace(**{**vars(base), "heightCm": None}), now)
    assert not matches_criteria(crit(originCountry="SN"), base, now)
    assert not matches_criteria(crit(intents=["MARRIAGE"]), base, now)


def test_reciprocity():
    woman = SimpleNamespace(gender="WOMAN", birthDate=datetime.datetime(1995, 1, 1))
    now = datetime.datetime(2026, 6, 1, tzinfo=datetime.timezone.utc)
    pref = lambda s, a, b: SimpleNamespace(seeking=s, ageMin=a, ageMax=b)  # noqa: E731
    assert accepts_seeker(pref("WOMEN", 18, 40), woman, now)
    assert not accepts_seeker(pref("MEN", 18, 40), woman, now)
    assert not accepts_seeker(pref("WOMEN", 18, 25), woman, now)
    assert not accepts_seeker(None, woman, now)


# ───────── jetons offerts à 100 % ─────────
async def test_gift_tokens_once(app, db):
    a = await member(app, db)
    assert (await a.agent.get("/api/live/state")).json()["tokens"] == 0  # 70 % : rien
    await set_profile(a, completeness=100)
    assert (await a.agent.get("/api/live/state")).json()["tokens"] == LIVE.PROFILE_GIFT_TOKENS
    assert (await a.agent.get("/api/live/state")).json()["tokens"] == 3  # pas de second cadeau
    await set_profile(a, completeness=60)
    await set_profile(a, completeness=100)
    assert (await a.agent.get("/api/live/state")).json()["tokens"] == 3
    n = await scalar(select(func.count()).select_from(CreditTransaction).where(CreditTransaction.userId == a.id, CreditTransaction.reason == "GRANT_PROFILE"))
    assert n == 1

    b = await member(app, db)
    await run(update(User).where(User.id == b.id).values(emailVerifiedAt=None))
    await set_profile(b, completeness=100)
    # Compte non vérifié : la route est protégée et aucun jeton n'est accordé.
    assert (await b.agent.get("/api/live/state")).status_code in (401, 403)
    assert await scalar(select(func.count()).select_from(CreditTransaction).where(CreditTransaction.userId == b.id)) == 0


# ───────── accès : essais gratuits et formule ─────────
async def test_free_trials_and_premium(app, db):
    o = code()
    await candidate(app, db, o)
    f = await seeker(app, db, "FREE")
    st = (await f.agent.get("/api/live/state")).json()
    assert st["access"] == {"unlimited": False, "trialsLeft": 2, "canStart": True}

    assert (await f.agent.post("/api/live/searches", json=criteria(o))).status_code == 200
    again = await f.agent.post("/api/live/searches", json=criteria(o))
    assert again.status_code == 429 and again.json()["error"]["code"] == "LIVE_COOLDOWN"  # délai de 15 min

    await backdate(f.id)
    assert (await f.agent.post("/api/live/searches", json=criteria(o))).status_code == 200  # 2e essai
    await backdate(f.id)
    third = await f.agent.post("/api/live/searches", json=criteria(o))
    assert third.status_code == 403 and third.json()["error"]["code"] == "PLAN_REQUIRED"
    acc = (await f.agent.get("/api/live/state")).json()["access"]
    assert acc["trialsLeft"] == 0 and acc["canStart"] is False

    p = await seeker(app, db, "PREMIUM")
    for _ in range(3):
        assert (await p.agent.post("/api/live/searches", json=criteria(o))).status_code == 200
        await backdate(p.id)
    acc = (await p.agent.get("/api/live/state")).json()["access"]
    assert acc["unlimited"] is True and acc["canStart"] is True


async def test_invalid_criteria(app, db):
    p = await seeker(app, db)
    r = await p.agent.post("/api/live/searches", json={"seeking": "MEN", "ageMin": 40, "ageMax": 20})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


# ───────── recherche, invitations et conversation payée ─────────
async def test_invites_only_eligible(app, db):
    o = code()
    ok = await candidate(app, db, o)
    wrong_origin = await candidate(app, db, "ZZ" if o != "ZZ" else "ZY")
    opted_out = await candidate(app, db, o)
    await set_profile(opted_out, liveOptIn=False)
    offline = await candidate(app, db, o)
    await run(update(User).where(User.id == offline.id).values(lastActiveAt=utcnow() - datetime.timedelta(hours=1)))
    blocker = await candidate(app, db, o)
    s = await seeker(app, db)
    async with session_maker()() as ses:
        ses.add(Block(blockerId=blocker.id, blockedId=s.id))
        await ses.commit()

    r = await s.agent.post("/api/live/searches", json=criteria(o))
    assert r.status_code == 200
    assert r.json()["invited"] == 1
    assert len((await ok.agent.get("/api/live/invites")).json()["items"]) == 1
    for u in (wrong_origin, opted_out, offline, blocker):
        assert (await u.agent.get("/api/live/invites")).json()["items"] == []


async def test_late_connection_receives_invite(app, db):
    o = code()
    late = await candidate(app, db, o)
    await run(update(User).where(User.id == late.id).values(lastActiveAt=utcnow() - datetime.timedelta(hours=1)))
    s = await seeker(app, db)
    assert (await s.agent.post("/api/live/searches", json=criteria(o))).json()["invited"] == 0
    # La présence « en ligne » se déclenche à la connexion du socket : ici on appelle le rappel directement.
    await on_presence(late.id)
    assert len((await late.agent.get("/api/live/invites")).json()["items"]) == 1
    await on_presence(late.id)  # idempotent : toujours une seule invitation
    assert len((await late.agent.get("/api/live/invites")).json()["items"]) == 1
    assert realtime.on_presence is not None  # branché par le routeur live


async def test_pending_cap_per_invitee(app, db):
    o = code()
    target = await candidate(app, db, o)
    total = 0
    for _ in range(LIVE.MAX_PENDING_PER_INVITEE + 1):
        s = await seeker(app, db)
        total += (await s.agent.post("/api/live/searches", json=criteria(o))).json()["invited"]
    assert total == LIVE.MAX_PENDING_PER_INVITEE
    assert len((await target.agent.get("/api/live/invites")).json()["items"]) == LIVE.MAX_PENDING_PER_INVITEE


async def invite_id(u):
    return (await u.agent.get("/api/live/invites")).json()["items"][0]["inviteId"]


async def test_full_flow(app, db):
    o = code()
    c1, c2, c3 = await candidate(app, db, o), await candidate(app, db, o), await candidate(app, db, o)
    s = await seeker(app, db)
    assert (await s.agent.post("/api/live/searches", json=criteria(o))).json()["invited"] == 3
    i1, i2, i3 = await invite_id(c1), await invite_id(c2), await invite_id(c3)

    # Un tiers ne peut ni accepter ni choisir l'invitation d'un autre.
    assert (await c2.agent.post(f"/api/live/invites/{i1}/accept")).status_code == 404
    assert (await c1.agent.post(f"/api/live/invites/{i1}/choose")).status_code == 404

    assert (await c1.agent.post(f"/api/live/invites/{i1}/accept")).status_code == 200
    assert (await c1.agent.post(f"/api/live/invites/{i1}/accept")).status_code == 409  # une seule réponse
    assert (await c2.agent.post(f"/api/live/invites/{i2}/accept")).status_code == 200
    assert (await c3.agent.post(f"/api/live/invites/{i3}/accept")).status_code == 200

    st = (await s.agent.get("/api/live/state")).json()
    assert sorted(a["inviteId"] for a in st["accepted"]) == sorted([i1, i2, i3])
    assert st["search"]["choicesLeft"] == 2

    # Sans jeton : refus, rien n'est débité ni ouvert, l'invitation reste acceptée.
    no_tok = await s.agent.post(f"/api/live/invites/{i1}/choose")
    assert no_tok.status_code == 403 and no_tok.json()["error"]["code"] == "NO_TOKENS"
    assert (await scalar(select(LiveInvite.status).where(LiveInvite.id == i1))).value == "ACCEPTED"
    assert await scalar(select(func.count()).select_from(Match).where((Match.userAId == s.id) | (Match.userBId == s.id))) == 0

    await buy_tokens(s)
    assert await tokens(s) == 5

    ch1 = await s.agent.post(f"/api/live/invites/{i1}/choose")
    assert ch1.status_code == 200
    assert ch1.json()["charged"] == 1 and ch1.json()["tokens"] == 4
    assert (await s.agent.post(f"/api/live/invites/{i1}/choose")).status_code == 409
    assert await tokens(s) == 4  # débité une seule fois

    # Le chat existe et fonctionne pour les deux.
    conv = ch1.json()["conversationId"]
    msg = await s.agent.post(f"/api/conversations/{conv}/messages", json={"body": "Bonjour !"})
    assert msg.status_code == 201
    assert (await c1.agent.get(f"/api/conversations/{conv}/messages")).status_code == 200

    # Choix simultanés : un seul jeton par personne, 2 personnes au plus.
    x, y = await asyncio.gather(s.agent.post(f"/api/live/invites/{i2}/choose"), s.agent.post(f"/api/live/invites/{i3}/choose"))
    assert sorted([x.status_code, y.status_code]) == [200, 409]
    assert await tokens(s) == 3
    assert (await s.agent.get("/api/live/state")).json()["search"]["choicesLeft"] == 0
    n = await scalar(select(func.count()).select_from(CreditTransaction).where(
        CreditTransaction.userId == s.id, CreditTransaction.reason == "CONSUME", CreditTransaction.type == "MATCH_TOKEN"))
    assert n == 2


async def test_already_related_no_charge(app, db):
    o = code()
    t = await candidate(app, db, o)
    s = await seeker(app, db)
    await buy_tokens(s)
    await s.agent.post("/api/live/searches", json=criteria(o))
    i = await invite_id(t)
    await t.agent.post(f"/api/live/invites/{i}/accept")
    a, b = sorted([s.id, t.id])
    async with session_maker()() as ses:
        from app.models.models import Conversation

        m = Match(userAId=a, userBId=b)
        ses.add(m)
        await ses.flush()
        ses.add(Conversation(matchId=m.id))
        await ses.commit()
    r = await s.agent.post(f"/api/live/invites/{i}/choose")
    assert r.status_code == 200 and r.json()["charged"] == 0
    assert await tokens(s) == 5


async def test_decline_optin_cancel(app, db):
    o = code()
    t = await candidate(app, db, o)
    s = await seeker(app, db)
    await s.agent.post("/api/live/searches", json=criteria(o))
    i = await invite_id(t)
    assert (await t.agent.post(f"/api/live/invites/{i}/decline")).status_code == 200
    assert (await s.agent.get("/api/live/state")).json()["accepted"] == []
    assert (await t.agent.put("/api/live/opt-in", json={"enabled": False})).json()["optIn"] is False
    assert (await s.agent.delete("/api/live/searches/active")).status_code == 200
    assert (await s.agent.get("/api/live/state")).json()["search"] is None

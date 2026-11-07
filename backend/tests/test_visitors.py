"""Visiteurs du profil : enregistrement, compteur gratuit, liste Premium, mode discret, blocage."""
from sqlalchemy import update

from app.db.session import session_maker
from app.models.models import Profile
from tests.helpers import make_premium
from tests.support_c import member


async def test_visit_is_recorded_and_free_sees_only_the_count(app, db):
    a, b = await member(app, db), await member(app, db, gender="MAN")
    assert (await a.agent.get(f"/api/profiles/{b.id}")).status_code == 200
    assert (await a.agent.get(f"/api/profiles/{b.id}")).status_code == 200  # revisite : une seule ligne
    free = (await b.agent.get("/api/profiles/me/visitors")).json()
    assert free == {"locked": True, "count": 1, "items": [], "nextCursor": None}


async def test_premium_sees_who_visited_with_visit_count(app, db):
    a, b = await member(app, db), await member(app, db, gender="MAN")
    await a.agent.get(f"/api/profiles/{b.id}")
    await a.agent.get(f"/api/profiles/{b.id}")
    await make_premium(b.id)
    r = (await b.agent.get("/api/profiles/me/visitors")).json()
    assert r["locked"] is False and r["count"] == 1
    assert r["items"][0]["id"] == a.id and r["items"][0]["visits"] == 2 and "visitedAt" in r["items"][0]


async def test_own_profile_incognito_and_blocked_visitors_are_not_listed(app, db):
    owner = await member(app, db, gender="MAN")
    await make_premium(owner.id)
    me_visit = await member(app, db)
    await owner.agent.get(f"/api/profiles/{owner.id}")  # son propre profil : ignoré
    ghost = await member(app, db)
    async with session_maker()() as s:
        await s.execute(update(Profile).where(Profile.userId == ghost.id).values(incognito=True))
        await s.commit()
    await ghost.agent.get(f"/api/profiles/{owner.id}")
    blocked = await member(app, db)
    await blocked.agent.get(f"/api/profiles/{owner.id}")
    await me_visit.agent.get(f"/api/profiles/{owner.id}")
    assert (await owner.agent.post(f"/api/blocks/{blocked.id}")).status_code in (200, 201)
    r = (await owner.agent.get("/api/profiles/me/visitors")).json()
    assert [i["id"] for i in r["items"]] == [me_visit.id] and r["count"] == 1


async def test_visitors_requires_login(app):
    from tests.helpers import new_agent
    assert (await new_agent(app).get("/api/profiles/me/visitors")).status_code == 401

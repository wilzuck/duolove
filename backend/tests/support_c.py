"""Aides communes aux tests de monétisation (membres, admin, achat simulé, soldes lus en base)."""
from dataclasses import dataclass

import httpx
from sqlalchemy import update

from app.core import credits as credits_core
from app.db.session import session_maker
from app.models.models import User
from tests.helpers import login, seed_member, uid


@dataclass
class Member:
    id: str
    email: str
    agent: httpx.AsyncClient


async def member(app, db, *, city: str | None = None, gender: str = "WOMAN") -> Member:
    m = await seed_member(db, gender=gender, seeking="MEN" if gender == "WOMAN" else "WOMEN", city=city or f"M-{uid()}")
    return Member(m["id"], m["email"], await login(app, m["email"]))


async def set_role(user_id: str, role: str) -> None:
    async with session_maker()() as s:
        await s.execute(update(User).where(User.id == user_id).values(role=role))
        await s.commit()


async def admin(app, db) -> Member:
    m = await member(app, db)
    await set_role(m.id, "ADMIN")
    return m


async def balances(user_id: str) -> dict[str, int]:
    async with session_maker()() as s:
        return await credits_core.balances(s, user_id)


async def buy(a: Member, body: dict) -> dict:
    """Paiement simulé complet : checkout → webhook signé (via l'endpoint de simulation serveur)."""
    co = await a.agent.post("/api/checkout", json=body)
    assert co.status_code == 201, co.text
    done = await a.agent.post(f"/api/payments/mock/{co.json()['providerRef']}/complete", json={"outcome": "success"})
    assert done.status_code == 200, done.text
    return co.json()


async def plan_of(a: Member) -> str:
    return (await a.agent.get("/api/subscriptions/me")).json()["plan"]

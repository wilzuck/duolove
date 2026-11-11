"""Aides de test : membres préparés directement en base (rapide), agents HTTP à cookies séparés, images."""
import datetime
import io
import secrets

import httpx
from PIL import Image

from app.core.config import get_settings
from app.core.ids import utcnow
from app.core.security import hash_password
from app.models.models import (
    Entitlement, NotificationPreference, Preference, Profile, ProfilePhoto, User,
)

PASSWORD = "Duomio-Test-2026!"
_hash: str | None = None


def uid() -> str:
    return secrets.token_hex(4)


def jpeg(w: int = 500, h: int = 600) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), "#e91e63").save(buf, "JPEG")
    return buf.getvalue()


def new_agent(app) -> httpx.AsyncClient:
    """Client HTTP avec son propre cookie de session (un par membre simulé). À fermer avec `await c.aclose()`."""
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", headers={"Origin": get_settings().app_url})


async def seed_member(db, *, gender: str, seeking: str, city: str, name: str | None = None, age: int = 28,
                      country: str = "TG", verified: bool = False, intent: str = "SERIOUS") -> dict:
    """Crée un membre complet, vérifié et éligible à la découverte. Retourne {id, email}."""
    global _hash
    if _hash is None:
        _hash = await hash_password(PASSWORD)
    now = utcnow()
    birth = now.replace(year=now.year - age - 1)
    email = f"m-{uid()}-{uid()}@test.duomatch"
    user = User(email=email, passwordHash=_hash, emailVerifiedAt=now, acceptedTermsAt=now)
    db.add(user)
    await db.flush()
    profile = Profile(userId=user.id, displayName=name or f"Membre {uid()}", birthDate=birth, gender=gender, country=country, city=city,
                      intent=intent, completeness=70, verified=verified, onboardedAt=now, bio="Bio de test suffisamment longue pour compter.")
    db.add_all([profile, Preference(userId=user.id, seeking=seeking, ageMin=18, ageMax=99, city=city, country=country),
                NotificationPreference(userId=user.id), Entitlement(userId=user.id)])
    await db.flush()
    db.add(ProfilePhoto(profileId=profile.id, key=f"photos/{uid()}{uid()}.webp", width=500, height=600, isPrimary=True, moderationStatus="APPROVED"))
    await db.commit()
    return {"id": user.id, "email": email}


async def login(app, email: str, password: str = PASSWORD) -> httpx.AsyncClient:
    c = new_agent(app)
    r = await c.post("/api/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        raise AssertionError(f"login failed {r.status_code} {r.text}")
    return c


async def make_premium(user_id: str, plan: str = "PREMIUM", days: int = 30) -> None:
    """Donne une formule payante active (droits lus côté serveur : photos de chat, filtres, Match…)."""
    from app.core import entitlements
    from app.db.session import session_maker

    async with session_maker()() as s:
        await entitlements.set_(s, user_id, plan, utcnow() + datetime.timedelta(days=days))
        await s.commit()


async def age_all_members(minutes: int = 60) -> None:
    """Repart d'un état propre pour le menu Match : tous les membres existants sont « hors ligne » (inactifs depuis `minutes`)
    et les recherches encore actives des exécutions précédentes sont fermées. Sans cela, un candidat au code d'origine tiré au hasard
    pouvait recevoir l'invitation d'une ancienne recherche (active 24 h) ou compter en ligne, et fausser les décomptes."""
    from sqlalchemy import update

    from app.db.session import session_maker
    from app.models.models import LiveInvite, LiveSearch, User

    async with session_maker()() as s:
        await s.execute(update(User).values(lastActiveAt=utcnow() - datetime.timedelta(minutes=minutes)))
        await s.execute(update(LiveInvite).where(LiveInvite.status == "PENDING").values(status="EXPIRED"))
        await s.execute(update(LiveSearch).where(LiveSearch.status == "ACTIVE").values(status="CLOSED"))
        await s.commit()


async def set_plan_feature(code: str, key: str, value) -> object:
    """Change une fonctionnalité d'une formule (comme le ferait l'administration) ; retourne l'ancienne valeur pour la rétablir."""
    from sqlalchemy import select

    from app.core import plan_config
    from app.db.session import session_maker
    from app.models.models import SubscriptionPlan

    async with session_maker()() as s:
        plan = (await s.execute(select(SubscriptionPlan).where(SubscriptionPlan.code == code))).scalar_one()
        old = plan.features.get(key)
        plan.features = {**plan.features, key: value}
        await s.commit()
    plan_config.invalidate()
    return old

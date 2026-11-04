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

"""Cartes de profil (découverte, profil d'un autre membre, matchs, live) : chargement groupé et sérialisation."""
import math
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import flags, promptsvc
from app.core.city_coords import city_coords
from app.core.config import get_settings
from app.core.constants import age_from_birth_date
from app.core.lifestyle import zodiac
from app.models.models import Interest, Profile, ProfilePhoto, User, t_UserInterest

MAX_PHOTOS = 6


def photo_url(key: str) -> str:
    return f"{get_settings().api_url}/api/media/{key}"


def thumb_key(key: str) -> str:
    return key[: -len(".webp")] + "_t.webp" if key.endswith(".webp") else key


@dataclass
class CardProfile:
    profile: Profile
    photos: list[ProfilePhoto] = field(default_factory=list)
    interests: list[str] = field(default_factory=list)
    last_active_at: object = None
    prompts: list[dict] = field(default_factory=list)


def approx_position(p) -> tuple[float, float] | None:
    """Position approximative d'un profil : celle que le membre a partagée (arrondie à 0,1°), sinon celle de sa ville si elle est connue."""
    if p.approxLat is not None and p.approxLng is not None:
        return p.approxLat, p.approxLng
    return city_coords(getattr(p, "country", None), getattr(p, "city", None))


def approx_distance_km(a, b) -> int | None:
    """Distance arrondie à 5 km : on n'expose jamais de position précise. a, b : profils (position partagée ou, à défaut, ville connue)."""
    pa, pb = approx_position(a), approx_position(b)
    if pa is None or pb is None:
        return None
    R = 6371
    rad = math.radians
    d_lat, d_lng = rad(pb[0] - pa[0]), rad(pb[1] - pa[1])
    h = math.sin(d_lat / 2) ** 2 + math.cos(rad(pa[0])) * math.cos(rad(pb[0])) * math.sin(d_lng / 2) ** 2
    return int(math.floor((2 * R * math.asin(math.sqrt(h))) / 5 + 0.5)) * 5


async def load_cards(db: AsyncSession, profiles: list[Profile]) -> list[CardProfile]:
    """Charge photos non rejetées (ordre de position), centres d'intérêt et dernière activité de chaque profil."""
    if not profiles:
        return []
    pids = [p.id for p in profiles]
    uids = [p.userId for p in profiles]
    photos = (await db.execute(
        select(ProfilePhoto).where(ProfilePhoto.profileId.in_(pids), ProfilePhoto.moderationStatus != "REJECTED").order_by(ProfilePhoto.position)
    )).scalars().all()
    by_profile: dict[str, list[ProfilePhoto]] = {}
    for ph in photos:
        by_profile.setdefault(ph.profileId, []).append(ph)
    irows = (await db.execute(
        select(t_UserInterest.c.userId, Interest.slug).join(Interest, Interest.id == t_UserInterest.c.interestId).where(t_UserInterest.c.userId.in_(uids))
    )).all()
    by_user: dict[str, list[str]] = {}
    for uid, slug in irows:
        by_user.setdefault(uid, []).append(slug)
    actives = dict((await db.execute(select(User.id, User.lastActiveAt).where(User.id.in_(uids)))).all())
    prompts = await promptsvc.answers_for(db, uids) if await flags.is_on(db, "profile_prompts") else {}
    return [CardProfile(p, by_profile.get(p.id, []), by_user.get(p.userId, []), actives.get(p.userId), prompts.get(p.userId, [])) for p in profiles]


async def load_card(db: AsyncSession, profile: Profile) -> CardProfile:
    return (await load_cards(db, [profile]))[0]


def to_card(c: CardProfile, *, viewer_interests: list[str] | None = None, distance_km: int | None = None, score: int | float | None = None, affinity: dict | None = None) -> dict:
    p = c.profile
    mine = set(viewer_interests or [])
    return {
        "id": p.userId, "displayName": p.displayName, "age": age_from_birth_date(p.birthDate), "city": p.city, "country": p.country,
        "bio": p.bio, "occupation": p.occupation, "intent": p.intent.value, "verified": p.verified, "languages": p.languages or [],
        "hasChildren": p.hasChildren, "likesPets": p.likesPets, "living": p.living.value if p.living else None,
        "heightCm": p.heightCm, "originCountry": p.originCountry,
        "maritalStatus": p.maritalStatus, "education": p.education, "smoking": p.smoking, "alcohol": p.alcohol,
        "religion": p.religion if p.showReligion else None,  # donnée sensible : jamais montrée si la personne ne l'a pas rendue visible
        "zodiac": zodiac(p.birthDate), "values": list(p.lifeValues or []),
        "interests": c.interests, "commonInterests": [i for i in c.interests if i in mine],
        "distanceKm": distance_km, "compatibility": score, "affinity": affinity, "prompts": c.prompts,
        "photos": [{"id": x.id, "url": photo_url(x.key), "thumbUrl": photo_url(thumb_key(x.key))} for x in c.photos],
    }

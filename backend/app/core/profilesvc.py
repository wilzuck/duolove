"""Profil : lecture, mise à jour, préférences, photos, vérification, localisation."""
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import credits as credits_svc
from app.core import entitlements, storage
from app.core.completeness import completeness_level, compute_completeness
from app.core.constants import INTEREST_SLUGS, age_from_birth_date
from app.core.errors import bad_request, forbidden, not_found
from app.core.ids import new_id, utcnow
from app.core.lifestyle import zodiac
from app.core.profile_card import MAX_PHOTOS, photo_url, thumb_key
from app.models.models import (
    Interest, Preference, Profile, ProfilePhoto, VerificationRequest, t_UserInterest,
)

NULLABLE = {"hasChildren", "likesPets", "living", "heightCm", "originCountry", "maritalStatus", "education", "smoking", "alcohol", "religion"}


def _v(x):
    return getattr(x, "value", x)


async def ensure_interests(db: AsyncSession) -> None:
    for slug in INTEREST_SLUGS:
        await db.execute(insert(Interest).values(id=new_id(), slug=slug).on_conflict_do_nothing(index_elements=["slug"]))


async def _profile(db: AsyncSession, user_id: str) -> Profile:
    p = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one_or_none()
    if not p:
        raise not_found("PROFILE_NOT_FOUND")
    return p


async def _live_photos(db: AsyncSession, profile_id: str) -> list[ProfilePhoto]:
    q = select(ProfilePhoto).where(ProfilePhoto.profileId == profile_id, ProfilePhoto.moderationStatus != "REJECTED").order_by(ProfilePhoto.position)
    return list((await db.execute(q)).scalars().all())


async def get_mine(db: AsyncSession, user_id: str) -> dict:
    p = await _profile(db, user_id)
    photos = await _live_photos(db, p.id)
    slugs = (await db.execute(select(Interest.slug).join(t_UserInterest, t_UserInterest.c.interestId == Interest.id).where(t_UserInterest.c.userId == user_id))).scalars().all()
    pref = (await db.execute(select(Preference).where(Preference.userId == user_id))).scalar_one_or_none()
    pending = (await db.execute(select(VerificationRequest.id).where(VerificationRequest.userId == user_id, VerificationRequest.status == "PENDING"))).first()
    return {
        "id": p.userId, "hasChildren": p.hasChildren, "likesPets": p.likesPets, "living": _v(p.living), "heightCm": p.heightCm,
        "originCountry": p.originCountry, "maritalStatus": p.maritalStatus, "education": p.education, "smoking": p.smoking, "alcohol": p.alcohol,
        "religion": p.religion, "showReligion": p.showReligion, "zodiac": zodiac(p.birthDate), "liveOptIn": p.liveOptIn, "displayName": p.displayName, "birthDate": p.birthDate,
        "age": age_from_birth_date(p.birthDate), "gender": _v(p.gender), "pronouns": p.pronouns, "country": p.country, "city": p.city,
        "bio": p.bio, "occupation": p.occupation, "languages": p.languages or [], "intent": _v(p.intent), "visibility": _v(p.visibility),
        "incognito": p.incognito, "verified": p.verified, "verificationPending": bool(pending), "readReceipts": p.readReceipts or not await _can_control_receipts(db, user_id), "readReceiptsLocked": not await _can_control_receipts(db, user_id), "typingIndicator": p.typingIndicator, "showActivity": p.showActivity,
        "boostedUntil": p.boostedUntil, "completeness": p.completeness, "completenessLevel": completeness_level(p.completeness),
        "onboarded": bool(p.onboardedAt), "interests": list(slugs),
        "photos": [{"id": x.id, "url": photo_url(x.key), "thumbUrl": photo_url(thumb_key(x.key)), "isPrimary": x.isPrimary, "position": x.position} for x in photos],
        "preference": None if not pref else {
            "seeking": _v(pref.seeking), "ageMin": pref.ageMin, "ageMax": pref.ageMax, "country": pref.country, "city": pref.city,
            "intents": [_v(i) for i in (pref.intents or [])], "languages": pref.languages or [], "interests": pref.interests or [],
            "verifiedOnly": pref.verifiedOnly, "activeRecently": pref.activeRecently, "maxDistanceKm": pref.maxDistanceKm,
        },
    }


async def recompute(db: AsyncSession, user_id: str) -> None:
    p = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one_or_none()
    if not p:
        return
    photos = len(await _live_photos(db, p.id))
    n_int = (await db.execute(select(func.count()).select_from(t_UserInterest).where(t_UserInterest.c.userId == user_id))).scalar_one()
    completeness = compute_completeness(bio=p.bio, occupation=p.occupation, interest_count=n_int, photo_count=photos, intent=_v(p.intent))
    p.completeness = completeness
    await db.commit()
    # 100 % → jetons Match offerts une seule fois (idempotent).
    if completeness >= 100:
        from app.core import gift  # fourni par le fork B

        await gift.gift_tokens_if_eligible(db, user_id)


async def update_profile(db: AsyncSession, user_id: str, data: dict) -> dict:
    p = await _profile(db, user_id)
    interests = data.pop("interests", None)
    for k, v in data.items():
        if v is None and k not in NULLABLE:
            continue
        setattr(p, k, v)
    if interests is not None:
        await ensure_interests(db)
        ids = (await db.execute(select(Interest.id).where(Interest.slug.in_(interests)))).scalars().all()
        await db.execute(delete(t_UserInterest).where(t_UserInterest.c.userId == user_id))
        if ids:
            await db.execute(insert(t_UserInterest).values([{"userId": user_id, "interestId": i} for i in ids]))
    await db.commit()
    await recompute(db, user_id)
    return await get_mine(db, user_id)


async def _can_control_receipts(db: AsyncSession, user_id: str) -> bool:
    return bool((await entitlements.get(db, user_id))["limits"]["readReceiptsControl"])


async def set_visibility(db: AsyncSession, user_id: str, visibility: str) -> None:
    await db.execute(update(Profile).where(Profile.userId == user_id).values(visibility=visibility))
    await db.commit()


async def set_incognito(db: AsyncSession, user_id: str, incognito: bool) -> None:
    e = await entitlements.get(db, user_id)
    if incognito and not e["limits"]["incognito"]:
        raise forbidden("PLAN_REQUIRED", "Le mode discret est réservé à la formule VIP")
    await db.execute(update(Profile).where(Profile.userId == user_id).values(incognito=incognito))
    await db.commit()


async def set_read_receipts(db: AsyncSession, user_id: str, value: bool) -> None:
    """Désactiver les accusés de lecture est une option de formule (`read_receipts_control`, réglable par l'administration)."""
    if value is False and not (await entitlements.get(db, user_id))["limits"]["readReceiptsControl"]:
        raise forbidden("PLAN_REQUIRED", "La gestion des accusés de lecture est réservée aux abonnés Premium et VIP")
    await db.execute(update(Profile).where(Profile.userId == user_id).values(readReceipts=value))
    await db.commit()


async def set_show_activity(db: AsyncSession, user_id: str, value: bool) -> None:
    await db.execute(update(Profile).where(Profile.userId == user_id).values(showActivity=value))
    await db.commit()


async def set_typing_indicator(db: AsyncSession, user_id: str, value: bool) -> None:
    await db.execute(update(Profile).where(Profile.userId == user_id).values(typingIndicator=value))
    await db.commit()


async def save_preference(db: AsyncSession, user_id: str, inp) -> dict:
    e = await entitlements.get(db, user_id)
    premium = bool(inp.languages or inp.interests or inp.verifiedOnly or inp.activeRecently or inp.maxDistanceKm)
    # Les filtres avancés ne sont enregistrés que si la formule les inclut (contrôle serveur).
    if premium and not e["limits"]["advancedFilters"]:
        raise forbidden("PLAN_REQUIRED", "Filtres avancés réservés à Premium")
    data = dict(seeking=inp.seeking, ageMin=inp.ageMin, ageMax=inp.ageMax, country=inp.country, city=inp.city, intents=inp.intents or [],
                languages=inp.languages or [], interests=inp.interests or [], verifiedOnly=inp.verifiedOnly or False,
                activeRecently=inp.activeRecently or False, maxDistanceKm=inp.maxDistanceKm)
    stmt = insert(Preference).values(id=new_id(), userId=user_id, updatedAt=utcnow(), **data)
    await db.execute(stmt.on_conflict_do_update(index_elements=["userId"], set_={**data, "updatedAt": utcnow()}))
    await db.commit()
    return await get_mine(db, user_id)


async def complete_onboarding(db: AsyncSession, user_id: str) -> dict:
    p = await _profile(db, user_id)
    if not await _live_photos(db, p.id):
        raise bad_request("PHOTO_REQUIRED", "Ajoutez au moins une photo")
    p.onboardedAt = p.onboardedAt or utcnow()
    await db.commit()
    return await get_mine(db, user_id)


async def add_photo(db: AsyncSession, user_id: str, data: bytes) -> dict:
    p = await _profile(db, user_id)
    photos = await _live_photos(db, p.id)
    if len(photos) >= MAX_PHOTOS:
        raise bad_request("PHOTO_LIMIT", f"Maximum {MAX_PHOTOS} photos")
    img = await storage.process_image(data)
    key = f"photos/{new_id()}.webp"
    await storage.put(key, img.full)
    await storage.put(thumb_key(key), img.thumb)
    # Pas de détecteur de contenu automatique branché : la photo est publiée puis relue par la modération.
    db.add(ProfilePhoto(profileId=p.id, key=key, width=img.width, height=img.height, position=len(photos), isPrimary=not photos, moderationStatus="APPROVED"))
    await db.commit()
    await recompute(db, user_id)
    return await get_mine(db, user_id)


async def delete_photo(db: AsyncSession, user_id: str, photo_id: str) -> dict:
    photo = await db.get(ProfilePhoto, photo_id)
    prof = await db.get(Profile, photo.profileId) if photo else None
    if not photo or not prof or prof.userId != user_id:
        raise not_found("PHOTO_NOT_FOUND")
    key, profile_id = photo.key, photo.profileId
    await db.delete(photo)
    await db.commit()
    await storage.delete(key)
    await storage.delete(thumb_key(key))
    rest = (await db.execute(select(ProfilePhoto).where(ProfilePhoto.profileId == profile_id).order_by(ProfilePhoto.position))).scalars().all()
    for i, ph in enumerate(rest):
        ph.position, ph.isPrimary = i, i == 0
    await db.commit()
    await recompute(db, user_id)
    return await get_mine(db, user_id)


async def reorder_photos(db: AsyncSession, user_id: str, ids: list[str]) -> dict:
    p = await _profile(db, user_id)
    rows = (await db.execute(select(ProfilePhoto).where(ProfilePhoto.profileId == p.id))).scalars().all()
    own = {r.id: r for r in rows}
    if len(ids) != len(own) or not all(i in own for i in ids):
        raise bad_request("INVALID_ORDER")
    for i, pid in enumerate(ids):
        own[pid].position, own[pid].isPrimary = i, i == 0
    await db.commit()
    return await get_mine(db, user_id)


async def request_verification(db: AsyncSession, user_id: str, selfie: bytes) -> dict:
    if (await db.execute(select(VerificationRequest.id).where(VerificationRequest.userId == user_id, VerificationRequest.status == "PENDING"))).first():
        raise bad_request("VERIFICATION_PENDING", "Une demande est déjà en cours")
    img = await storage.process_image(selfie)
    key = f"private/verifications/{new_id()}.webp"
    await storage.put(key, img.full)
    db.add(VerificationRequest(userId=user_id, selfieKey=key))
    await db.commit()
    return {"ok": True}


async def set_location(db: AsyncSession, user_id: str, lat: float | None, lng: float | None) -> None:
    """Localisation opt-in, arrondie à 0,1° (~11 km) AVANT stockage : le GPS précis n'est jamais conservé."""
    await db.execute(update(Profile).where(Profile.userId == user_id).values(approxLat=_round01(lat), approxLng=_round01(lng)))
    await db.commit()


def _round01(n: float | None) -> float | None:
    import math

    return None if n is None else math.floor(n * 10 + 0.5) / 10

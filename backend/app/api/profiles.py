from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import profilesvc
from app.core.auth import AuthUser, current_user
from app.core.errors import AppError, bad_request, not_found
from app.core.profile_card import load_card, to_card
from app.db.session import get_db
from app.models.models import Block, Interest, Profile, User, t_UserInterest
from app.schemas.profiles import LocationIn, OrderIn, PreferenceIn, ProfileUpdateIn, SettingsIn

router = APIRouter(prefix="/profiles", tags=["profiles"])
MAX_UPLOAD = 8 * 1024 * 1024


async def read_upload(file: UploadFile | None) -> bytes:
    if file is None:
        raise bad_request("FILE_REQUIRED", "Fichier manquant")
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise AppError(413, "PAYLOAD_TOO_LARGE", "Fichier trop volumineux")
    return data


@router.get("/me")
async def me(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await profilesvc.get_mine(db, u.id)


@router.patch("/me")
async def update(body: ProfileUpdateIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await profilesvc.update_profile(db, u.id, body.model_dump(exclude_unset=True))


@router.put("/me/preferences")
async def prefs(body: PreferenceIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await profilesvc.save_preference(db, u.id, body)


@router.patch("/me/settings")
async def settings(body: SettingsIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if body.visibility:
        await profilesvc.set_visibility(db, u.id, body.visibility)
    if body.incognito is not None:
        await profilesvc.set_incognito(db, u.id, body.incognito)
    if body.readReceipts is not None:
        await profilesvc.set_read_receipts(db, u.id, body.readReceipts)
    return await profilesvc.get_mine(db, u.id)


@router.put("/me/location")
async def location(body: LocationIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await profilesvc.set_location(db, u.id, body.lat, body.lng)
    return {"ok": True}


@router.delete("/me/location")
async def clear_location(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await profilesvc.set_location(db, u.id, None, None)
    return {"ok": True}


@router.post("/me/photos", status_code=201)
async def add_photo(file: UploadFile | None = File(None), u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await profilesvc.add_photo(db, u.id, await read_upload(file))


@router.put("/me/photos/order")
async def order(body: OrderIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await profilesvc.reorder_photos(db, u.id, body.ids)


@router.delete("/me/photos/{photo_id}")
async def remove_photo(photo_id: str, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await profilesvc.delete_photo(db, u.id, photo_id)


@router.post("/me/onboarding/complete", status_code=200)
async def complete(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await profilesvc.complete_onboarding(db, u.id)


@router.post("/me/verification", status_code=201)
async def verification(file: UploadFile | None = File(None), u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await profilesvc.request_verification(db, u.id, await read_upload(file))


@router.get("/{user_id}")
async def view(user_id: str, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Profil complet d'un autre membre. Refusé si bloqué (dans un sens ou l'autre), suspendu ou masqué."""
    p = (await db.execute(select(Profile).join(User, User.id == Profile.userId).where(Profile.userId == user_id, User.status == "ACTIVE"))).scalar_one_or_none()
    block = (await db.execute(select(Block.id).where(or_((Block.blockerId == u.id) & (Block.blockedId == user_id), (Block.blockerId == user_id) & (Block.blockedId == u.id))).limit(1))).first()
    if not p or block or (p.visibility.value == "HIDDEN" and user_id != u.id):
        raise not_found("PROFILE_NOT_FOUND")
    mine = (await db.execute(select(Interest.slug).join(t_UserInterest, t_UserInterest.c.interestId == Interest.id).where(t_UserInterest.c.userId == u.id))).scalars().all()
    return to_card(await load_card(db, p), viewer_interests=list(mine))

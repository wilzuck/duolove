from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.inspection import inspect

from app.core import access, accountsvc, credits, entitlements, rhythm
from app.core.auth import AuthUser, current_user, current_user_allow_suspended, current_user_allow_unverified
from app.core.errors import AppError, bad_request, unauthorized
from app.core.ids import utcnow
from app.core.profile_card import photo_url, thumb_key
from app.core.ratelimit import limit
from app.core.security import verify_password
from app.db.session import get_db
from app.models.models import (
    Block, Interest, Invoice, Match, Message, ModerationAction, Notification, NotificationPreference, Payment, Preference, Profile,
    ProfilePhoto, Report, Session, Swipe, User, Conversation, t_UserInterest,
)
from app.schemas.profiles import AppealIn, ConsentIn, DeleteAccountIn

router = APIRouter(prefix="/users", tags=["users"])


def row_dict(o, exclude: tuple[str, ...] = ()) -> dict:
    """Ligne SQLAlchemy → dict JSON (colonnes uniquement ; enums en valeur)."""
    return {c.key: getattr(getattr(o, c.key), "value", getattr(o, c.key)) for c in inspect(o).mapper.column_attrs if c.key not in exclude}


@router.get("/me")
async def me(u: AuthUser = Depends(current_user_allow_suspended), db: AsyncSession = Depends(get_db)):
    user = await db.get(User, u.id)
    # Profil et première photo en une seule requête (sous-requête scalaire).
    first_photo = (select(ProfilePhoto.key).where(ProfilePhoto.profileId == Profile.id, ProfilePhoto.moderationStatus != "REJECTED")
                   .order_by(ProfilePhoto.position).limit(1).scalar_subquery())
    row = (await db.execute(select(Profile, first_photo).where(Profile.userId == u.id))).first()
    profile, photo_key = (row[0], row[1]) if row else (None, None)
    e = await entitlements.get(db, u.id)
    unread = (await db.execute(select(func.count()).select_from(Notification).where(Notification.userId == u.id, Notification.readAt.is_(None)))).scalar_one()
    suspended = user.status.value == "SUSPENDED"
    moderation = None
    if suspended:  # inutile (et coûteux) pour un compte en règle
        moderation = (await db.execute(select(ModerationAction).where(ModerationAction.targetUserId == u.id, ModerationAction.type.in_(["SUSPEND", "BAN"])).order_by(ModerationAction.createdAt.desc()).limit(1))).scalar_one_or_none()
    return {
        "id": user.id, "email": user.email, "emailVerified": bool(user.emailVerifiedAt), "role": user.role.value, "status": user.status.value,
        "suspendedUntil": user.suspendedUntil, "marketingConsent": user.marketingConsent,
        "profile": None if not profile else {"displayName": profile.displayName, "onboarded": bool(profile.onboardedAt), "completeness": profile.completeness, "verified": bool(profile.verified),
                                              "paused": rhythm.is_paused(profile), "pauseEndsAt": profile.pauseEndsAt if rhythm.is_paused(profile) else None,
                                              "thumbUrl": photo_url(thumb_key(photo_key)) if photo_key else None},
        "entitlement": {"plan": e["plan"], "validUntil": e["validUntil"], "limits": e["limits"], "credits": await credits.balances(db, u.id)},
        "access": await access.status(db, user),
        "unreadNotifications": unread,
        "toursSeen": list(user.toursSeen or []),
        "moderation": {"reason": moderation.reason, "appealStatus": moderation.appealStatus.value, "id": moderation.id} if suspended and moderation else None,
    }


class TourIn(BaseModel):
    tour: str = Field(pattern=r"^[a-z][a-z0-9-]{1,30}$")


@router.post("/me/tours")
async def tour_seen(body: TourIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Guide de découverte terminé ou passé : il ne sera plus montré automatiquement (sur aucun appareil)."""
    user = await db.get(User, u.id)
    seen = list(user.toursSeen or [])
    if body.tour not in seen and len(seen) < 50:
        user.toursSeen = [*seen, body.tour]
        await db.commit()
    return {"toursSeen": list(user.toursSeen or [])}


@router.delete("/me/tours")
async def tours_reset(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """« Revoir les guides » : chaque page remontrera son guide au prochain passage."""
    await db.execute(update(User).where(User.id == u.id).values(toursSeen=[]))
    await db.commit()
    return {"toursSeen": []}


@router.post("/me/consents", status_code=200)
async def consents(body: ConsentIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(User).where(User.id == u.id).values(marketingConsent=body.marketingConsent))
    await db.commit()
    return {"marketingConsent": body.marketingConsent}


@router.post("/me/appeal", status_code=200)
async def appeal(body: AppealIn, u: AuthUser = Depends(current_user_allow_suspended), db: AsyncSession = Depends(get_db)):
    """Contestation d'une suspension : ouvre une demande de révision humaine."""
    action = (await db.execute(select(ModerationAction).where(ModerationAction.targetUserId == u.id, ModerationAction.type.in_(["SUSPEND", "BAN"])).order_by(ModerationAction.createdAt.desc()).limit(1))).scalar_one_or_none()
    if not action:
        raise bad_request("NO_SANCTION")
    if action.appealStatus.value != "NONE":
        raise AppError(409, "APPEAL_ALREADY_SENT")
    action.appealStatus, action.appealText, action.appealedAt = "PENDING", body.text, utcnow()
    await db.commit()
    return {"ok": True}


@router.get("/me/export", dependencies=[limit(3, 3600)])
async def export(res: Response, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Portabilité RGPD : toutes les données personnelles de l'utilisateur au format JSON."""
    res.headers["Content-Disposition"] = 'attachment; filename="crushduo-export.json"'
    user = await db.get(User, u.id)
    async def rows(model, *where, order=None):
        q = select(model).where(*where)
        if order is not None:
            q = q.order_by(order)
        return [row_dict(r) for r in (await db.execute(q)).scalars().all()]

    profile = (await db.execute(select(Profile).where(Profile.userId == u.id))).scalar_one_or_none()
    pref = (await db.execute(select(Preference).where(Preference.userId == u.id))).scalar_one_or_none()
    nprefs = (await db.execute(select(NotificationPreference).where(NotificationPreference.userId == u.id))).scalar_one_or_none()
    interests = [{"userId": uid, "interestId": iid, "interest": {"id": iid, "slug": slug}} for uid, iid, slug in
                 (await db.execute(select(t_UserInterest.c.userId, t_UserInterest.c.interestId, Interest.slug).join(Interest, Interest.id == t_UserInterest.c.interestId).where(t_UserInterest.c.userId == u.id))).all()]
    account = {**row_dict(user, exclude=("passwordHash",)), "profile": row_dict(profile) if profile else None, "preference": row_dict(pref) if pref else None,
               "notificationPref": row_dict(nprefs) if nprefs else None, "interests": interests}
    match_ids = select(Match.id).where(or_(Match.userAId == u.id, Match.userBId == u.id))
    msg_q = (select(Message).join(Conversation, Conversation.id == Message.conversationId)
             .where(or_(Message.senderId == u.id, Conversation.matchId.in_(match_ids))).order_by(Message.createdAt.asc()))
    messages = [{k: getattr(m, k) for k in ("id", "conversationId", "senderId", "body", "createdAt", "deletedAt")} for m in (await db.execute(msg_q)).scalars().all()]
    payments = []
    for p in (await db.execute(select(Payment).where(Payment.userId == u.id))).scalars().all():
        inv = (await db.execute(select(Invoice).where(Invoice.paymentId == p.id))).scalar_one_or_none()
        payments.append({**row_dict(p), "invoice": row_dict(inv) if inv else None})
    sessions = [{k: getattr(s, k) for k in ("id", "userAgent", "createdAt", "lastUsedAt", "revokedAt")} for s in (await db.execute(select(Session).where(Session.userId == u.id))).scalars().all()]
    return {
        "exportedAt": utcnow(), "account": account,
        "swipes": await rows(Swipe, Swipe.giverId == u.id),
        "matches": await rows(Match, or_(Match.userAId == u.id, Match.userBId == u.id)),
        "messages": messages, "payments": payments,
        "notifications": await rows(Notification, Notification.userId == u.id),
        "sessions": sessions, "blocks": await rows(Block, Block.blockerId == u.id), "reportsMade": await rows(Report, Report.reporterId == u.id),
    }


@router.delete("/me", dependencies=[limit(5, 3600)])
async def remove(body: DeleteAccountIn, u: AuthUser = Depends(current_user_allow_unverified), db: AsyncSession = Depends(get_db)):
    """Suppression du compte : anonymisation immédiate, sessions révoquées, photos effacées."""
    user = await db.get(User, u.id)
    if user.passwordHash and not (body.password and await verify_password(user.passwordHash, body.password)):
        raise unauthorized("INVALID_CREDENTIALS", "Mot de passe incorrect")
    await accountsvc.anonymize(db, u.id)
    return {"ok": True}

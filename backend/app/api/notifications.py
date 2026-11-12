from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import entitlements, notifications
from app.core.auth import AuthUser, current_user
from app.core.errors import not_found
from app.core.ids import new_id, utcnow
from app.core.ratelimit import limit
from app.db.session import get_db
from app.models.models import Notification, NotificationPreference
from app.schemas.profiles import NotifPrefsIn

router = APIRouter(prefix="/notifications", tags=["notifications"])
_PREF_COLS = ["inAppLikes", "inAppMatches", "inAppMessages", "emailLikes", "emailMatches", "emailMessages", "pushEnabled", "emailWeekly"]


def _int(v: str | None, default: int) -> int:
    try:
        return int(v) if v is not None else default
    except ValueError:
        return default


@router.get("")
async def list_notifications(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db), cursor: str | None = None, limit: str = Query("30")):
    take = min(max(_int(limit, 30) or 30, 1), 50)
    q = select(Notification).where(Notification.userId == u.id)
    if cursor:
        cur = await db.get(Notification, cursor)
        if cur:
            q = q.where((Notification.createdAt < cur.createdAt) | ((Notification.createdAt == cur.createdAt) & (Notification.id < cur.id)))
    rows = (await db.execute(q.order_by(Notification.createdAt.desc(), Notification.id.desc()).limit(take + 1))).scalars().all()
    page = rows[:take]
    see_likers = (await entitlements.get(db, u.id))["limits"]["seeLikers"]
    items = []
    for n in page:
        data = n.data if isinstance(n.data, dict) else {}
        # Identité des likes masquée tant que la formule ne la donne pas (Super Like toujours visible).
        reveal = n.type.value != "LIKE" or see_likers or data.get("superLike") is True
        items.append({"id": n.id, "type": n.type.value, "readAt": n.readAt, "createdAt": n.createdAt, "data": data if reveal else {}})
    return {"items": items, "nextCursor": page[-1].id if len(rows) > take else None}


@router.get("/unread-count")
async def unread(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    n = (await db.execute(select(func.count()).select_from(Notification).where(Notification.userId == u.id, Notification.readAt.is_(None)))).scalar_one()
    return {"count": n}


@router.post("/read-all", status_code=201)
async def read_all(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Notification).where(Notification.userId == u.id, Notification.readAt.is_(None)).values(readAt=utcnow()))
    await db.commit()
    return {"ok": True}


@router.post("/unsubscribe-email", dependencies=[limit(30, 3600)])
async def unsubscribe_email(token: str = Query(min_length=10, max_length=200), db: AsyncSession = Depends(get_db)):
    """Désabonnement en un clic depuis un e-mail de notification (sans connexion) ; accepte aussi le POST « un clic » des clients mail."""
    if not await notifications.unsubscribe_emails(db, token):
        raise not_found("UNSUBSCRIBE_LINK_INVALID")
    return {"ok": True}


@router.get("/preferences")
async def get_prefs(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await _upsert(db, u.id, {})


@router.put("/preferences")
async def set_prefs(body: NotifPrefsIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await _upsert(db, u.id, body.model_dump(exclude_none=True))


async def _upsert(db: AsyncSession, user_id: str, data: dict) -> dict:
    stmt = insert(NotificationPreference).values(id=new_id(), userId=user_id, **data)
    stmt = stmt.on_conflict_do_update(index_elements=["userId"], set_=data) if data else stmt.on_conflict_do_nothing(index_elements=["userId"])
    await db.execute(stmt)
    await db.commit()
    p = (await db.execute(select(NotificationPreference).where(NotificationPreference.userId == user_id))).scalar_one()
    return {c: getattr(p, c) for c in _PREF_COLS}


@router.post("/{notification_id}/read", status_code=201)
async def read(notification_id: str, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Notification).where(Notification.id == notification_id, Notification.userId == u.id, Notification.readAt.is_(None)).values(readAt=utcnow()))
    await db.commit()
    return {"ok": True}

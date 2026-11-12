"""Authentification par cookie de session httpOnly (jeton opaque → hachage SHA-256 en base) et contrôle des rôles."""
import datetime
from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.errors import AppError, forbidden, unauthorized
from app.core.ids import utcnow
from app.core.security import sha256
from app.db.session import get_db
from app.models.models import Session, User, UserStatus

SESSION_COOKIE = "duomatch_sid"
ROLE_RANK = {"USER": 0, "MODERATOR": 1, "ADMIN": 2, "SUPER_ADMIN": 3}


@dataclass
class AuthUser:
    id: str
    role: str
    email: str
    email_verified: bool
    session_id: str


def has_role(role: str, minimum: str) -> bool:
    return ROLE_RANK[role] >= ROLE_RANK[minimum]


async def resolve_session(db: AsyncSession, token: str | None) -> tuple[Session, User] | None:
    """Résout un cookie de session. Utilisé par les routes HTTP et par la passerelle WebSocket."""
    if not token:
        return None
    s = (await db.execute(select(Session).where(Session.tokenHash == sha256(token)))).scalar_one_or_none()
    if not s or s.revokedAt or s.expiresAt < utcnow():
        return None
    u = await db.get(User, s.userId)
    if not u or u.status.value in ("DELETED", "BANNED"):
        return None
    return s, u


async def _authenticate(request: Request, db: AsyncSession, *, allow_suspended: bool, allow_unverified: bool = False) -> AuthUser:
    found = await resolve_session(db, request.cookies.get(SESSION_COOKIE))
    if not found:
        raise unauthorized()
    session, user = found
    # Un compte suspendu garde l'accès à /users/me et à la contestation, rien d'autre.
    if user.status.value == "SUSPENDED" and user.suspendedUntil and user.suspendedUntil < utcnow():
        user.status, user.suspendedUntil = UserStatus.ACTIVE, None
        await db.commit()
    if user.status.value == "SUSPENDED" and not allow_suspended:
        raise forbidden("ACCOUNT_SUSPENDED")
    # Compte non confirmé : rien d'autre que confirmer son e-mail (ou se déconnecter / supprimer le compte). Appliqué ici, pour TOUTES les routes protégées.
    if not allow_unverified and get_settings().require_email_verification and not user.emailVerifiedAt:
        raise forbidden("EMAIL_NOT_VERIFIED")
    # Accès payant (interrupteur d'administration) : un membre sans formule ne garde que son compte, son profil et le paiement.
    from app.core import access

    if not access.path_allowed(request.url.path) and (await access.status(db, user))["locked"]:
        raise AppError(402, "ACCESS_PAYWALL", "Un abonnement est requis pour accéder à Crushduo.")
    # Activité : écriture au plus toutes les 5 min pour ne pas charger la base.
    if utcnow() - session.lastUsedAt > datetime.timedelta(minutes=5):
        now = utcnow()
        await db.execute(update(Session).where(Session.id == session.id).values(lastUsedAt=now))
        await db.execute(update(User).where(User.id == user.id).values(lastActiveAt=now))
        await db.commit()
    return AuthUser(user.id, user.role.value, user.email, bool(user.emailVerifiedAt), session.id)


async def current_user(request: Request, db: AsyncSession = Depends(get_db)) -> AuthUser:
    return await _authenticate(request, db, allow_suspended=False)


async def current_user_allow_suspended(request: Request, db: AsyncSession = Depends(get_db)) -> AuthUser:
    return await _authenticate(request, db, allow_suspended=True, allow_unverified=True)


async def current_user_allow_unverified(request: Request, db: AsyncSession = Depends(get_db)) -> AuthUser:
    """Pour la seule étape de confirmation de l'e-mail (saisie du code, renvoi) et la suppression du compte."""
    return await _authenticate(request, db, allow_suspended=False, allow_unverified=True)


async def verified_user(u: AuthUser = Depends(current_user)) -> AuthUser:
    """Exige un e-mail vérifié (sauf si REQUIRE_EMAIL_VERIFICATION=false en dev)."""
    if get_settings().require_email_verification and not u.email_verified:
        raise forbidden("EMAIL_NOT_VERIFIED")
    return u


def require_role(minimum: str):
    async def _dep(u: AuthUser = Depends(current_user)) -> AuthUser:
        if not has_role(u.role, minimum):
            raise forbidden("FORBIDDEN")
        return u

    return _dep


moderator = Depends(require_role("MODERATOR"))
admin_user = Depends(require_role("ADMIN"))

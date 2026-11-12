"""Double authentification (TOTP) : réglages du membre et deuxième étape de la connexion."""
from fastapi import APIRouter, Depends, Request, Response
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import ctx_of, set_session_cookie
from app.core import authsvc, notifications, twofactor
from app.core.auth import AuthUser, current_user
from app.core.ratelimit import limit
from app.db.session import get_db
from app.models.models import User
from app.schemas.common import Body

router = APIRouter(prefix="/auth/2fa", tags=["auth"])

Code = Field(min_length=1, max_length=32)


class CodeIn(Body):
    code: str = Code


class DisableIn(Body):
    code: str = Code
    password: str | None = Field(None, max_length=128)


class LoginIn(Body):
    challenge: str = Field(min_length=10, max_length=200)
    code: str = Code
    remember: bool = True


async def _me(db: AsyncSession, u: AuthUser) -> User:
    return await db.get(User, u.id)


@router.get("")
async def status(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return twofactor.status(await _me(db, u))


@router.post("/setup", dependencies=[limit(10, 600)])
async def setup(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Génère une clé à ajouter dans l'application d'authentification (non active tant qu'un code n'a pas été confirmé)."""
    return await twofactor.begin_setup(db, await _me(db, u))


@router.post("/enable", dependencies=[limit(10, 600)])
async def enable(body: CodeIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    codes = await twofactor.enable(db, await _me(db, u), body.code)
    await notifications.create(db, u.id, "SECURITY_ALERT", {"event": "two_factor_on"})
    return {"recoveryCodes": codes}  # montrés UNE SEULE FOIS


@router.post("/disable", dependencies=[limit(10, 600)])
async def disable(body: DisableIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await twofactor.disable(db, await _me(db, u), body.password, body.code)
    await notifications.create(db, u.id, "SECURITY_ALERT", {"event": "two_factor_off"})
    return {"ok": True}


@router.post("/recovery", dependencies=[limit(10, 600)])
async def recovery(body: CodeIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return {"recoveryCodes": await twofactor.regenerate_recovery(db, await _me(db, u), body.code)}


@router.post("/login", status_code=200, dependencies=[limit(10, 600)])
async def login(body: LoginIn, req: Request, res: Response, db: AsyncSession = Depends(get_db)):
    """Étape 2 de la connexion : défi reçu après le mot de passe (ou le lien magique) + code de l'application ou code de secours."""
    user, (token, expires) = await authsvc.complete_two_factor(db, body.challenge, body.code, body.remember, ctx_of(req))
    set_session_cookie(res, token, expires, body.remember)
    return {"id": user.id, "email": user.email, "role": user.role.value, "emailVerified": bool(user.emailVerifiedAt)}

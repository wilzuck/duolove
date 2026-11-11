from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import authsvc
from app.core.auth import SESSION_COOKIE, AuthUser, resolve_session, current_user, current_user_allow_suspended, current_user_allow_unverified
from app.core.config import get_settings
from app.core.errors import AppError, not_found
from app.core.flags import require_flag
from app.core.ids import utcnow
from app.core.ratelimit import client_ip, limit
from app.db.session import get_db
from app.models.models import Session
from app.schemas.auth import ChangePasswordIn, EmailIn, GoogleIn, LoginIn, MagicLinkIn, MagicLinkVerifyIn, RegisterIn, ResetIn, TokenIn, CodeIn

router = APIRouter(prefix="/auth", tags=["auth"])


def set_session_cookie(res: Response, token: str, expires, remember: bool = True) -> None:
    """Sans « Restez connecté » : cookie de session (aucune date d'expiration), supprimé à la fermeture du navigateur."""
    s = get_settings()
    exp = expires.replace(tzinfo=__import__("datetime").timezone.utc) if remember else None
    res.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="lax", secure=s.is_prod, path="/", expires=exp, domain=s.cookie_domain)


def ctx_of(req: Request) -> authsvc.ReqCtx:
    return authsvc.ReqCtx(ip=client_ip(req), user_agent=req.headers.get("user-agent"))


@router.post("/register", status_code=201, dependencies=[require_flag("registration_open"), limit(10)])
async def register(body: RegisterIn, req: Request, res: Response, db: AsyncSession = Depends(get_db)):
    user, (token, expires) = await authsvc.register(db, body, ctx_of(req))
    set_session_cookie(res, token, expires)
    return {"id": user.id, "email": user.email, "emailVerified": False}


@router.post("/login", status_code=200, dependencies=[limit(10)])
async def login(body: LoginIn, req: Request, res: Response, db: AsyncSession = Depends(get_db)):
    user, (token, expires) = await authsvc.login(db, body, ctx_of(req))
    set_session_cookie(res, token, expires, body.remember)
    return {"id": user.id, "email": user.email, "role": user.role.value, "emailVerified": bool(user.emailVerifiedAt)}


@router.post("/magic-link", status_code=202, dependencies=[limit(5)])
async def magic_link(body: MagicLinkIn, db: AsyncSession = Depends(get_db)):
    await authsvc.request_magic_link(db, body.email, body.remember)
    return {"ok": True}


@router.post("/magic-link/verify", status_code=200, dependencies=[limit(10)])
async def magic_link_verify(body: MagicLinkVerifyIn, req: Request, res: Response, db: AsyncSession = Depends(get_db)):
    user, (token, expires) = await authsvc.login_with_magic_link(db, body.token, body.remember, ctx_of(req))
    set_session_cookie(res, token, expires, body.remember)
    return {"id": user.id, "email": user.email, "role": user.role.value, "emailVerified": True}


@router.post("/google", status_code=200, dependencies=[limit(10)])
async def google(body: GoogleIn, req: Request, res: Response, db: AsyncSession = Depends(get_db)):
    user, (token, expires) = await authsvc.google(db, body.idToken, body, ctx_of(req))
    set_session_cookie(res, token, expires, body.remember)
    return {"id": user.id, "email": user.email, "role": user.role.value, "emailVerified": True}


@router.post("/apple", status_code=200)
async def apple():
    # Apple Sign In nécessite un compte développeur Apple (clés à fournir) : volontairement non activé.
    raise AppError(501, "OAUTH_NOT_CONFIGURED", "Connexion Apple non configurée")


@router.get("/session")
async def session_state(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Le visiteur est-il connecté ? Toujours 200 (jamais de 401 dans la console) : les pages publiques adaptent leurs boutons (« Ouvrir Crushduo » au lieu de « Se connecter »)."""
    response.headers["Cache-Control"] = "no-store"
    found = await resolve_session(db, request.cookies.get(SESSION_COOKIE))
    return {"authenticated": bool(found and found[1].status.value == "ACTIVE")}


@router.post("/logout", status_code=200)
async def logout(res: Response, u: AuthUser = Depends(current_user_allow_suspended), db: AsyncSession = Depends(get_db)):
    await authsvc.logout(db, u.session_id)
    res.delete_cookie(SESSION_COOKIE, path="/", domain=get_settings().cookie_domain)
    return {"ok": True}


@router.post("/verify-email", status_code=200, dependencies=[limit(10)])
async def verify(body: TokenIn, db: AsyncSession = Depends(get_db)):
    await authsvc.verify_email(db, body.token)
    return {"ok": True}


@router.post("/resend-verification", status_code=200, dependencies=[limit(10, 600)])
async def resend(u: AuthUser = Depends(current_user_allow_unverified), db: AsyncSession = Depends(get_db)):
    return {"ok": True, "resendIn": await authsvc.resend_verification(db, u.id)}


@router.get("/verification")
async def verification(u: AuthUser = Depends(current_user_allow_unverified), db: AsyncSession = Depends(get_db)):
    return await authsvc.verification_state(db, u.id)


@router.post("/verify-code", status_code=200, dependencies=[limit(20, 600)])
async def verify_code(body: CodeIn, u: AuthUser = Depends(current_user_allow_unverified), db: AsyncSession = Depends(get_db)):
    await authsvc.verify_code(db, u.id, body.code)
    return {"ok": True}


@router.post("/forgot-password", status_code=202, dependencies=[limit(5)])
async def forgot(body: EmailIn, db: AsyncSession = Depends(get_db)):
    await authsvc.forgot_password(db, body.email)
    return {"ok": True}


@router.post("/reset-password", status_code=200, dependencies=[limit(10)])
async def reset(body: ResetIn, db: AsyncSession = Depends(get_db)):
    await authsvc.reset_password(db, body.token, body.password)
    return {"ok": True}


@router.post("/change-password", status_code=200, dependencies=[limit(10)])
async def change(body: ChangePasswordIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await authsvc.change_password(db, u.id, body.current, body.next, u.session_id)
    return {"ok": True}


@router.get("/sessions")
async def sessions(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Session).where(Session.userId == u.id, Session.revokedAt.is_(None), Session.expiresAt > utcnow()).order_by(Session.lastUsedAt.desc()))).scalars().all()
    return [{"id": s.id, "userAgent": s.userAgent, "createdAt": s.createdAt, "lastUsedAt": s.lastUsedAt, "current": s.id == u.session_id} for s in rows]


@router.delete("/sessions/{session_id}")
async def revoke(session_id: str, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    r = await db.execute(update(Session).where(Session.id == session_id, Session.userId == u.id, Session.revokedAt.is_(None)).values(revokedAt=utcnow()))
    await db.commit()
    if r.rowcount == 0:
        raise not_found()
    return {"ok": True}

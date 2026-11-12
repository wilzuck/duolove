"""Point d'entrée FastAPI de Crushduo. Routes sous /api, Socket.IO sous /socket.io, même port que l'ancienne API (4000)."""
import asyncio
import importlib
import logging
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

import socketio
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core import backups, storage, broadcastsvc, callsvc, dailyqsvc, speedsvc, datesvc, icebreakers, maintenance, jsonfmt, mail, payments, plan_config, promptsvc, realtime
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.ratelimit import global_limit
from app.db.session import dispose, get_db, session_maker

log = logging.getLogger("duomatch")
jsonfmt.install()

# Routeurs (un module par domaine) : chacun expose `router`.
ROUTERS = [
    "auth", "users", "profiles", "media", "discovery", "swipes", "matches", "chat", "subscriptions", "boosts",
    "live", "referral", "reports", "notifications", "admin", "admin_blog", "blog", "engagement", "admin_engagement", "dates", "calls", "speed", "contact", "newsletter", "places", "ses_webhook", "installs", "social", "admin_backups", "admin_broadcasts", "admin_payment_config", "access", "admin_access",
]


class SecurityHeaders(BaseHTTPMiddleware):
    """Équivalent de helmet : en-têtes de durcissement sur toutes les réponses."""

    async def dispatch(self, request: Request, call_next):
        res = await call_next(request)
        res.headers.setdefault("X-Content-Type-Options", "nosniff")
        res.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        res.headers.setdefault("Referrer-Policy", "no-referrer")
        res.headers.setdefault("Cross-Origin-Resource-Policy", "cross-origin")
        if get_settings().is_prod:
            res.headers.setdefault("Strict-Transport-Security", "max-age=15552000; includeSubDomains")
        return res


class CsrfOrigin(BaseHTTPMiddleware):
    """Un navigateur envoie toujours Origin sur une requête mutante ; on refuse une origine étrangère."""

    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin")
        if (request.method not in ("GET", "HEAD", "OPTIONS") and origin and origin != get_settings().app_url
                and not request.url.path.startswith("/api/payments/webhook")):
            return JSONResponse({"error": {"code": "CSRF_ORIGIN", "message": "CSRF_ORIGIN"}}, status_code=403)
        return await call_next(request)


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with session_maker()() as db:
        await plan_config.ensure_defaults(db)
        await promptsvc.ensure_defaults(db)
        await icebreakers.ensure_defaults(db)
        await dailyqsvc.ensure_defaults(db)
        await broadcastsvc.reset_stuck(db)
    # Expiration horaire des abonnements : hors tests (les tests appellent la logique directement).
    task = None if get_settings().node_env == "test" else asyncio.create_task(payments.expiry_loop(session_maker()))
    dates_task = None if get_settings().node_env == "test" else asyncio.create_task(datesvc.reminder_loop(session_maker()))
    purge_task = None if get_settings().node_env == "test" else asyncio.create_task(maintenance.purge_loop(session_maker()))
    calls_task = None if get_settings().node_env == "test" else asyncio.create_task(callsvc.sweep_loop(session_maker()))
    speed_task = None if get_settings().node_env == "test" else asyncio.create_task(speedsvc.sweep_loop(session_maker()))
    broadcast_task = None if get_settings().node_env == "test" else asyncio.create_task(broadcastsvc.sweep_loop(session_maker()))
    migrate_task = None if get_settings().node_env == "test" else asyncio.create_task(storage.auto_migrate_loop())
    backup_task = None if get_settings().node_env == "test" else asyncio.create_task(backups.first_backup_loop())
    yield
    for tk in (task, dates_task, purge_task, calls_task, speed_task, broadcast_task, migrate_task, backup_task):
        if tk:
            tk.cancel()
    await dispose()


def create_fastapi() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="Crushduo API", version="0.2.0", lifespan=lifespan,
        description="API REST de Crushduo. Authentification par cookie de session httpOnly `duomatch_sid`.",
        docs_url=None if s.is_prod else "/api/docs", redoc_url=None, openapi_url=None if s.is_prod else "/api/openapi.json",
        dependencies=[Depends(global_limit)],
    )
    install_error_handlers(app)
    app.add_middleware(CsrfOrigin)
    app.add_middleware(SecurityHeaders)
    app.add_middleware(CORSMiddleware, allow_origins=[s.app_url], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

    @app.get("/api/health", tags=["health"])
    async def health(db: AsyncSession = Depends(get_db)):
        await db.execute(text("SELECT 1"))
        from app.core.ids import utcnow

        return {"status": "ok", "time": jsonfmt.iso(utcnow())}

    @app.get("/api/dev/outbox", tags=["dev"])
    async def outbox():
        """Boîte d'envoi des e-mails de développement : indisponible en production."""
        if s.is_prod:
            from app.core.errors import AppError

            raise AppError(404, "NOT_FOUND", "Not found")
        return mail.outbox

    for name in ROUTERS:
        try:
            mod = importlib.import_module(f"app.api.{name}")
        except ModuleNotFoundError as e:
            if e.name != f"app.api.{name}":
                raise
            log.warning("routeur %s absent (non porté)", name)
            continue
        app.include_router(mod.router, prefix="/api")
    return app


def create_app() -> socketio.ASGIApp:
    """Application ASGI complète : FastAPI + Socket.IO (même chemin /socket.io que l'ancienne passerelle)."""
    return socketio.ASGIApp(realtime.sio, other_asgi_app=create_fastapi(), socketio_path="socket.io")


app = create_app()

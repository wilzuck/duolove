"""Mesure d'audience maison (voir core/audience.py) : appel public par page vue, et tableau de bord de l'administration."""
import logging
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, resolve_period
from app.core import audience
from app.core.auth import AuthUser
from app.core.config import get_settings
from app.core.geo import country_from_headers
from app.core.ids import utcnow
from app.core.ratelimit import client_ip, limit
from app.db.session import get_db

log = logging.getLogger(__name__)
router = APIRouter(tags=["audience"])


class HitIn(BaseModel):
    path: str = Field(max_length=300)
    landing: bool = False
    ref: str | None = Field(None, max_length=500)
    utm: str | None = Field(None, max_length=80)


@router.post("/audience/hit", status_code=204, dependencies=[limit(120, 60)])
async def hit(body: HitIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Une page publique vue. Toujours 204, même ignorée (robot, page non mesurée, préchargement) : rien à afficher au visiteur."""
    ua = request.headers.get("user-agent") or ""
    page = audience.normalize_path(body.path)
    prefetch = (request.headers.get("sec-purpose") or request.headers.get("purpose") or "").startswith("prefetch")
    if page and not prefetch and not audience.is_bot(ua):
        try:
            own = (urlsplit(get_settings().app_url).hostname or "").removeprefix("www.")
            source = audience.source_of(body.ref, body.utm, own) if body.landing else None
            await audience.record(db, path=page[0], lang=page[1], source=source, ua=ua[:400], ip=client_ip(request),
                                  country=country_from_headers(request.headers), now=utcnow())
        except Exception:  # la mesure ne doit jamais gêner la navigation
            log.exception("mesure d'audience")
            await db.rollback()
    return Response(status_code=204)


@router.get("/admin/audience")
async def report(days: int = Query(30), date_from: str | None = Query(None, alias="from"), date_to: str | None = Query(None, alias="to"),
                 _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    n, start = resolve_period(days, date_from, date_to, (7, 30, 90, 180, 365), utcnow())
    return await audience.report(db, n, start.date())

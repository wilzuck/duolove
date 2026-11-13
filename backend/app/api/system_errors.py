"""Erreurs système : signalement par le site (public, limité) et suivi par l'administration (ADMIN)."""
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, audit
from app.core import errortrack
from app.core.auth import AuthUser
from app.core.errors import not_found
from app.core.ids import utcnow
from app.core.ratelimit import limit
from app.db.session import get_db
from app.models.models import SystemError as SysError

router = APIRouter(tags=["errors"])


class ReportIn(BaseModel):
    source: Literal["web", "web-server"] = "web"
    kind: str = Field("Error", max_length=120)
    message: str = Field(..., min_length=1, max_length=2000)
    path: str | None = Field(None, max_length=2000)
    stack: str | None = Field(None, max_length=20000)
    digest: str | None = Field(None, max_length=64)


@router.post("/errors/report", status_code=204, dependencies=[limit(30, 60, scope="error-report")])
async def report(body: ReportIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Erreur survenue dans le site (navigateur ou rendu serveur). Aucune donnée de formulaire ni cookie : message, endroit, trace."""
    msg = body.message + (f" (digest {body.digest})" if body.digest else "")
    await errortrack.record(db, source=body.source, kind=body.kind, message=msg, path=body.path, stack=body.stack,
                            user_agent=request.headers.get("user-agent"))
    return Response(status_code=204)


@router.get("/admin/errors")
async def list_errors(status: Literal["open", "resolved", "all"] = "open", source: str | None = None, q: str | None = Query(None, max_length=100),
                      _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    stmt = select(SysError)
    if status == "open":
        stmt = stmt.where(SysError.resolvedAt.is_(None))
    elif status == "resolved":
        stmt = stmt.where(SysError.resolvedAt.is_not(None))
    if source in errortrack.SOURCES:
        stmt = stmt.where(SysError.source == source)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(SysError.message.ilike(like), SysError.kind.ilike(like), SysError.path.ilike(like)))
    rows = (await db.execute(stmt.order_by(desc(SysError.lastSeenAt)).limit(300))).scalars().all()
    counts = dict((await db.execute(select(SysError.source, func.count()).where(SysError.resolvedAt.is_(None)).group_by(SysError.source))).all())
    return {"items": [errortrack.view(r) for r in rows], "openBySource": counts, "open": sum(counts.values())}


@router.get("/admin/errors/{error_id}")
async def get_error(error_id: str, _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    r = await db.get(SysError, error_id)
    if not r:
        raise not_found("ERROR_NOT_FOUND")
    return errortrack.view(r, full=True)


class ResolveIn(BaseModel):
    note: str | None = Field(None, max_length=1000)


@router.post("/admin/errors/{error_id}/resolve")
async def resolve(error_id: str, body: ResolveIn, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    r = await db.get(SysError, error_id)
    if not r:
        raise not_found("ERROR_NOT_FOUND")
    r.resolvedAt, r.resolvedById, r.regressed = utcnow(), a.id, False
    if body.note is not None:
        r.note = body.note.strip() or None
    await db.commit()
    await audit(db, a.id, "errors.resolve", "SystemError", r.id, {"kind": r.kind})
    return errortrack.view(r, full=True)


@router.post("/admin/errors/{error_id}/reopen")
async def reopen(error_id: str, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    r = await db.get(SysError, error_id)
    if not r:
        raise not_found("ERROR_NOT_FOUND")
    r.resolvedAt, r.resolvedById = None, None
    await db.commit()
    await audit(db, a.id, "errors.reopen", "SystemError", r.id, {"kind": r.kind})
    return errortrack.view(r, full=True)


@router.delete("/admin/errors/{error_id}", status_code=204)
async def remove(error_id: str, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    r = await db.get(SysError, error_id)
    if not r:
        raise not_found("ERROR_NOT_FOUND")
    await db.delete(r)
    await db.commit()
    await audit(db, a.id, "errors.delete", "SystemError", error_id, {})
    return Response(status_code=204)

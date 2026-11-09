"""Newsletter (abonnement public et membre, envois rédigés par l'administration) et suivi des e-mails envoyés (ADMIN)."""
from __future__ import annotations

import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
import re

from pydantic import BaseModel, StringConstraints, field_validator
from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, DAY, after_cursor, audit, iso, page, paged
from app.core import mail, newslettersvc
from app.core.auth import AuthUser, current_user
from app.core.errors import bad_request, not_found
from app.core.ids import utcnow
from app.core.ratelimit import limit
from app.db.session import get_db
from app.models.models import EmailLog, NewsletterCampaign, NewsletterSubscriber

router = APIRouter(tags=["newsletter"])
Trim = lambda lo, hi: Annotated[str, StringConstraints(strip_whitespace=True, min_length=lo, max_length=hi)]  # noqa: E731


_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SubscribeIn(BaseModel):
    email: Trim(5, 254)
    website: str | None = None  # piège à robots : doit rester vide

    @field_validator("email")
    @classmethod
    def valid_email(cls, v):
        if not _EMAIL.match(v):
            raise ValueError("Adresse e-mail invalide")
        return v


class MeIn(BaseModel):
    subscribed: bool


class CampaignIn(BaseModel):
    subject: Trim(3, 150)
    preheader: Trim(0, 200) = ""
    body: Trim(10, 20000)
    ctaLabel: Trim(0, 60) | None = None
    ctaUrl: Trim(0, 500) | None = None

    @field_validator("ctaUrl")
    @classmethod
    def https_only(cls, v):
        if v and not v.lower().startswith(("https://", "http://localhost")):
            raise ValueError("Le lien doit commencer par https://")
        return v or None


# ── Public et membre ────────────────────────────────────────────────────────────────────────────────────────────────────────

@router.post("/newsletter/subscribe", status_code=202, dependencies=[limit(5, 3600)])
async def subscribe(body: SubscribeIn, db: AsyncSession = Depends(get_db)):
    if not body.website:
        await newslettersvc.subscribe(db, body.email)
    return {"ok": True}  # même réponse que l'adresse soit déjà connue ou non


@router.post("/newsletter/confirm", dependencies=[limit(20, 3600)])
async def confirm(token: str = Query(min_length=10, max_length=100), db: AsyncSession = Depends(get_db)):
    if not await newslettersvc.confirm(db, token):
        raise not_found("NEWSLETTER_LINK_INVALID")
    return {"ok": True}


@router.post("/newsletter/unsubscribe", dependencies=[limit(30, 3600)])
async def unsubscribe(token: str = Query(min_length=4, max_length=100), db: AsyncSession = Depends(get_db)):
    """Accepte aussi le POST « un clic » envoyé par les clients mail (en-tête List-Unsubscribe-Post)."""
    if token != "test" and not await newslettersvc.unsubscribe(db, token):
        raise not_found("NEWSLETTER_LINK_INVALID")
    return {"ok": True}


@router.get("/newsletter/me")
async def my_status(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return {"subscribed": await newslettersvc.member_subscribed(db, u.email)}


@router.put("/newsletter/me")
async def set_my_status(body: MeIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await newslettersvc.set_member(db, u.id, u.email, body.subscribed)
    return {"subscribed": body.subscribed}


# ── Administration : envois ─────────────────────────────────────────────────────────────────────────────────────────────────

def _campaign(c: NewsletterCampaign) -> dict:
    return {"id": c.id, "subject": c.subject, "preheader": c.preheader, "body": c.body, "ctaLabel": c.ctaLabel, "ctaUrl": c.ctaUrl, "status": c.status,
            "recipients": c.recipients, "sent": c.sent, "failed": c.failed, "createdAt": iso(c.createdAt), "sentAt": iso(c.sentAt)}


@router.get("/admin/newsletter")
async def overview(cursor: str | None = None, limit: str | None = None, _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    take = page(limit)
    stmt = await after_cursor(db, select(NewsletterCampaign).order_by(NewsletterCampaign.createdAt.desc(), NewsletterCampaign.id.desc()), NewsletterCampaign, cursor)
    rows = (await db.execute(stmt.limit(take + 1))).scalars().all()
    out = paged(rows, take, [_campaign(c) for c in rows[:take]])
    out["subscribers"] = await newslettersvc.counts(db)
    return out


async def _draft(db: AsyncSession, campaign_id: str) -> NewsletterCampaign:
    c = await db.get(NewsletterCampaign, campaign_id)
    if not c:
        raise not_found("CAMPAIGN_NOT_FOUND")
    return c


@router.post("/admin/newsletter", status_code=201)
async def create(body: CampaignIn, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    c = NewsletterCampaign(subject=body.subject, preheader=body.preheader, body=body.body, ctaLabel=body.ctaLabel or None, ctaUrl=body.ctaUrl, createdById=a.id)
    db.add(c)
    await db.commit()
    await audit(db, a.id, "newsletter.create", "NewsletterCampaign", c.id)
    return _campaign(c)


@router.put("/admin/newsletter/{campaign_id}")
async def update(campaign_id: str, body: CampaignIn, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    c = await _draft(db, campaign_id)
    if c.status != "DRAFT":
        raise bad_request("CAMPAIGN_NOT_DRAFT", "Un envoi déjà lancé ne peut plus être modifié.")
    c.subject, c.preheader, c.body, c.ctaLabel, c.ctaUrl = body.subject, body.preheader, body.body, body.ctaLabel or None, body.ctaUrl
    await db.commit()
    return _campaign(c)


@router.delete("/admin/newsletter/{campaign_id}")
async def remove(campaign_id: str, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    c = await _draft(db, campaign_id)
    if c.status != "DRAFT":
        raise bad_request("CAMPAIGN_NOT_DRAFT", "Un envoi déjà lancé ne peut pas être supprimé.")
    await db.execute(delete(NewsletterCampaign).where(NewsletterCampaign.id == campaign_id))
    await db.commit()
    await audit(db, a.id, "newsletter.delete", "NewsletterCampaign", campaign_id)
    return {"ok": True}


@router.post("/admin/newsletter/{campaign_id}/test")
async def send_test(campaign_id: str, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Envoie l'e-mail à l'administrateur qui le demande, pour relire le rendu avant la diffusion."""
    ok = await newslettersvc.send_test(await _draft(db, campaign_id), a.email)
    return {"ok": ok, "to": a.email}


@router.post("/admin/newsletter/{campaign_id}/send", status_code=202)
async def send(campaign_id: str, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    await _draft(db, campaign_id)
    total = await newslettersvc.start(db, campaign_id)
    await audit(db, a.id, "newsletter.send", "NewsletterCampaign", campaign_id, {"recipients": total})
    return {"ok": True, "recipients": total}


# ── Administration : suivi des e-mails ──────────────────────────────────────────────────────────────────────────────────────

def _log(e: EmailLog) -> dict:
    return {"id": e.id, "to": e.toEmail, "subject": e.subject, "kind": e.kind, "status": e.status, "provider": e.provider, "error": e.error, "campaignId": e.campaignId, "createdAt": iso(e.createdAt)}


@router.get("/admin/emails")
async def email_log(status: str | None = None, kind: str | None = None, q: str | None = None, cursor: str | None = None, limit: str | None = None,
                    _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    take = page(limit)
    stmt = select(EmailLog).order_by(EmailLog.createdAt.desc(), EmailLog.id.desc())
    if status in ("SENT", "FAILED"):
        stmt = stmt.where(EmailLog.status == status)
    if kind:
        stmt = stmt.where(EmailLog.kind == kind)
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(EmailLog.toEmail).like(like), func.lower(EmailLog.subject).like(like)))
    stmt = await after_cursor(db, stmt, EmailLog, cursor)
    rows = (await db.execute(stmt.limit(take + 1))).scalars().all()
    return paged(rows, take, [_log(e) for e in rows[:take]])


@router.get("/admin/emails/stats")
async def email_stats(days: int = Query(30), _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    days = days if days in (7, 30, 90) else 30
    now = utcnow()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0) - (days - 1) * DAY
    by_status = dict((await db.execute(select(EmailLog.status, func.count()).where(EmailLog.createdAt >= start).group_by(EmailLog.status))).all())
    by_kind = [{"kind": k, "sent": s, "failed": f} for k, s, f in (await db.execute(
        select(EmailLog.kind, func.count().filter(EmailLog.status == "SENT"), func.count().filter(EmailLog.status == "FAILED")).where(EmailLog.createdAt >= start).group_by(EmailLog.kind).order_by(func.count().desc())
    )).all()]
    rows = (await db.execute(text(
        "SELECT g::date AS day, COALESCE(c.s, 0)::bigint AS s, COALESCE(c.f, 0)::bigint AS f FROM generate_series(CAST(:start AS timestamp), CAST(:start AS timestamp) + (:d - 1) * interval '1 day', interval '1 day') g "
        "LEFT JOIN (SELECT date_trunc('day', \"createdAt\") AS d, COUNT(*) FILTER (WHERE status = 'SENT') AS s, COUNT(*) FILTER (WHERE status = 'FAILED') AS f FROM \"EmailLog\" WHERE \"createdAt\" >= CAST(:start AS timestamp) GROUP BY 1) c ON c.d = g ORDER BY 1"),
        {"d": days, "start": start})).all()
    last_fail = (await db.execute(select(EmailLog).where(EmailLog.status == "FAILED").order_by(EmailLog.createdAt.desc()).limit(1))).scalar_one_or_none()
    sent, failed = by_status.get("SENT", 0), by_status.get("FAILED", 0)
    return {"days": days, "provider": mail.provider_name(), "sent": sent, "failed": failed, "successRate": round(sent / (sent + failed) * 1000) / 10 if sent + failed else None,
            "byKind": by_kind, "series": {"sent": [{"day": r.day.isoformat(), "value": int(r.s)} for r in rows], "failed": [{"day": r.day.isoformat(), "value": int(r.f)} for r in rows]},
            "lastFailure": _log(last_fail) if last_fail else None, "generatedAt": now}

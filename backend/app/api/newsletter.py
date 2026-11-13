"""Newsletter (abonnement public et membre, envois rédigés par l'administration) et suivi des e-mails envoyés (ADMIN)."""
from __future__ import annotations

import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
import re

from pydantic import BaseModel, StringConstraints, field_validator
from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, DAY, SUP, after_cursor, audit, iso, page, paged, resolve_period
from app.core import mail, mail_config, newslettersvc
from app.core.auth import AuthUser, current_user
from app.core.errors import bad_request, not_found
from app.core.ids import utcnow
from app.core.ratelimit import limit
from app.db.session import get_db
from app.models.models import EmailLog, EmailSuppression, NewsletterCampaign, NewsletterSubscriber, SystemSetting

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
    if status in ("SENT", "FAILED", "SKIPPED"):
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
async def email_stats(days: int = Query(30), date_from: str | None = Query(None, alias="from"), date_to: str | None = Query(None, alias="to"), _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    now = utcnow()
    days, start = resolve_period(days, date_from, date_to, (7, 30, 90), now)
    end = start + days * DAY
    by_status = dict((await db.execute(select(EmailLog.status, func.count()).where(EmailLog.createdAt >= start, EmailLog.createdAt < end).group_by(EmailLog.status))).all())
    by_kind = [{"kind": k, "sent": s, "failed": f} for k, s, f in (await db.execute(
        select(EmailLog.kind, func.count().filter(EmailLog.status == "SENT"), func.count().filter(EmailLog.status == "FAILED")).where(EmailLog.createdAt >= start, EmailLog.createdAt < end).group_by(EmailLog.kind).order_by(func.count().desc())
    )).all()]
    rows = (await db.execute(text(
        "SELECT g::date AS day, COALESCE(c.s, 0)::bigint AS s, COALESCE(c.f, 0)::bigint AS f FROM generate_series(CAST(:start AS timestamp), CAST(:start AS timestamp) + (:d - 1) * interval '1 day', interval '1 day') g "
        "LEFT JOIN (SELECT date_trunc('day', \"createdAt\") AS d, COUNT(*) FILTER (WHERE status = 'SENT') AS s, COUNT(*) FILTER (WHERE status = 'FAILED') AS f FROM \"EmailLog\" WHERE \"createdAt\" >= CAST(:start AS timestamp) AND \"createdAt\" < CAST(:end AS timestamp) GROUP BY 1) c ON c.d = g ORDER BY 1"),
        {"d": days, "start": start, "end": end})).all()
    last_fail = (await db.execute(select(EmailLog).where(EmailLog.status == "FAILED").order_by(EmailLog.createdAt.desc()).limit(1))).scalar_one_or_none()
    sent, failed = by_status.get("SENT", 0), by_status.get("FAILED", 0)
    return {"days": days, "from": start.date().isoformat(), "to": (end - DAY).date().isoformat(), "provider": await mail.provider_name(), "sent": sent, "failed": failed, "successRate": round(sent / (sent + failed) * 1000) / 10 if sent + failed else None,
            "byKind": by_kind, "series": {"sent": [{"day": r.day.isoformat(), "value": int(r.s)} for r in rows], "failed": [{"day": r.day.isoformat(), "value": int(r.f)} for r in rows]},
            "lastFailure": _log(last_fail) if last_fail else None, "generatedAt": now}


@router.get("/admin/emails/suppressions")
async def suppressions(q: str | None = None, _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Adresses bloquées après un rebond définitif ou une plainte (retours d'Amazon SES) : les 200 plus récentes et le total par motif."""
    stmt = select(EmailSuppression).order_by(EmailSuppression.createdAt.desc())
    if q and q.strip():
        stmt = stmt.where(func.lower(EmailSuppression.email).like(f"%{q.strip().lower()}%"))
    rows = (await db.execute(stmt.limit(200))).scalars().all()
    totals = dict((await db.execute(select(EmailSuppression.reason, func.count()).group_by(EmailSuppression.reason))).all())
    return {"items": [{"id": r.id, "email": r.email, "reason": r.reason, "detail": r.detail, "createdAt": iso(r.createdAt)} for r in rows],
            "totals": {"BOUNCE": totals.get("BOUNCE", 0), "COMPLAINT": totals.get("COMPLAINT", 0)}}


@router.delete("/admin/emails/suppressions/{suppression_id}")
async def unsuppress(suppression_id: str, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Débloque une adresse (ex. rebond dû à une erreur de frappe corrigée depuis). À utiliser avec prudence : renvoyer à une adresse en rebond nuit à la réputation."""
    row = await db.get(EmailSuppression, suppression_id)
    if row is None:
        raise not_found("SUPPRESSION_NOT_FOUND", "Adresse introuvable.")
    await db.execute(delete(EmailSuppression).where(EmailSuppression.id == suppression_id))
    await db.commit()
    await audit(db, a.id, "email.unsuppress", "EmailSuppression", suppression_id, {"email": row.email, "reason": row.reason})
    return {"ok": True}


# ── Administration : fournisseur d'envoi (Brevo ou SMTP, par exemple Amazon SES) ───────────────────────────────────────────

class ProviderIn(BaseModel):
    provider: str


async def _provider_view() -> dict:
    ch = await mail_config.choice()
    return {"choice": ch, "active": mail_config.resolve(ch), "configured": mail_config.configured(), "essentialOnly": await mail_config.essential_only()}


@router.get("/admin/emails/provider")
async def provider_get(_: AuthUser = ADM):
    return await _provider_view()


@router.put("/admin/emails/provider")
async def provider_set(body: ProviderIn, a: AuthUser = SUP, db: AsyncSession = Depends(get_db)):
    """Choisit le fournisseur d'envoi (réservé au super-administrateur). Les identifiants restent dans les variables du serveur : rien de secret n'est stocké ici."""
    if body.provider not in mail_config.CHOICES:
        raise bad_request("INVALID_PROVIDER", "Fournisseur inconnu : auto, brevo, zeptomail ou smtp.")
    ok = mail_config.configured()
    if body.provider in ("brevo", "smtp") and not ok[body.provider]:
        raise bad_request("PROVIDER_NOT_CONFIGURED", "Ce fournisseur n'est pas configuré sur le serveur (variable manquante).")
    before = await mail_config.choice()
    row = await db.get(SystemSetting, mail_config.KEY)
    if row:
        row.value = {"provider": body.provider}
    else:
        db.add(SystemSetting(key=mail_config.KEY, value={"provider": body.provider}))
    await db.commit()
    mail_config.invalidate()
    await audit(db, a.id, "email.provider", "SystemSetting", mail_config.KEY, {"before": before, "after": body.provider})
    return await _provider_view()


class EssentialIn(BaseModel):
    enabled: bool


@router.put("/admin/emails/essential-only")
async def essential_only_set(body: EssentialIn, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """« E-mails essentiels uniquement » : seuls partent les e-mails d'accès au compte, de sécurité et de paiement (quota à préserver)."""
    row = await db.get(SystemSetting, mail_config.ESSENTIAL_KEY)
    if row:
        row.value = {"enabled": body.enabled}
    else:
        db.add(SystemSetting(key=mail_config.ESSENTIAL_KEY, value={"enabled": body.enabled}))
    await db.commit()
    mail_config.invalidate_essential()
    await audit(db, a.id, "email.essential_only", "SystemSetting", mail_config.ESSENTIAL_KEY, {"enabled": body.enabled})
    return await _provider_view()


@router.post("/admin/emails/provider/test", dependencies=[limit(10, 3600)])
async def provider_test(a: AuthUser = ADM):
    """Envoie un e-mail de test à l'administrateur qui le demande, par le fournisseur actif : sert à vérifier un changement avant de s'y fier."""
    prov = await mail_config.active()
    ok = await mail.send(a.email, "Test d'envoi — Crushduo", f"Cet e-mail confirme que l'envoi fonctionne (fournisseur : {prov}).", kind="admin_test")
    return {"ok": ok, "provider": prov, "to": a.email}

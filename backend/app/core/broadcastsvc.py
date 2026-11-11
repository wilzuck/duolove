"""Envois de l'administration : public ciblé (tous, tous sauf…, personnes choisies, par profil, adresses libres), canaux (e-mail, annonce dans l'application),
envoi immédiat ou planifié, variables {{prénom}} et {{ville}}, signature.

Règles de consentement : un envoi « promotion / actualités » (MARKETING) n'atteint que les membres qui ont accepté de les recevoir ; un envoi « information du service »
(SERVICE) atteint tous les membres actifs. Les adresses bloquées (rebond, plainte) sont toujours exclues. Les adresses libres (non membres) ne reçoivent que du SERVICE.
Chaque e-mail de membre contient un lien de désabonnement en un clic (coupe aussi les e-mails promotionnels)."""
from __future__ import annotations

import asyncio
import datetime
import logging
import re
from dataclasses import dataclass

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import mail, mdmail, notifications, realtime
from app.core.config import get_settings
from app.core.email_templates import esc, note, render_email
from app.core.errors import bad_request
from app.core.ids import utcnow
from app.db.session import session_maker
from app.models.models import Broadcast, Entitlement, EmailSuppression, Notification, Profile, User

log = logging.getLogger("broadcast")
MODES = ("ALL", "EXCEPT", "SPECIFIC", "PROFILE", "FREE")
CHANNELS = ("EMAIL", "APP", "BOTH")
KINDS = ("SERVICE", "MARKETING")
MAX_RECIPIENTS = 50_000
MAX_EMAILS = 2000
PAUSE = 0.05  # secondes entre deux e-mails : ménage les limites du fournisseur
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
VARS = ("prénom", "ville")


@dataclass
class Recipient:
    email: str
    name: str = ""
    city: str = ""
    user_id: str | None = None


def clean_audience(mode: str, audience: dict) -> dict:
    """Paramètres de ciblage normalisés (adresses en minuscules et dédoublonnées, filtres connus seulement)."""
    if mode not in MODES:
        raise bad_request("INVALID_AUDIENCE", "Public inconnu")
    emails = []
    for e in (audience.get("emails") or []):
        e = str(e).strip().lower()
        if e and e not in emails:
            if not EMAIL_RE.match(e):
                raise bad_request("INVALID_EMAIL", f"Adresse invalide : {e[:80]}", {"email": e[:80]})
            emails.append(e)
    if len(emails) > MAX_EMAILS:
        raise bad_request("TOO_MANY_EMAILS", f"{MAX_EMAILS} adresses au plus")
    out: dict = {}
    if mode in ("EXCEPT", "FREE", "SPECIFIC"):
        out["emails"] = emails
    if mode == "SPECIFIC":
        out["userIds"] = [str(i) for i in (audience.get("userIds") or [])][:500]
    if mode in ("FREE", "EXCEPT") and not emails and mode == "FREE":
        raise bad_request("NO_EMAILS", "Saisissez au moins une adresse")
    if mode == "PROFILE":
        f = audience.get("filters") or {}
        out["filters"] = {k: f[k] for k in ("gender", "country", "plan", "verified", "intent", "activeDays") if f.get(k) not in (None, "")}
    return out


def _base(kind: str):
    stmt = select(User.id, User.email, Profile.displayName, Profile.city).join(Profile, Profile.userId == User.id, isouter=True).where(
        User.status == "ACTIVE", User.emailVerifiedAt.is_not(None),
        ~select(EmailSuppression.id).where(EmailSuppression.email == User.email).exists())
    return stmt.where(User.marketingConsent.is_(True)) if kind == "MARKETING" else stmt


async def audience(db: AsyncSession, mode: str, params: dict, kind: str) -> list[Recipient]:
    """Destinataires effectifs (après consentement et adresses bloquées), triés par adresse. L'appelant a nettoyé `params` avec `clean_audience`."""
    if mode == "FREE":
        if kind == "MARKETING":
            raise bad_request("FREE_NEEDS_SERVICE", "Les adresses libres ne peuvent recevoir que des informations du service (pas de promotion sans consentement)")
        blocked = set((await db.execute(select(EmailSuppression.email).where(EmailSuppression.email.in_(params.get("emails", []))))).scalars())
        return [Recipient(e) for e in params.get("emails", []) if e not in blocked]
    stmt = _base(kind)
    if mode == "EXCEPT" and params.get("emails"):
        stmt = stmt.where(User.email.not_in(params["emails"]))
    elif mode == "SPECIFIC":
        from sqlalchemy import or_
        stmt = stmt.where(or_(User.id.in_(params.get("userIds") or [""]), User.email.in_(params.get("emails") or [""])))
    elif mode == "PROFILE":
        f = params.get("filters", {})
        conds = []
        if f.get("gender"):
            conds.append(Profile.gender == f["gender"])
        if f.get("country"):
            conds.append(Profile.country == f["country"])
        if f.get("intent"):
            conds.append(Profile.intent == f["intent"])
        if f.get("verified") is not None:
            conds.append(Profile.verified.is_(bool(f["verified"])))
        if f.get("activeDays"):
            conds.append(User.lastActiveAt >= utcnow() - datetime.timedelta(days=int(f["activeDays"])))
        if f.get("plan"):
            conds.append(select(Entitlement.id).where(Entitlement.userId == User.id, Entitlement.plan == f["plan"]).exists())
        if conds:
            stmt = stmt.where(and_(*conds))
    rows = (await db.execute(stmt.order_by(User.email).limit(MAX_RECIPIENTS + 1))).all()
    if len(rows) > MAX_RECIPIENTS:
        raise bad_request("TOO_MANY_RECIPIENTS", f"Plus de {MAX_RECIPIENTS} destinataires : affinez le public")
    return [Recipient(r.email, r.displayName or "", r.city or "", r.id) for r in rows]


def _clean_value(v: str) -> str:
    return re.sub(r"[*\[\]()!<>\n\r]", "", v).strip()


def fill(text: str, r: Recipient) -> str:
    """Variables : {{prénom}} (premier mot du nom affiché) et {{ville}}. Valeur vide si inconnue ; les caractères Markdown de la valeur sont retirés."""
    first = _clean_value(r.name.split(" ")[0]) if r.name else ""
    return text.replace("{{prénom}}", first).replace("{{ville}}", _clean_value(r.city))


def _unsub_url(user_id: str) -> str:
    return f"{get_settings().app_url.rstrip('/')}/notifications-unsubscribe?token={notifications.unsub_token(user_id)}"


def render(b: Broadcast | dict, r: Recipient) -> tuple[str, str, str, dict]:
    """(objet, HTML, texte brut, en-têtes) pour un destinataire."""
    g = (lambda k: getattr(b, k)) if not isinstance(b, dict) else b.__getitem__
    subject = fill(g("subject"), r).strip() or g("subject")
    body = fill(g("body"), r)
    signature = fill(g("signature") or "", r).strip()
    parts = mdmail.blocks(body) + ([mdmail.blocks(signature)[0].replace("margin:16px 0 0", "margin:28px 0 0")] if signature else [])
    unsub = _unsub_url(r.user_id) if r.user_id else None
    contact = f"{get_settings().app_url.rstrip('/')}/contact"
    if unsub:
        foot = f'<p style="margin:8px 0 0;font-size:13px;color:#45434F;text-align:center;">Vous recevez cet e-mail en tant que membre de Crushduo. <a href="{esc(unsub)}" style="color:#C2185B;">Ne plus recevoir ces e-mails</a>.</p>'
    else:
        foot = f'<p style="margin:8px 0 0;font-size:13px;color:#45434F;text-align:center;">Pour ne plus recevoir nos messages, <a href="{esc(contact)}" style="color:#C2185B;">écrivez-nous</a>.</p>'
    html = render_email(subject, parts, preheader=mdmail.plain(body)[:110], footer=foot)
    text = mdmail.plain(body) + (f"\n\n{mdmail.plain(signature)}" if signature else "") + (f"\n\n—\nNe plus recevoir ces e-mails : {unsub}" if unsub else f"\n\n—\nPour ne plus recevoir nos messages : {contact}")
    headers = {"List-Unsubscribe": f"<{unsub}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"} if unsub else {}
    return subject, html, text, headers


async def deliver(b: Broadcast, r: Recipient) -> bool:
    ok = False
    if b.channel in ("EMAIL", "BOTH"):
        subject, html, text, headers = render(b, r)
        ok = await mail.send(r.email, subject, text, html, kind="broadcast", campaign_id=b.id, headers=headers or None)
    if b.channel in ("APP", "BOTH") and r.user_id:
        async with session_maker()() as db:
            n = Notification(userId=r.user_id, type="ANNOUNCEMENT", data={"subject": fill(b.subject, r).strip() or b.subject, "excerpt": mdmail.plain(fill(b.body, r))[:240], "broadcastId": b.id})
            db.add(n)
            await db.commit()
            await realtime.emit_to_user(r.user_id, "notification:new", {"id": n.id, "type": "ANNOUNCEMENT", "createdAt": n.createdAt.isoformat() + "Z", "data": n.data})
        ok = True
    return ok


async def claim_due(db: AsyncSession, now: datetime.datetime | None = None) -> list[str]:
    """Passe à EN COURS (de façon atomique, une seule fois) les envois planifiés dont l'heure est venue ; retourne leurs identifiants."""
    now = now or utcnow()
    ids = list((await db.execute(select(Broadcast.id).where(Broadcast.status == "SCHEDULED", Broadcast.scheduledAt <= now).order_by(Broadcast.scheduledAt))).scalars())
    claimed = []
    for i in ids:
        res = await db.execute(update(Broadcast).where(Broadcast.id == i, Broadcast.status == "SCHEDULED").values(status="SENDING", startedAt=now))
        if res.rowcount:
            claimed.append(i)
    await db.commit()
    return claimed


async def run(broadcast_id: str) -> None:
    """Diffusion d'un envoi déjà passé à EN COURS : public calculé à l'instant de l'envoi, compteurs mis à jour par lots, statut final enregistré."""
    sent = failed = 0
    status, error = "SENT", None
    try:
        async with session_maker()() as db:
            b = await db.get(Broadcast, broadcast_id)
            people = await audience(db, b.audienceMode, b.audience, b.kind)
            await db.execute(update(Broadcast).where(Broadcast.id == broadcast_id).values(recipients=len(people)))
            await db.commit()
            db.expunge(b)
        for i, r in enumerate(people, 1):
            try:
                ok = await deliver(b, r)
            except Exception:  # noqa: BLE001 — un destinataire en échec n'arrête pas les autres
                log.exception("Envoi à un destinataire impossible (%s)", broadcast_id)
                ok = False
            sent, failed = sent + ok, failed + (not ok)
            if i % 10 == 0:
                async with session_maker()() as db:
                    await db.execute(update(Broadcast).where(Broadcast.id == broadcast_id).values(sent=sent, failed=failed))
                    await db.commit()
            if b.channel != "APP":
                await asyncio.sleep(PAUSE)
    except Exception as e:  # noqa: BLE001
        log.exception("Envoi interrompu (%s)", broadcast_id)
        status, error = "FAILED", str(e)[:500]
    async with session_maker()() as db:
        await db.execute(update(Broadcast).where(Broadcast.id == broadcast_id).values(sent=sent, failed=failed, status=status, error=error, sentAt=utcnow()))
        await db.commit()


async def sweep_loop(maker, every: float = 30.0) -> None:
    """Toutes les 30 s : lance les envois planifiés arrivés à échéance (une seule réplique de l'API)."""
    while True:
        try:
            async with maker() as db:
                for i in await claim_due(db):
                    asyncio.get_running_loop().create_task(run(i))
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("Balayage des envois planifiés")
        await asyncio.sleep(every)


async def reset_stuck(db: AsyncSession, older_than_minutes: int = 120) -> int:
    """Envois restés « en cours » après un redémarrage du serveur : marqués échoués (jamais relancés tout seuls : risque de doublons pour les destinataires)."""
    limit = utcnow() - datetime.timedelta(minutes=older_than_minutes)
    res = await db.execute(update(Broadcast).where(Broadcast.status == "SENDING", Broadcast.startedAt < limit).values(status="FAILED", error="Interrompu (redémarrage du serveur)", sentAt=utcnow()))
    await db.commit()
    return res.rowcount

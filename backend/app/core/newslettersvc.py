"""Newsletter : abonnés (membres ou visiteurs, double confirmation), rédaction d'un envoi par l'administration, envoi par lots avec suivi.

Consentement : un visiteur n'est abonné qu'après avoir cliqué le lien de confirmation reçu par e-mail ; un membre s'abonne lui-même dans ses réglages.
Chaque e-mail contient un lien de désabonnement en un clic (et l'en-tête List-Unsubscribe). Le suivi (envoyés / échecs) vient du journal EmailLog ;
les ouvertures et les clics ne sont pas mesurés (pas de pixel espion : respect de la vie privée)."""
import asyncio
import logging
import secrets

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import mail
from app.core.config import get_settings
from app.core.email_templates import button, esc, note, p, render_email
from app.core.errors import bad_request
from app.core.ids import utcnow
from app.db.session import session_maker
from app.models.models import NewsletterCampaign, NewsletterSubscriber

log = logging.getLogger("newsletter")
PAUSE = 0.05  # secondes entre deux envois : ménage les limites du fournisseur


def norm(email: str) -> str:
    return email.strip().lower()


def _token() -> str:
    return secrets.token_urlsafe(24)


async def subscribe(db: AsyncSession, email: str, *, user_id: str | None = None, source: str = "site") -> None:
    """Membre connecté : abonné tout de suite. Visiteur : en attente jusqu'au clic de confirmation (double opt-in). Ne révèle jamais si l'adresse existait déjà."""
    email, now = norm(email), utcnow()
    row = (await db.execute(select(NewsletterSubscriber).where(NewsletterSubscriber.email == email))).scalar_one_or_none()
    if row is None:
        row = NewsletterSubscriber(email=email, token=_token(), source=source, userId=user_id)
        db.add(row)
    if user_id:
        row.userId, row.status, row.confirmedAt, row.unsubscribedAt = user_id, "ACTIVE", row.confirmedAt or now, None
        await db.commit()
        return
    if row.status == "ACTIVE":
        return
    row.status = "PENDING"
    await db.commit()
    url = f"{get_settings().app_url}/newsletter/confirm?token={row.token}"
    html = render_email("Confirmez votre inscription à la newsletter", [p("Un dernier clic pour recevoir les nouveautés de CrushDuo."), button("Confirmer mon inscription", url),
                                                                       note("Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : vous ne recevrez rien.")], preheader="Confirmez votre inscription")
    await mail.send(email, "Confirmez votre inscription — CrushDuo", f"Pour confirmer votre inscription à la newsletter CrushDuo : {url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.", html, kind="newsletter_confirm")


async def confirm(db: AsyncSession, token: str) -> bool:
    res = await db.execute(update(NewsletterSubscriber).where(NewsletterSubscriber.token == token, NewsletterSubscriber.status != "UNSUBSCRIBED").values(status="ACTIVE", confirmedAt=utcnow()))
    await db.commit()
    return res.rowcount > 0


async def unsubscribe(db: AsyncSession, token: str) -> bool:
    res = await db.execute(update(NewsletterSubscriber).where(NewsletterSubscriber.token == token).values(status="UNSUBSCRIBED", unsubscribedAt=utcnow()))
    await db.commit()
    return res.rowcount > 0


async def member_subscribed(db: AsyncSession, email: str) -> bool:
    return (await db.execute(select(NewsletterSubscriber.status).where(NewsletterSubscriber.email == norm(email)))).scalar_one_or_none() == "ACTIVE"


async def set_member(db: AsyncSession, user_id: str, email: str, on: bool) -> None:
    if on:
        await subscribe(db, email, user_id=user_id, source="member")
    else:
        await db.execute(update(NewsletterSubscriber).where(NewsletterSubscriber.email == norm(email)).values(status="UNSUBSCRIBED", unsubscribedAt=utcnow()))
        await db.commit()


async def counts(db: AsyncSession) -> dict[str, int]:
    c = dict((await db.execute(select(NewsletterSubscriber.status, func.count()).group_by(NewsletterSubscriber.status))).all())
    return {k: c.get(k, 0) for k in ("ACTIVE", "PENDING", "UNSUBSCRIBED")}


def render_campaign(c: NewsletterCampaign, token: str) -> tuple[str, str, dict]:
    """(html, texte brut, en-têtes) d'un envoi pour un abonné donné."""
    app = get_settings().app_url.rstrip("/")
    unsub = f"{app}/newsletter/unsubscribe?token={token}"
    paras = [x.strip() for x in c.body.replace("\r\n", "\n").split("\n\n") if x.strip()]
    blocks = [p(esc(x).replace("\n", "<br>")) for x in paras]
    if c.ctaLabel and c.ctaUrl:
        blocks.append(button(c.ctaLabel, c.ctaUrl))
    footer = f'<p style="margin:8px 0 0;font-size:12px;color:#ffffff;text-align:center;">Vous recevez cet e-mail car vous êtes abonné(e) à la newsletter. <a href="{esc(unsub)}" style="color:#ffffff;text-decoration:underline;">Se désabonner</a></p>'
    html = render_email(c.subject, blocks, preheader=c.preheader or "", footer=footer)
    text = "\n\n".join(paras) + (f"\n\n{c.ctaLabel} : {c.ctaUrl}" if c.ctaLabel and c.ctaUrl else "") + f"\n\n—\nSe désabonner : {unsub}"
    return html, text, {"List-Unsubscribe": f"<{unsub}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}


async def send_test(c: NewsletterCampaign, to: str) -> bool:
    html, text, headers = render_campaign(c, "test")
    return await mail.send(to, f"[Test] {c.subject}", text, html, kind="newsletter_test", campaign_id=c.id, headers=headers)


async def start(db: AsyncSession, campaign_id: str) -> int:
    """Passe l'envoi de BROUILLON à EN COURS (une seule fois, de façon atomique) et lance la diffusion en tâche de fond. Retourne le nombre de destinataires."""
    total = (await db.execute(select(func.count()).select_from(NewsletterSubscriber).where(NewsletterSubscriber.status == "ACTIVE"))).scalar_one()
    if total == 0:
        raise bad_request("NO_SUBSCRIBERS", "Aucun abonné actif à qui envoyer.")
    res = await db.execute(update(NewsletterCampaign).where(NewsletterCampaign.id == campaign_id, NewsletterCampaign.status == "DRAFT").values(status="SENDING", recipients=total, sent=0, failed=0))
    await db.commit()
    if res.rowcount == 0:
        raise bad_request("CAMPAIGN_NOT_DRAFT", "Cet envoi a déjà été lancé.")
    asyncio.get_running_loop().create_task(run(campaign_id))
    return total


async def run(campaign_id: str) -> None:
    sent = failed = 0
    try:
        async with session_maker()() as db:
            c = await db.get(NewsletterCampaign, campaign_id)
            subs = (await db.execute(select(NewsletterSubscriber.email, NewsletterSubscriber.token).where(NewsletterSubscriber.status == "ACTIVE").order_by(NewsletterSubscriber.createdAt))).all()
            for email, token in subs:
                html, text, headers = render_campaign(c, token)
                ok = await mail.send(email, c.subject, text, html, kind="newsletter", campaign_id=campaign_id, headers=headers)
                sent, failed = sent + ok, failed + (not ok)
                if (sent + failed) % 10 == 0:
                    await db.execute(update(NewsletterCampaign).where(NewsletterCampaign.id == campaign_id).values(sent=sent, failed=failed))
                    await db.commit()
                await asyncio.sleep(PAUSE)
    except Exception:
        log.exception("Envoi de newsletter interrompu (%s)", campaign_id)
    finally:
        async with session_maker()() as db:
            await db.execute(update(NewsletterCampaign).where(NewsletterCampaign.id == campaign_id).values(sent=sent, failed=failed, status="SENT", sentAt=utcnow()))
            await db.commit()

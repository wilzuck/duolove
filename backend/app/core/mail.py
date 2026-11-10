"""E-mails : API HTTP Brevo si BREVO_API_KEY est défini, sinon SMTP si SMTP_URL est défini, sinon journal + boîte d'envoi mémoire (dev/tests uniquement)."""
import logging
from email.message import EmailMessage
from email.utils import parseaddr
from urllib.parse import unquote, urlsplit

import httpx

from app.core.config import get_settings
from app.core.email_templates import button, code_box, esc as esc_, note, p, render_email
from app.core.ids import utcnow

log = logging.getLogger("mail")
outbox: list[dict] = []


BREVO_URL = "https://api.brevo.com/v3/smtp/email"


def sender() -> tuple[str, str]:
    """(nom, adresse) tirés de MAIL_FROM. Tolère des guillemets saisis par erreur autour de toute la valeur dans Railway ;
    une adresse introuvable lève une erreur claire plutôt qu'un refus obscur du fournisseur."""
    raw = get_settings().mail_from.strip().strip("\"'").strip()
    name, addr = parseaddr(raw)
    if "@" not in addr:
        raise RuntimeError("MAIL_FROM invalide : attendu « CrushDuo <no-reply@votre-domaine> »")
    return name, addr


async def _send_brevo(to: str, subject: str, text: str, html: str | None = None, headers: dict | None = None) -> None:
    s = get_settings()
    name, addr = sender()
    who = {"email": addr, **({"name": name} if name else {})}
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(BREVO_URL, headers={"api-key": s.brevo_api_key or "", "accept": "application/json"},
                         json={"sender": who, "to": [{"email": to}], "subject": subject, "textContent": text, **({"htmlContent": html} if html else {}), **({"headers": headers} if headers else {})})
    if r.status_code >= 400:  # la clé n'est jamais journalisée ; le corps de Brevo dit pourquoi (expéditeur non validé, clé refusée…)
        raise RuntimeError(f"Brevo HTTP {r.status_code}: {r.text[:300]}")


async def _record(to: str, subject: str, kind: str, status: str, provider: str, error: str | None, campaign_id: str | None) -> None:
    """Une ligne de journal par envoi (jamais le contenu). Un échec d'écriture du journal ne doit rien casser."""
    try:
        from app.db.session import session_maker
        from app.models.models import EmailLog

        async with session_maker()() as db:
            db.add(EmailLog(toEmail=to, subject=subject[:200], kind=kind, status=status, provider=provider, error=(error or None) and error[:500], campaignId=campaign_id))
            await db.commit()
    except Exception:
        log.exception("Journal d'e-mail impossible")


async def _blocked(to: str, kind: str) -> str | None:
    """Raison du blocage de l'adresse, ou None. Si la base est injoignable on envoie quand même : mieux vaut un e-mail de trop qu'un code de connexion perdu."""
    try:
        from app.core import suppression
        from app.db.session import session_maker

        async with session_maker()() as db:
            return await suppression.blocked_reason(db, to, kind)
    except Exception:
        log.exception("Liste de blocage illisible")
        return None


def provider_name() -> str:
    s = get_settings()
    return "brevo" if s.brevo_api_key else "smtp" if s.smtp_url else "dev"


async def send(to: str, subject: str, text: str, html: str | None = None, *, kind: str = "other", campaign_id: str | None = None, headers: dict | None = None) -> bool:
    """Un échec d'envoi est journalisé sans jamais faire échouer l'inscription ou la connexion de l'utilisateur. Retourne True si l'envoi a réussi."""
    try:
        blocked = await _blocked(to, kind)
        if blocked:  # rebond définitif ou plainte : on n'écrit plus à cette adresse (protège la réputation de l'expéditeur)
            await _record(to, subject, kind, "SKIPPED", provider_name(), "Adresse bloquée : " + ("rebond définitif" if blocked == "BOUNCE" else "plainte pour spam"), campaign_id)
            return False
        sent = await _send(to, subject, text, html, headers)
        await _record(to, subject, kind, "SENT" if sent else "FAILED", provider_name(), None if sent else "Aucun fournisseur d'e-mail configuré en production", campaign_id)
        return sent
    except Exception as e:
        log.exception("Envoi d'e-mail impossible (%s)", subject)
        await _record(to, subject, kind, "FAILED", provider_name(), str(e), campaign_id)
        return False


async def _send(to: str, subject: str, text: str, html: str | None = None, headers: dict | None = None) -> bool:
    s = get_settings()
    if s.brevo_api_key:
        await _send_brevo(to, subject, text, html, headers)
        return True
    if s.smtp_url:
        import aiosmtplib

        u = urlsplit(s.smtp_url)
        msg = EmailMessage()
        name, addr = sender()
        msg["From"], msg["To"], msg["Subject"] = (f"{name} <{addr}>" if name else addr), to, subject
        for k, v in (headers or {}).items():
            msg[k] = v
        msg.set_content(text)
        if html:
            msg.add_alternative(html, subtype="html")
        await aiosmtplib.send(msg, hostname=u.hostname, port=u.port or 587, username=unquote(u.username) if u.username else None,
                              password=unquote(u.password) if u.password else None,
                              start_tls=u.scheme != "smtps", use_tls=u.scheme == "smtps")
        return True
    if s.is_prod:
        log.error("SMTP_URL non défini en production : e-mail non envoyé")
        return False
    outbox.append({"to": to, "subject": subject, "text": text, "html": html, "at": utcnow().isoformat() + "Z"})
    del outbox[:-50]
    log.info("[dev] e-mail à %s : %s", to, subject)
    return True


async def send_verification(to: str, name: str, token: str, code: str, minutes: int = 15) -> None:
    link = f"{get_settings().app_url}/verify-email?token={token}"
    html = render_email("Confirmez votre adresse e-mail", [
        p(f"Bonjour {esc_(name)}, bienvenue sur CrushDuo !"), p(f"Saisissez ce code dans l’application : il est valable {minutes} minutes."), code_box(code),
        p("Vous pouvez aussi confirmer en un clic :"), button("Confirmer mon adresse", link),
        note("Ne communiquez jamais ce code. Si vous n’êtes pas à l’origine de cette inscription, ignorez ce message : le compte sera supprimé automatiquement. Le lien est valable 24 h."),
    ], preheader=f"Votre code de confirmation : {code}")
    await send(to, "Votre code de confirmation — CrushDuo",
               f"Bonjour {name},\n\nBienvenue sur CrushDuo !\n\nVotre code de confirmation : {code}\n"
               f"Saisissez-le dans l'application (valable {minutes} minutes).\n\n"
               f"Vous pouvez aussi confirmer en un clic : {link} (lien valable 24 h).\n\n"
               "Ne communiquez jamais ce code. Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message : le compte sera supprimé automatiquement.", html, kind="verification")


async def send_password_reset(to: str, name: str, token: str) -> None:
    link = f"{get_settings().app_url}/reset-password?token={token}"
    html = render_email("Choisissez un nouveau mot de passe", [
        p(f"Bonjour {esc_(name)}, vous avez demandé à réinitialiser votre mot de passe."), button("Choisir un nouveau mot de passe", link),
        note("Lien valable 1 h. Si vous n’avez rien demandé, ignorez ce message : votre mot de passe reste inchangé."),
    ], preheader="Réinitialisation de votre mot de passe")
    await send(to, "Réinitialisation de votre mot de passe — CrushDuo",
               f"Bonjour {name},\n\nPour choisir un nouveau mot de passe : {link}\n\n"
               "Lien valable 1 h. Si vous n'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.", html, kind="password_reset")


async def send_magic_link(to: str, name: str, token: str, remember: bool = True) -> None:
    link = f"{get_settings().app_url}/magic-link?token={token}&remember={'1' if remember else '0'}"
    html = render_email("Votre lien de connexion", [
        p(f"Bonjour {esc_(name)}, voici votre lien pour vous connecter sans mot de passe."), button("Me connecter", link),
        note("Lien valable 15 minutes, utilisable une seule fois. Si vous n’avez rien demandé, ignorez ce message : personne ne peut se connecter sans lui."),
    ], preheader="Connexion à CrushDuo sans mot de passe")
    await send(to, "Votre lien de connexion — CrushDuo",
               f"Bonjour {name},\n\nPour vous connecter sans mot de passe : {link}\n\n"
               "Lien valable 15 minutes, utilisable une seule fois. Si vous n'avez rien demandé, ignorez ce message : personne ne peut se connecter sans lui.", html, kind="magic_link")


def notification_html(title: str, body: str, unsub_url: str | None = None) -> str:
    """E-mail de notification (message, match, like…) : même carte, bouton vers l'application et, si la notification est facultative, un lien de désabonnement."""
    footer = (f'<p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;font-size:12px;color:#ffffff;text-align:center;">'
              f'<a href="{esc_(unsub_url)}" style="color:#ffffff;text-decoration:underline;">Ne plus recevoir ces e-mails</a></p>') if unsub_url else ""
    return render_email(title, [p(esc_(body)), button("Ouvrir CrushDuo", get_settings().app_url),
                                note("Vous recevez ce message selon vos préférences de notification : vous pouvez les modifier dans Paramètres › Notifications.")], preheader=body, footer=footer)

"""E-mails : API HTTP Brevo si BREVO_API_KEY est défini, sinon SMTP si SMTP_URL est défini, sinon journal + boîte d'envoi mémoire (dev/tests uniquement)."""
import logging
from email.message import EmailMessage
from email.utils import parseaddr
from urllib.parse import unquote, urlsplit

import httpx

from app.core.config import get_settings
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
        raise RuntimeError("MAIL_FROM invalide : attendu « DuoMatch <no-reply@votre-domaine> »")
    return name, addr


async def _send_brevo(to: str, subject: str, text: str) -> None:
    s = get_settings()
    name, addr = sender()
    who = {"email": addr, **({"name": name} if name else {})}
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(BREVO_URL, headers={"api-key": s.brevo_api_key or "", "accept": "application/json"},
                         json={"sender": who, "to": [{"email": to}], "subject": subject, "textContent": text})
    if r.status_code >= 400:  # la clé n'est jamais journalisée ; le corps de Brevo dit pourquoi (expéditeur non validé, clé refusée…)
        raise RuntimeError(f"Brevo HTTP {r.status_code}: {r.text[:300]}")


async def send(to: str, subject: str, text: str) -> None:
    """Un échec d'envoi est journalisé sans jamais faire échouer l'inscription ou la connexion de l'utilisateur."""
    try:
        await _send(to, subject, text)
    except Exception:
        log.exception("Envoi d'e-mail impossible (%s)", subject)


async def _send(to: str, subject: str, text: str) -> None:
    s = get_settings()
    if s.brevo_api_key:
        await _send_brevo(to, subject, text)
        return
    if s.smtp_url:
        import aiosmtplib

        u = urlsplit(s.smtp_url)
        msg = EmailMessage()
        name, addr = sender()
        msg["From"], msg["To"], msg["Subject"] = (f"{name} <{addr}>" if name else addr), to, subject
        msg.set_content(text)
        await aiosmtplib.send(msg, hostname=u.hostname, port=u.port or 587, username=unquote(u.username) if u.username else None,
                              password=unquote(u.password) if u.password else None,
                              start_tls=u.scheme != "smtps", use_tls=u.scheme == "smtps")
        return
    if s.is_prod:
        log.error("SMTP_URL non défini en production : e-mail non envoyé")
        return
    outbox.append({"to": to, "subject": subject, "text": text, "at": utcnow().isoformat() + "Z"})
    del outbox[:-50]
    log.info("[dev] e-mail à %s : %s", to, subject)


async def send_verification(to: str, name: str, token: str, code: str, minutes: int = 15) -> None:
    await send(to, "Votre code de confirmation — DuoMatch",
               f"Bonjour {name},\n\nBienvenue sur DuoMatch !\n\nVotre code de confirmation : {code}\n"
               f"Saisissez-le dans l'application (valable {minutes} minutes).\n\n"
               f"Vous pouvez aussi confirmer en un clic : {get_settings().app_url}/verify-email?token={token} (lien valable 24 h).\n\n"
               "Ne communiquez jamais ce code. Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message : le compte sera supprimé automatiquement.")


async def send_password_reset(to: str, name: str, token: str) -> None:
    await send(to, "Réinitialisation de votre mot de passe — DuoMatch",
               f"Bonjour {name},\n\nPour choisir un nouveau mot de passe : {get_settings().app_url}/reset-password?token={token}\n\n"
               "Lien valable 1 h. Si vous n'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.")


async def send_magic_link(to: str, name: str, token: str, remember: bool = True) -> None:
    await send(to, "Votre lien de connexion — DuoMatch",
               f"Bonjour {name},\n\nPour vous connecter sans mot de passe : {get_settings().app_url}/magic-link?token={token}&remember={'1' if remember else '0'}\n\n"
               "Lien valable 15 minutes, utilisable une seule fois. Si vous n'avez rien demandé, ignorez ce message : personne ne peut se connecter sans lui.")

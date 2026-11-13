"""E-mails : API HTTP Brevo si BREVO_API_KEY est défini, sinon SMTP si SMTP_URL est défini, sinon journal + boîte d'envoi mémoire (dev/tests uniquement)."""
import datetime
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
        raise RuntimeError("MAIL_FROM invalide : attendu « Crushduo <no-reply@votre-domaine> »")
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


async def _send_zeptomail(to: str, subject: str, text: str, html: str | None = None, headers: dict | None = None) -> None:
    s = get_settings()
    name, addr = sender()
    token = (s.zeptomail_token or "").strip()
    auth = token if token.lower().startswith("zoho-enczapikey") else f"Zoho-enczapikey {token}"
    body = {"from": {"address": addr, **({"name": name} if name else {})}, "to": [{"email_address": {"address": to}}], "subject": subject,
            "textbody": text, **({"htmlbody": html} if html else {}), **({"mime_headers": headers} if headers else {})}
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(s.zeptomail_api.rstrip("/") + "/v1.1/email", headers={"Authorization": auth, "Accept": "application/json"}, json=body)
    if r.status_code >= 400:  # le jeton n'est jamais journalisé ; le corps de ZeptoMail dit pourquoi (domaine non vérifié, jeton refusé…)
        raise RuntimeError(f"ZeptoMail HTTP {r.status_code}: {r.text[:300]}")


def log_provider(provider: str) -> str:
    """Nom enregistré dans le journal : « ses » quand le SMTP pointe vers Amazon SES (le serveur finit par amazonaws.com), sinon « brevo », « smtp » ou « dev »."""
    if provider == "smtp":
        host = (urlsplit(get_settings().smtp_url or "").hostname or "").lower()
        if host.endswith(".amazonaws.com"):
            return "ses"
    return provider


async def _record(to: str, subject: str, kind: str, status: str, provider: str, error: str | None, campaign_id: str | None) -> None:
    """Une ligne de journal par envoi (jamais le contenu). Un échec d'écriture du journal ne doit rien casser."""
    try:
        from app.db.session import session_maker
        from app.models.models import EmailLog

        async with session_maker()() as db:
            db.add(EmailLog(toEmail=to, subject=subject[:200], kind=kind, status=status, provider=log_provider(provider), error=(error or None) and error[:500], campaignId=campaign_id))
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


async def provider_name() -> str:
    """Fournisseur actif : le choix de l'administration (voir mail_config), à défaut Brevo puis SMTP."""
    from app.core import mail_config

    return await mail_config.active()


async def send(to: str, subject: str, text: str, html: str | None = None, *, kind: str = "other", campaign_id: str | None = None, headers: dict | None = None) -> bool:
    """Un échec d'envoi est journalisé sans jamais faire échouer l'inscription ou la connexion de l'utilisateur. Retourne True si l'envoi a réussi."""
    try:
        from app.core import mail_config

        if not mail_config.is_essential(kind) and await mail_config.essential_only():  # quota à préserver : seuls les e-mails essentiels partent
            await _record(to, subject, kind, "SKIPPED", await provider_name(), "E-mails essentiels uniquement : envoi non essentiel suspendu", campaign_id)
            return False
        blocked = await _blocked(to, kind)
        if blocked:  # rebond définitif ou plainte : on n'écrit plus à cette adresse (protège la réputation de l'expéditeur)
            await _record(to, subject, kind, "SKIPPED", await provider_name(), "Adresse bloquée : " + ("rebond définitif" if blocked == "BOUNCE" else "plainte pour spam"), campaign_id)
            return False
        prov = mail_config.for_kind(await provider_name(), kind)
        if prov == "none":
            await _record(to, subject, kind, "FAILED", "zeptomail", "ZeptoMail n'accepte pas les envois marketing : configurez Brevo pour les newsletters et envois groupés", campaign_id)
            return False
        sent = await _send(to, subject, text, html, headers, prov)
        await _record(to, subject, kind, "SENT" if sent else "FAILED", prov, None if sent else "Aucun fournisseur d'e-mail configuré en production", campaign_id)
        return sent
    except Exception as e:
        log.exception("Envoi d'e-mail impossible (%s)", subject)
        await _record(to, subject, kind, "FAILED", await provider_name(), str(e), campaign_id)
        return False


async def _send(to: str, subject: str, text: str, html: str | None = None, headers: dict | None = None, prov: str | None = None) -> bool:
    s = get_settings()
    prov = prov or await provider_name()
    if prov == "zeptomail":
        await _send_zeptomail(to, subject, text, html, headers)
        return True
    if prov == "brevo":
        await _send_brevo(to, subject, text, html, headers)
        return True
    if prov == "smtp":
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
        p(f"Bonjour {esc_(name)}, bienvenue sur Crushduo !"), p(f"Saisissez ce code dans l’application : il est valable {minutes} minutes."), code_box(code),
        p("Vous pouvez aussi confirmer en un clic :"), button("Confirmer mon adresse", link),
        note("Ne communiquez jamais ce code. Si vous n’êtes pas à l’origine de cette inscription, ignorez ce message : le compte sera supprimé automatiquement. Le lien est valable 24 h."),
    ], preheader=f"Votre code de confirmation : {code}", trust=True)
    await send(to, "Votre code de confirmation — Crushduo",
               f"Bonjour {name},\n\nBienvenue sur Crushduo !\n\nVotre code de confirmation : {code}\n"
               f"Saisissez-le dans l'application (valable {minutes} minutes).\n\n"
               f"Vous pouvez aussi confirmer en un clic : {link} (lien valable 24 h).\n\n"
               "Ne communiquez jamais ce code. Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message : le compte sera supprimé automatiquement.", html, kind="verification")


async def send_password_reset(to: str, name: str, token: str) -> None:
    link = f"{get_settings().app_url}/reset-password?token={token}"
    html = render_email("Choisissez un nouveau mot de passe", [
        p(f"Bonjour {esc_(name)}, vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe en toute sécurité."),
        button("Choisir un nouveau mot de passe", link),
        note("Ce lien est valable pendant 1 heure. Si vous n’avez pas demandé cette réinitialisation, vous pouvez ignorer cet e-mail : votre mot de passe restera inchangé."),
    ], preheader="Réinitialisation de votre mot de passe", trust=True)
    await send(to, "Réinitialisation de votre mot de passe — Crushduo",
               f"Bonjour {name},\n\nPour choisir un nouveau mot de passe : {link}\n\n"
               "Lien valable 1 h. Si vous n'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.", html, kind="password_reset")


async def send_magic_link(to: str, name: str, token: str, remember: bool = True) -> None:
    link = f"{get_settings().app_url}/magic-link?token={token}&remember={'1' if remember else '0'}"
    html = render_email("Votre lien de connexion", [
        p(f"Bonjour {esc_(name)}, voici votre lien pour vous connecter sans mot de passe."), button("Me connecter", link),
        note("Lien valable 15 minutes, utilisable une seule fois. Si vous n’avez rien demandé, ignorez ce message : personne ne peut se connecter sans lui."),
    ], preheader="Connexion à Crushduo sans mot de passe", trust=True)
    await send(to, "Votre lien de connexion — Crushduo",
               f"Bonjour {name},\n\nPour vous connecter sans mot de passe : {link}\n\n"
               "Lien valable 15 minutes, utilisable une seule fois. Si vous n'avez rien demandé, ignorez ce message : personne ne peut se connecter sans lui.", html, kind="magic_link")


async def send_renewal_reminder(to: str, name: str, plan_name: str, ends_at: datetime.datetime, days_left: int) -> bool:
    """Rappel d'échéance (J-7, J-3, J-1) : le paiement étant ponctuel, rien ne se renouvelle seul ; le bouton mène à la page de prolongation (la durée s'ajoute à la date de fin)."""
    link = f"{get_settings().app_url}/premium"
    when = "demain" if days_left <= 1 else f"dans {days_left} jours"
    date = ends_at.strftime("%d/%m/%Y")
    title = f"Votre abonnement se termine {when}"
    html = render_email(title, [
        p(f"Bonjour {esc_(name)}, votre abonnement {esc_(plan_name)} se termine le {date}."),
        p("Pour garder vos avantages sans interruption, prolongez-le dès maintenant : la durée choisie s’ajoute à votre date de fin, vous ne perdez rien."),
        button("Prolonger mon abonnement", link),
        note("Le paiement est ponctuel : votre abonnement ne se renouvelle pas automatiquement. Si vous ne faites rien, vous repassez simplement à la formule gratuite après la date de fin."),
    ], preheader=f"{plan_name} : fin le {date}")
    return await send(to, f"{title} — Crushduo",
                      f"Bonjour {name},\n\nVotre abonnement {plan_name} se termine le {date}.\n\nProlongez-le pour garder vos avantages : la durée choisie s'ajoute à votre date de fin.\n{link}\n\n"
                      "Le paiement est ponctuel : l'abonnement ne se renouvelle pas automatiquement.", html, kind="subscription")


async def send_live_event_reminder(to: str, name: str, title: str, starts_at: datetime.datetime, tz_offset: int, city: str | None) -> bool:
    """Rappel d'une soirée Duo (une heure avant) : envoyé uniquement aux membres qui se sont inscrits."""
    link = f"{get_settings().app_url}/match"
    local = starts_at + datetime.timedelta(minutes=tz_offset)
    sign = "+" if tz_offset >= 0 else "-"
    zone = f"UTC{sign}{abs(tz_offset) // 60}" + (f":{abs(tz_offset) % 60:02d}" if abs(tz_offset) % 60 else "")
    when = f"{local.strftime('%d/%m/%Y à %Hh%M')} ({zone})"
    where = f" — {city}" if city else ""
    subject = f"{title} commence dans une heure"
    html = render_email(subject, [
        p(f"Bonjour {esc_(name)}, la soirée « {esc_(title)} »{esc_(where)} commence le {when}."),
        p("Connectez-vous à l’heure : c’est quand tout le monde est en ligne que les recherches aboutissent le plus vite."),
        button("Ouvrir la Soirée Duo", link),
        note("Vous recevez ce rappel parce que vous vous êtes inscrit(e) à cette soirée."),
    ], preheader=f"{title} : {when}")
    return await send(to, f"{subject} — Crushduo", f"Bonjour {name},\n\nLa soirée « {title} »{where} commence le {when}.\n\nConnectez-vous à l'heure : {link}\n\nVous recevez ce rappel parce que vous vous êtes inscrit(e) à cette soirée.", html, kind="notification")


async def send_promo_ending(to: str, name: str, code: str, kind: str, percent: int | None, tokens: int | None, ends_at: datetime.datetime) -> bool:
    """Rappel commercial (réservé aux membres qui ont accepté les offres) : l'offre de bienvenue se termine bientôt. Heure affichée en UTC (le membre voit l'heure exacte dans l'application)."""
    link = f"{get_settings().app_url}/premium"
    offer = f"{percent} % de réduction sur votre premier paiement" if kind == "PERCENT" else f"{tokens} jetons Crush offerts"
    subject = "Votre offre de bienvenue se termine bientôt"
    html = render_email(subject, [
        p(f"Bonjour {esc_(name)}, votre offre de bienvenue ({esc_(offer)}, code {esc_(code)}) se termine dans quelques heures."),
        p("Elle s'applique en un clic depuis l'application, sans saisir le code."),
        button("Voir mon offre", link),
        note("Vous recevez ce message parce que vous avez accepté de recevoir nos offres. Vous pouvez vous désabonner à tout moment dans Paramètres › Notifications."),
    ], preheader=offer)
    return await send(to, f"{subject} — Crushduo", f"Bonjour {name},\n\nVotre offre de bienvenue ({offer}, code {code}) se termine dans quelques heures. Elle s'applique en un clic : {link}\n\nVous recevez ce message parce que vous avez accepté de recevoir nos offres.", html, kind="notification")


async def send_login_alert(to: str, name: str, country_code: str) -> bool:
    """Alerte de sécurité : connexion depuis un autre pays que la précédente. Essentiel (sans désabonnement) : c'est la protection du compte."""
    from app.core.constants import COUNTRY_CODES  # noqa: F401  (codes connus ; le nom affiché reste le code ISO en secours)
    names = {"BJ": "le Bénin", "CI": "la Côte d'Ivoire", "TG": "le Togo", "SN": "le Sénégal", "NE": "le Niger", "BF": "le Burkina Faso", "CM": "le Cameroun", "ML": "le Mali",
             "GA": "le Gabon", "CD": "la RD Congo", "FR": "la France", "BE": "la Belgique", "CA": "le Canada"}
    where = names.get(country_code, country_code)
    link = f"{get_settings().app_url}/settings?tab=security"
    subject = "Nouvelle connexion à votre compte Crushduo"
    html = render_email(subject, [
        p(f"Bonjour {esc_(name)}, votre compte vient d'être utilisé depuis {esc_(where)}, un autre pays que lors de votre dernière connexion."),
        p("Si c'est vous (voyage, nouveau réseau), vous n'avez rien à faire. Sinon, changez votre mot de passe et déconnectez les autres appareils."),
        button("Vérifier mon compte", link),
        note("Pour renforcer la sécurité, vous pouvez activer la double authentification dans Paramètres › Sécurité. Nous ne conservons jamais votre adresse IP, seulement le pays."),
    ], preheader=f"Connexion depuis {where}")
    return await send(to, f"{subject}", f"Bonjour {name},\n\nVotre compte vient d'être utilisé depuis {where}, un autre pays que lors de votre dernière connexion.\n\nSi ce n'est pas vous, changez votre mot de passe : {link}", html, kind="security")


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


async def send_weekly_digest(to: str, name: str, user_id: str, c: dict, premium: bool, event: dict | None) -> bool:
    """Résumé de la semaine (facultatif, désabonnement en un clic). Les nombres seulement : le nom des visiteurs reste réservé à Premium/VIP, comme dans l'application."""
    from app.core.notifications import unsub_token
    base = get_settings().app_url.rstrip("/")
    unsub = f"{base}/notifications-unsubscribe?token={unsub_token(user_id)}"
    lines = []
    if c["likes"]:
        lines.append(_plural(c["likes"], "personne vous a liké et attend votre réponse", "personnes vous ont liké et attendent votre réponse"))
    if c["visits"]:
        lines.append(_plural(c["visits"], "personne a consulté votre profil", "personnes ont consulté votre profil"))
    if c["duos"]:
        lines.append(_plural(c["duos"], "nouveau duo", "nouveaux duos"))
    if c["unread"]:
        lines.append(_plural(c["unread"], "conversation avec un message non lu", "conversations avec des messages non lus"))
    if not lines:
        return False
    top = lines[0]
    subject = f"Votre semaine sur Crushduo : {top}"
    blocks = [p(f"Bonjour {esc_(name)}, voici votre semaine sur Crushduo :")] + [p(f"• {esc_(x)}") for x in lines]
    if c["likes"] or c["visits"]:
        blocks.append(p("Ne laissez pas ces personnes attendre : une réponse rapide double les chances d'échanger." if c["likes"] else "Un profil à jour (photos, présentation) donne envie de lui répondre."))
    if not premium and (c["likes"] or c["visits"]):
        blocks.append(p("Premium vous montre qui vous a liké et qui a consulté votre profil."))
    if event:
        blocks.append(p(f"Prochaine soirée : {esc_(event['title'])}. Rendez-vous dans l'application pour vous y inscrire."))
    blocks += [button("Ouvrir Crushduo", base + "/discover"),
               note(f'Vous recevez ce résumé chaque semaine parce que vous avez accepté nos offres. <a href="{esc_(unsub)}" style="color:#C2185B;font-weight:700;text-decoration:underline;">Ne plus recevoir ce résumé</a>')]
    html = render_email(subject, blocks, preheader=top)
    text = (f"Bonjour {name},\n\nVotre semaine sur Crushduo :\n" + "\n".join(f"- {x}" for x in lines) + (f"\n\nProchaine soirée : {event['title']}" if event else "")
            + f"\n\n{base}/discover\n\nNe plus recevoir ce résumé : {unsub}")
    return await send(to, subject, text, html, kind="notification", headers={"List-Unsubscribe": f"<{unsub}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"})


def notification_html(title: str, body: str, unsub_url: str | None = None) -> str:
    """E-mail de notification (message, match, like…) : même carte, bouton vers l'application et, si la notification est facultative, un lien de désabonnement."""
    footer = (f'<p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;font-size:13px;color:#45434F;text-align:center;">'
              f'<a href="{esc_(unsub_url)}" style="color:#C2185B;font-weight:700;text-decoration:underline;">Ne plus recevoir ces e-mails</a></p>') if unsub_url else ""
    return render_email(title, [p(esc_(body)), button("Ouvrir Crushduo", get_settings().app_url),
                                note("Vous recevez ce message selon vos préférences de notification : vous pouvez les modifier dans Paramètres › Notifications.")], preheader=body, footer=footer)

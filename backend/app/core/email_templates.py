"""Gabarits HTML des e-mails (maquette « Choisissez un nouveau mot de passe ») : carte blanche arrondie sur fond rose très pâle, logo CENTRÉ en tête,
bandeau photo du couple dans un cœur (bord inférieur courbe), titre centré, bouton rose en dégradé, bandeau de réassurance (e-mails de sécurité),
pied de carte rose pâle puis mention légale. Style entièrement en ligne et mise en page en tables (les clients mail ignorent les feuilles de style et Outlook
ne comprend ni flex ni grid). Le logo est un PNG hébergé par le site (Gmail n'affiche pas le WebP ni le SVG).

Couleurs = jetons de la charte (docs/CHARTE_GRAPHIQUE.md), figés ici car un e-mail ne lit pas le CSS du site.
Chaque envoi garde un corps texte brut en repli : `mail.send(to, subject, text, html=render_email(...))`."""
from html import escape

from app.core.config import get_settings

BRAND_STRONG = "#D81B60"   # --brand-strong
BRAND_ACTION = "#C2185B"   # --brand-strong-2 : fond du bouton (blanc dessus : 5,87:1)
BRAND_INK = "#C2185B"      # --brand-ink : texte rose
SOFT = "#FFF0F5"           # --soft
FG = "#22212B"             # --fg
BODY = "#45434F"
MUTED = "#6B6A76"          # --muted (5,32:1 sur blanc)
LINE = "#EEE7EB"           # --line
PAGE = "#FFF0F5"           # --soft : fond de page
FOOT = "#FFF0F5"           # --soft : pied de carte           # pied de carte : rose très pâle (texte sombre dessus, jamais de blanc sur rose clair)
# DM Sans, la police du site, chargée par la feuille Google Fonts de l'en-tête (Apple Mail, iOS, Outlook Mac…) ; les clients qui l'ignorent (Gmail, Outlook Windows)
# retombent sur la police système, de proportions proches.
FONT = "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif"
FONT_CSS = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap"
LOGO_VERSION = "4"  # change à chaque nouveau logo : Gmail met les images en cache par adresse et afficherait sinon l'ancien


BTN_FROM = "#D81B60"        # --brand-strong : début du dégradé du bouton (blanc dessus : 4,95:1)
BTN_TO = "#C2185B"          # --brand-strong-2 : fin du dégradé (blanc dessus : 5,87:1)
WIDTH = 600


def esc(value) -> str:
    return escape(str(value), quote=True)


def p(html_text: str) -> str:
    """Paragraphe. `html_text` doit déjà être échappé si besoin."""
    return f'<p style="margin:16px 0 0;font-family:{FONT};font-size:16px;line-height:1.6;color:{FG};">{html_text}</p>'


def button(label: str, url: str) -> str:
    """Bouton d'action principal : pleine largeur, pilule rose en dégradé (couleur pleine en repli pour Outlook)."""
    return ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 0;"><tr>'
            f'<td align="center" bgcolor="{BTN_TO}" style="border-radius:999px;background-color:{BTN_TO};background-image:linear-gradient(135deg,{BTN_FROM} 0%,{BTN_TO} 100%);">'
            f'<a href="{esc(url)}" style="display:block;padding:15px 28px;font-family:{FONT};text-align:center;font-size:18px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">{esc(label)}</a></td></tr></table>')


def code_box(code: str) -> str:
    """Code de confirmation en grand, lisible et copiable."""
    return (f'<div style="margin:22px 0 0;padding:16px;background:{SOFT};border-radius:16px;text-align:center;">'
            f'<p style="margin:0;font-family:{FONT};font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:{MUTED};">Votre code</p>'
            f'<p style="margin:6px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;font-weight:800;letter-spacing:.35em;'
            f'padding-left:.35em;color:{BRAND_INK};">{esc(code)}</p></div>')


def highlight(html_text: str) -> str:
    return (f'<div style="margin:22px 0 0;padding:14px 16px;background:{SOFT};border-radius:12px;"><p style="margin:0;font-family:{FONT};font-size:14px;line-height:1.6;'
            f'color:{BRAND_INK};">{html_text}</p></div>')


def note(html_text: str) -> str:
    """Texte secondaire : durée de validité, avertissement de sécurité."""
    return f'<p style="margin:22px 0 0;font-family:{FONT};font-size:14px;line-height:1.6;color:{MUTED};">{html_text}</p>'


def _trust(base: str) -> str:
    """Bandeau de réassurance des e-mails de sécurité : sans fond, trois mentions séparées par un filet, icône rose d'encre devant chacune."""
    def cell(icon: str, label: str, sep: bool) -> str:
        line = f"border-left:1px solid {LINE};" if sep else ""
        return (f'<td align="center" valign="middle" style="padding:11px 6px;{line}"><table role="presentation" cellpadding="0" cellspacing="0"><tr>'
                f'<td valign="middle" style="padding-right:6px;"><img src="{esc(base)}/brand/email-{icon}.png?v=2" alt="" width="16" height="16" style="display:block;width:16px;height:16px;border:0;"></td>'
                f'<td valign="middle" style="font-family:{FONT};font-size:12px;font-weight:400;line-height:1.25;color:{FG};">{label}</td></tr></table></td>')
    return (f'<tr><td style="padding:22px 30px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;"><tr>'
            + cell("lock", "Lien sécurisé", False) + cell("user", "Demande personnelle", True) + cell("shield", "Accès protégé", True) + "</tr></table></td></tr>")


def render_email(title: str, blocks: list[str], preheader: str = "", footer: str = "", trust: bool = False) -> str:
    """`trust` : affiche le bandeau « Lien sécurisé · Demande personnelle · Accès protégé » (e-mails de connexion et de confirmation)."""
    s = get_settings()
    base = s.app_url.rstrip("/")
    pre = f'<div style="display:none;max-height:0;overflow:hidden;">{esc(preheader)}</div>' if preheader else ""
    return f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<link href="{FONT_CSS}" rel="stylesheet">
<title>{esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:{PAGE};">
{pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{PAGE};">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:{WIDTH}px;background:#ffffff;border-radius:28px;border-collapse:separate;overflow:hidden;box-shadow:0 8px 28px rgba(216,27,96,.10);">
<tr><td align="center" style="padding:22px 24px 14px;background:#ffffff;"><a href="{esc(base)}"><img src="{esc(base)}/brand/crushduo-logo-email.png?v={LOGO_VERSION}" alt="Crushduo" width="200" height="39" style="display:block;margin:0 auto;width:200px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;"></a></td></tr>
<tr><td style="font-size:0;line-height:0;background:#ffffff;"><img src="{esc(base)}/brand/email-hero.jpg?v=1" alt="" width="{WIDTH}" style="display:block;width:100%;max-width:{WIDTH}px;height:auto;border:0;"></td></tr>
<tr><td style="padding:8px 40px 6px;font-family:{FONT};">
<p style="margin:0;font-family:{FONT};font-size:26px;font-weight:800;line-height:1.25;letter-spacing:-.02em;color:{FG};text-align:left;">{esc(title)}</p>
{"".join(blocks)}
</td></tr>
{_trust(base) if trust else ""}
<tr><td style="height:26px;line-height:26px;font-size:0;">&nbsp;</td></tr>
<tr><td align="center" style="background:{FOOT};padding:20px 32px 20px;text-align:center;">
<p style="margin:0;font-family:{FONT};font-size:16px;color:{FG};">Deux cœurs, une belle histoire.</p>
<p style="margin:10px 0 0;font-family:{FONT};font-size:16px;color:{FG};">Une question ? <a href="{esc(base)}/contact" style="color:{BRAND_INK};font-weight:700;text-decoration:underline;">Contactez-nous</a></p>
{footer}
</td></tr>
<tr><td align="center" style="background:#ffffff;padding:16px 24px 18px;"><p style="margin:0;font-family:{FONT};font-size:13px;color:{MUTED};text-align:center;">© 2026 Crushduo • Réservé aux personnes majeures (18 ans et plus)</p></td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""

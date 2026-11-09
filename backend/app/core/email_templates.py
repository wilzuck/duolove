"""Gabarits HTML des e-mails transactionnels (même principe que WaMarket) : carte blanche sur fond rose très pâle, logo en tête,
rose d'action réservé au bouton. Style entièrement en ligne et mise en page en tables (les clients mail ignorent les feuilles de style et Outlook
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
PAGE = "#FBF5F8"
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif"


def esc(value) -> str:
    return escape(str(value), quote=True)


def p(html_text: str) -> str:
    """Paragraphe. `html_text` doit déjà être échappé si besoin."""
    return f'<p style="margin:14px 0 0;font-size:15px;line-height:1.65;color:{BODY};">{html_text}</p>'


def button(label: str, url: str) -> str:
    """Bouton d'action principal : le seul élément plein de la couleur de marque."""
    return ('<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 0;"><tr>'
            f'<td style="border-radius:999px;background:{BRAND_ACTION};"><a href="{esc(url)}" style="display:inline-block;padding:13px 28px;font-family:{FONT};'
            f'font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">{esc(label)}</a></td></tr></table>')


def code_box(code: str) -> str:
    """Code de confirmation en grand, lisible et copiable."""
    return (f'<div style="margin:24px 0 0;padding:18px 16px;background:{SOFT};border-radius:16px;text-align:center;">'
            f'<p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:{MUTED};">Votre code</p>'
            f'<p style="margin:6px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;font-weight:800;letter-spacing:.35em;'
            f'padding-left:.35em;color:{BRAND_INK};">{esc(code)}</p></div>')


def highlight(html_text: str) -> str:
    return (f'<div style="margin:24px 0 0;padding:14px 16px;background:{SOFT};border-radius:12px;"><p style="margin:0;font-size:13px;line-height:1.6;'
            f'color:{BRAND_INK};">{html_text}</p></div>')


def note(html_text: str) -> str:
    """Petit texte gris : durée de validité, avertissement de sécurité."""
    return f'<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:{MUTED};">{html_text}</p>'


def render_email(title: str, blocks: list[str], preheader: str = "", footer: str = "") -> str:
    s = get_settings()
    base = s.app_url.rstrip("/")
    pre = f'<div style="display:none;max-height:0;overflow:hidden;">{esc(preheader)}</div>' if preheader else ""
    return f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:{PAGE};">
{pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{PAGE};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid {LINE};border-radius:20px;border-collapse:separate;overflow:hidden;">
<tr><td style="padding:28px 32px 4px;"><a href="{esc(base)}"><img src="{esc(base)}/brand/crushduo-logo-email.png" alt="CrushDuo" width="140" height="29" style="display:block;width:140px;height:29px;border:0;outline:none;text-decoration:none;"></a></td></tr>
<tr><td style="padding:22px 32px 32px;font-family:{FONT};">
<p style="margin:0;font-size:22px;font-weight:800;line-height:1.3;color:{FG};">{esc(title)}</p>
{"".join(blocks)}
</td></tr>
<tr><td align="center" style="background:{BRAND_ACTION};border-radius:0 0 20px 20px;padding:22px 32px;text-align:center;">
<p style="margin:0;font-family:{FONT};font-size:14px;font-weight:800;color:#ffffff;">CrushDuo</p>
<p style="margin:4px 0 0;font-family:{FONT};font-size:12px;color:#ffffff;">Deux cœurs, une belle histoire.</p>
{footer}
<p style="margin:8px 0 0;font-family:{FONT};font-size:12px;color:#ffffff;">Une question ? <a href="{esc(base)}/contact" style="color:#ffffff;text-decoration:underline;">Contactez-nous</a></p>
</td></tr>
</table>
<p style="margin:14px 0 0;font-family:{FONT};font-size:11px;color:{MUTED};text-align:center;">© 2026 CrushDuo · Réservé aux personnes majeures (18 ans et plus)</p>
</td></tr>
</table>
</body>
</html>"""

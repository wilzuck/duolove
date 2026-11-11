"""Markdown restreint → HTML d'e-mail. Même grammaire que l'éditeur riche et le blog (apps/web/src/lib/blogMarkdown.ts) :
titres ##/###, listes, citation, séparateur ---, gras, italique, liens http(s)/relatifs, images du blog. Tout le reste est échappé : jamais de HTML brut."""
import re
from html import escape

from app.core.config import get_settings
from app.core.email_templates import FG, MUTED, BRAND_INK, LINE

INLINE = re.compile(r"(!\[[^\]]*\]\([^)\s]+\)|\[[^\]]+\]\([^)\s]+\)|\*\*(?:[^*]|\*[^*\n]+\*)+\*\*|\*[^*\n]+\*)")
IMG_OK = re.compile(r"^/api/media/blog/[a-f0-9]{32}(_t)?\.webp$")
LINK_OK = re.compile(r"^(https?://|/(?!/))")
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"


def _abs(url: str) -> str:
    return get_settings().app_url.rstrip("/") + url if url.startswith("/") else url


def inline(text: str) -> str:
    out = []
    for part in INLINE.split(text):
        if not part:
            continue
        if m := re.fullmatch(r"!\[([^\]]*)\]\(([^)\s]+)\)", part):
            if IMG_OK.match(m.group(2)):
                out.append(f'<img src="{escape(_abs(m.group(2)), quote=True)}" alt="{escape(m.group(1), quote=True)}" width="480" style="display:block;max-width:100%;height:auto;border-radius:12px;margin:16px 0;">')
        elif m := re.fullmatch(r"\[([^\]]+)\]\(([^)\s]+)\)", part):
            label = inline(m.group(1))
            out.append(f'<a href="{escape(_abs(m.group(2)), quote=True)}" style="color:{BRAND_INK};font-weight:600;text-decoration:underline;">{label}</a>' if LINK_OK.match(m.group(2)) else label)
        elif m := re.fullmatch(r"\*\*((?:[^*]|\*[^*\n]+\*)+)\*\*", part):
            out.append(f"<strong>{inline(m.group(1))}</strong>")
        elif m := re.fullmatch(r"\*([^*\n]+)\*", part):
            out.append(f"<em>{escape(m.group(1))}</em>")
        else:
            out.append(escape(part))
    return "".join(out)


def blocks(source: str) -> list[str]:
    """Blocs HTML (à placer dans render_email) pour un texte Markdown restreint."""
    out: list[str] = []
    p = f"margin:16px 0 0;font-size:16px;line-height:1.65;color:{FG};"
    for block in (b.strip() for b in re.split(r"\n{2,}", source.replace("\r\n", "\n"))):
        if not block:
            continue
        lines = block.split("\n")
        if m := re.fullmatch(r"(#{2,3}) (.+)", block):
            size = "22px" if len(m.group(1)) == 2 else "18px"
            out.append(f'<p style="margin:26px 0 0;font-size:{size};font-weight:800;line-height:1.3;color:{FG};">{inline(m.group(2))}</p>')
        elif block == "---":
            out.append(f'<hr style="border:0;border-top:1px solid {LINE};margin:26px 0 0;">')
        elif all(ln.startswith("> ") for ln in lines):
            out.append(f'<blockquote style="margin:20px 0 0;padding:4px 0 4px 16px;border-left:3px solid {BRAND_INK};color:{MUTED};font-size:16px;line-height:1.65;">{inline(" ".join(ln[2:] for ln in lines))}</blockquote>')
        elif all(re.match(r"[-*] ", ln) for ln in lines):
            out.append(f'<ul style="{p}padding-left:22px;">' + "".join(f'<li style="margin:4px 0;">{inline(ln[2:])}</li>' for ln in lines) + "</ul>")
        elif all(re.match(r"\d+\. ", ln) for ln in lines):
            out.append(f'<ol style="{p}padding-left:22px;">' + "".join(f'<li style="margin:4px 0;">{inline(re.sub(r"^\d+\. ", "", ln))}</li>' for ln in lines) + "</ol>")
        else:
            out.append(f'<p style="{p}">{inline(block).replace(chr(10), "<br>")}</p>')
    return out


def plain(source: str) -> str:
    """Version texte brut du même contenu (liens en « libellé (adresse) »)."""
    t = re.sub(r"!\[[^\]]*\]\([^)\s]+\)", "", source)
    t = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: f"{m.group(1)} ({_abs(m.group(2))})" if LINK_OK.match(m.group(2)) else m.group(1), t)
    t = re.sub(r"\*\*((?:[^*]|\*[^*\n]+\*)+)\*\*", r"\1", t)
    t = re.sub(r"\*([^*\n]+)\*", r"\1", t)
    t = re.sub(r"^#{2,3} ", "", t, flags=re.M)
    return re.sub(r"\n{3,}", "\n\n", t).strip()

"""Génère les visuels de la page Facebook Crushduo (photo de profil, couverture, publications).

Usage (depuis la racine du dépôt) :
    python docs/facebook/outils/generer_visuels.py --font /chemin/DMSans.ttf

La police est DM Sans (celle du site, `next/font/google` dans apps/web/src/app/[locale]/layout.tsx),
licence SIL OFL. Prendre le fichier variable « DM Sans » (Google Fonts) ou le convertir depuis
apps/web/.next/static/media/*.woff2 avec fontTools. Dépendance : Pillow.

Sources graphiques : apps/web/public/brand/crushduo-mark-light.webp (marque), apps/web/public/og.jpg
(photo du couple, déjà utilisée par le site). Couleurs : packages/ui/src/tokens.css.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
PUBLIC = ROOT / "apps/web/public"
OUT = ROOT / "docs/facebook/images"

# Jetons de marque (packages/ui/src/tokens.css)
BRAND = (233, 30, 99)        # --brand  #E91E63 (décor, grands éléments)
BRAND_2 = (255, 107, 129)    # --brand-2 #FF6B81
STRONG = (216, 27, 96)       # --brand-strong #D81B60 (blanc dessus 4,95:1)
STRONG_2 = (194, 24, 91)     # --brand-strong-2 #C2185B (blanc dessus 5,87:1)
SOFT = (255, 240, 245)       # --soft #FFF0F5
FG = (34, 33, 43)            # --fg #22212B
MUTED = (107, 106, 118)      # --muted #6B6A76
NIGHT = (20, 18, 26)         # --bg sombre #14121A
NIGHT_CARD = (29, 26, 37)    # --card sombre #1D1A25
INK_DARK = (255, 143, 174)   # --brand-ink sombre #FF8FAE
WHITE = (255, 255, 255)
SUCCESS = (22, 101, 52)      # --success-ink #166534
GOLD = (245, 179, 1)         # --gold #F5B301

FONT_PATH: str = ""

# ---------- version anglaise des publications (--lang en) ----------
LANG = "fr"
MISSING: set[str] = set()
EN = {
    # communs
    "18 ans et plus": "18+ only",
    "Réservé aux 18 ans et plus": "18 and over only",
    # 01 lancement
    "Deux cœurs, une belle histoire.": "Two hearts, one beautiful story.",
    "Le site de rencontre sérieuse pour l’Afrique francophone est ouvert.": "The serious dating site for French-speaking Africa is open.",
    "Profils vérifiés": "Verified profiles",
    "Modération humaine": "Human moderation",
    "Gratuit pour commencer": "Free to start",
    # 02 comment ça marche
    "Comment ça marche": "How it works",
    "Trois étapes, à votre rythme": "Three steps, at your own pace",
    "Créez votre profil": "Create your profile",
    "Photos, présentation, ce que vous cherchez. Inscription gratuite, 18 ans et plus.": "Photos, a few words, what you’re looking for. Free sign-up, 18 and over.",
    "Découvrez des profils compatibles": "Discover compatible profiles",
    "Pourcentage de compatibilité et raisons communes affichées. J’aime ou Passer.": "Estimated affinity and what you have in common. Like or Pass.",
    "C’est un Duo !": "It’s a Duo!",
    "Quand l’intérêt est réciproque, la conversation s’ouvre. Prenez le temps d’échanger.": "When the interest is mutual, the conversation opens. Take your time to talk.",
    # 03 vérifié
    "Confiance": "Trust",
    "Le badge « vérifié », ce qu’il prouve vraiment": "The “Verified” badge: what it really proves",
    "Un selfie, une vraie personne": "A selfie, a real person",
    "Vous envoyez un selfie : un modérateur le compare à vos photos.": "You send a selfie: a moderator compares it with your photos.",
    "Jamais automatique": "Never automatic",
    "Le badge n’est attribué qu’après ce contrôle humain.": "The badge is only granted after this human check.",
    "Le selfie est supprimé": "The selfie is deleted",
    "Il sert à la vérification, puis il est effacé.": "It is used for the check, then erased.",
    "Filtre « profils vérifiés »": "“Verified profiles” filter",
    "Pour ne voir que des profils vérifiés (filtre avancé).": "To see only verified profiles (advanced filter).",
    # 04 sécurité
    "Sécurité": "Safety",
    "Ne versez jamais d’argent à quelqu’un que vous n’avez pas rencontré.": "Never send money to someone you haven’t met.",
    "Ne donnez ni code reçu par SMS, ni coordonnées bancaires.": "Never share a code received by text, or your bank details.",
    "Méfiez-vous des urgences soudaines : hôpital, douane, billet bloqué.": "Beware of sudden emergencies: hospital, customs, blocked ticket.",
    "Signalez en un geste : c’est confidentiel et examiné par un modérateur.": "Report in one tap: it’s confidential and reviewed by a moderator.",
    "Votre position précise n’est jamais affichée.": "Your exact location is never shown.",
    # 05 soirées crush
    "Soirées Crush": "Crush Nights",
    "Tout le monde en ligne, au même moment.": "Everyone online, at the same time.",
    "Une heure fixe, des membres connectés en même temps, dans l’onglet Crush.": "A set time, members online together, in the Crush tab.",
    "Repérez la soirée": "Spot the Crush Night",
    "Elle s’affiche dans l’onglet Crush, parfois réservée à une ville.": "It shows in the Crush tab, sometimes for one city only.",
    "Touchez « Me prévenir »": "Tap “Remind me”",
    "Rappel une heure avant, puis au début.": "A reminder one hour before, then when it starts.",
    "Lancez votre recherche": "Start your search",
    "Des personnes en ligne et compatibles, à inviter en direct.": "Compatible people who are online, to invite live.",
    # 06 premier message
    "Conseil": "Tip",
    "Le premier message qui obtient une réponse": "The first message that gets a reply",
    "Salut ça va ?": "Hey, how are you?",
    "Trop vague : rien à quoi répondre.": "Too vague: nothing to reply to.",
    "Tu cites le garba d’Abidjan dans ton profil : tu as une adresse préférée ?": "You mention garba from Abidjan in your profile: got a favourite spot?",
    "Précis, sincère, appelle une réponse.": "Specific, sincere, invites a reply.",
    "Appuyez-vous sur un détail de son profil. Les brise-glaces de la messagerie peuvent aider.": "Build on one detail from their profile. The conversation starters in messaging can help.",
    # 07 premier rendez-vous
    "Premier rendez-vous": "First date",
    "Cinq réflexes pour un premier rendez-vous serein": "Five habits for a relaxed first date",
    "Un lieu public et animé, en journée si possible.": "A busy public place, in daytime if possible.",
    "Prévenez un proche : où, quand, avec qui.": "Tell someone close: where, when, with whom.",
    "Venez et repartez par vos propres moyens.": "Get there and back on your own.",
    "Gardez votre téléphone chargé.": "Keep your phone charged.",
    "Mal à l’aise ? Vous pouvez partir, puis signaler.": "Uncomfortable? You can leave, then report.",
    # 08 mode discret
    "Vie privée": "Privacy",
    "Le mode discret": "Incognito mode",
    "Pour chercher sans vous exposer.": "Look around without being seen.",
    "Visible seulement des personnes que vous avez likées": "Visible only to people you liked",
    "Vous n’apparaissez pas dans « Ils ont vu votre profil »": "You don’t appear in “Who viewed your profile”",
    "Vos messages et vos Duos restent normaux": "Your messages and Duos work as usual",
    "Inclus dans les formules VIP et Gold. Pour tous : position jamais affichée, profil masquable, mode pause.": "Included in the VIP and Gold plans. For everyone: exact location never shown, hideable profile, pause mode.",
}
EN_FILES = {
    "post-01-lancement.jpg": "post-01-launch.jpg",
    "post-02-comment-ca-marche.jpg": "post-02-how-it-works.jpg",
    "post-03-profils-verifies.jpg": "post-03-verified.jpg",
    "post-04-securite.jpg": "post-04-safety.jpg",
    "post-05-soirees-crush.jpg": "post-05-crush-nights.jpg",
    "post-06-premier-message.jpg": "post-06-first-message.jpg",
    "post-07-premier-rendez-vous.jpg": "post-07-first-date.jpg",
    "post-08-mode-discret.jpg": "post-08-incognito.jpg",
}
NO_TRANSLATION = {"Crushduo", "crushduo.com", "1", "2", "3", "4", "5"}


def tr(s: str) -> str:
    """Texte dans la langue demandée ; signale tout texte français sans traduction."""
    if LANG != "en":
        return s
    if s in EN:
        return EN[s]
    if s not in NO_TRANSLATION and s not in EN.values() and s != s.upper():  # majuscules : bandeau déjà traduit
        MISSING.add(s)
    return s



def font(size: int, weight: int = 700) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(FONT_PATH, size)
    try:
        axes = f.get_variation_axes()
    except Exception:
        return f  # police statique : graisse unique
    # DM Sans de Google Fonts a deux axes (opsz, wght) ; la version embarquée par next/font n'a que wght.
    values = [max(a["minimum"], min(a["maximum"], weight if a["name"] in (b"Weight", "Weight") else 14)) for a in axes]
    f.set_variation_by_axes(values)
    return f


def gradient(size, c1, c2, diagonal=True) -> Image.Image:
    w, h = size
    base = Image.new("RGB", (w, h), c1)
    mask = Image.linear_gradient("L").resize((w, h))
    if diagonal:
        mask = Image.linear_gradient("L").rotate(-35, expand=True).resize((w, h))
    top = Image.new("RGB", (w, h), c2)
    return Image.composite(top, base, mask)


def glow(img: Image.Image, center, radius, color, alpha) -> None:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x, y = center
    d.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(*color, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.45))
    img.alpha_composite(layer) if img.mode == "RGBA" else img.paste(Image.alpha_composite(img.convert("RGBA"), layer).convert(img.mode))


def wrap(draw, text, f, max_w):
    text = tr(text)
    lines = []
    for para in text.split("\n"):
        words, cur = para.split(" "), ""
        for w in words:
            t = (cur + " " + w).strip()
            if draw.textlength(t, font=f) <= max_w:
                cur = t
            else:
                if cur:
                    lines.append(cur)
                cur = w
        lines.append(cur)
    return lines


def text_block(draw, xy, text, f, fill, max_w, line_h=1.18, align="left") -> int:
    x, y = xy
    for line in wrap(draw, text, f, max_w):
        lx = x
        if align == "center":
            lx = x + (max_w - draw.textlength(line, font=f)) / 2
        draw.text((lx, y), line, font=f, fill=fill)
        y += int(f.size * line_h)
    return y


def mark(height: int) -> Image.Image:
    m = Image.open(PUBLIC / "brand/crushduo-mark-light.webp").convert("RGBA")
    m = m.crop(m.getbbox())
    return m.resize((int(m.width * height / m.height), height), Image.LANCZOS)


def white_logo(height: int) -> Image.Image:
    """Logo négatif (charte §2.2) : marque en couleurs sur pastille blanche + mot « Crushduo » blanc."""
    f = font(int(height * 0.78), 800)
    tmp = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    tw = int(tmp.textlength("Crushduo", font=f))
    pad = int(height * 0.12)
    badge = height
    img = Image.new("RGBA", (badge + int(height * 0.28) + tw + 4, height + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, pad, badge, pad + badge), radius=int(badge * 0.28), fill=WHITE)
    mk = mark(int(badge * 0.62))
    img.alpha_composite(mk, ((badge - mk.width) // 2, pad + (badge - mk.height) // 2 + int(badge * 0.02)))
    asc, desc = f.getmetrics()
    d.text((badge + int(height * 0.28), pad + (badge - asc - desc // 2) // 2 + int(height * 0.02)), "Crushduo", font=f, fill=WHITE)
    return img


def couple(size: int) -> Image.Image:
    """Photo du couple dans le cœur, prise dans og.jpg (visuel déjà publié sur le site)."""
    og = Image.open(PUBLIC / "og.jpg").convert("RGB")
    crop = og.crop((548, 40, 1178, 630))  # 630 × 590 : le cœur photo entier
    return crop.resize((size, int(size * crop.height / crop.width)), Image.LANCZOS)


def pill(draw, xy, text, f, bg, fg, pad=(28, 14)):
    text = tr(text)
    x, y = xy
    w = draw.textlength(text, font=f)
    asc, desc = f.getmetrics()
    h = asc + desc
    draw.rounded_rectangle((x, y, x + w + 2 * pad[0], y + h + 2 * pad[1]), radius=(h + 2 * pad[1]) // 2, fill=bg)
    draw.text((x + pad[0], y + pad[1]), text, font=f, fill=fg)
    return x + w + 2 * pad[0], y + h + 2 * pad[1]


# ---------- icônes simples (tracées, pas d'emprunt) ----------

def icon_check(d, cx, cy, r, bg, fg):
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=bg)
    w = max(4, r // 5)
    d.line([(cx - r * 0.45, cy + r * 0.02), (cx - r * 0.12, cy + r * 0.35), (cx + r * 0.48, cy - r * 0.3)], fill=fg, width=w, joint="curve")


def icon_shield(d, cx, cy, s, fill, check=WHITE):
    pts = [(cx, cy - s), (cx + s * 0.82, cy - s * 0.68), (cx + s * 0.72, cy + s * 0.25), (cx, cy + s), (cx - s * 0.72, cy + s * 0.25), (cx - s * 0.82, cy - s * 0.68)]
    d.polygon(pts, fill=fill)
    w = max(4, int(s / 6))
    d.line([(cx - s * 0.36, cy + s * 0.02), (cx - s * 0.08, cy + s * 0.3), (cx + s * 0.4, cy - s * 0.26)], fill=check, width=w, joint="curve")


def icon_lock(d, cx, cy, s, fill):
    w = max(5, int(s / 6))
    d.arc((cx - s * 0.5, cy - s * 1.05, cx + s * 0.5, cy - s * 0.05), 180, 360, fill=fill, width=w)
    d.line([(cx - s * 0.5 + w / 2, cy - s * 0.55), (cx - s * 0.5 + w / 2, cy - s * 0.05)], fill=fill, width=w)
    d.line([(cx + s * 0.5 - w / 2, cy - s * 0.55), (cx + s * 0.5 - w / 2, cy - s * 0.05)], fill=fill, width=w)
    d.rounded_rectangle((cx - s * 0.75, cy - s * 0.15, cx + s * 0.75, cy + s * 0.85), radius=int(s * 0.18), fill=fill)


def icon_moon(img, cx, cy, r, fill):
    """Croissant découpé par masque (le fond reste visible à travers)."""
    m = Image.new("L", img.size, 0)
    md = ImageDraw.Draw(m)
    md.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    md.ellipse((cx - r * 0.45, cy - r * 1.1, cx + r * 1.35, cy + r * 0.6), fill=0)
    img.paste(Image.new("RGBA", img.size, (*fill, 255)), (0, 0), m)


def icon_eye_off(d, cx, cy, s, fill):
    w = max(5, int(s / 7))
    d.arc((cx - s, cy - s * 0.9, cx + s, cy + s * 0.9), 200, 340, fill=fill, width=w)
    d.arc((cx - s, cy - s * 0.9, cx + s, cy + s * 0.9), 20, 160, fill=fill, width=w)
    d.ellipse((cx - s * 0.28, cy - s * 0.28, cx + s * 0.28, cy + s * 0.28), fill=fill)
    d.line([(cx - s * 0.85, cy + s * 0.85), (cx + s * 0.85, cy - s * 0.85)], fill=fill, width=w)


def footer(img, d, dark=False, url="crushduo.com"):
    W, H = img.size
    f = font(34, 700)
    fs = font(28, 500)
    lg = white_logo(58) if dark else None
    if dark:
        img.alpha_composite(lg, (64, H - 64 - lg.height + 8))
    else:
        mk = mark(56)
        img.alpha_composite(mk, (64, H - 64 - 56))
        d.text((64 + mk.width + 16, H - 64 - 52), "Crushduo", font=font(44, 800), fill=FG)
    tw = d.textlength(url, font=f)
    d.text((W - 64 - tw, H - 64 - 44), url, font=f, fill=WHITE if dark else STRONG_2)
    tag = tr("18 ans et plus")
    d.text((W - 64 - d.textlength(tag, font=fs), H - 64 - 4), tag, font=fs, fill=(255, 220, 232) if dark else MUTED)


def save(img: Image.Image, name: str, quality=92):
    out = OUT
    if LANG == "en":
        name, out = EN_FILES[name], OUT / "en"
    out.mkdir(parents=True, exist_ok=True)
    rgb = img.convert("RGB")
    p = out / name
    if name.endswith(".jpg"):
        rgb.save(p, quality=quality, optimize=True, progressive=True)
    else:
        rgb.save(p, optimize=True)
    print(p.relative_to(ROOT), rgb.size, rgb.mode)


# ---------- photo de profil ----------

def profile():
    S = 1080
    img = Image.new("RGBA", (S, S), (*SOFT, 255))
    glow(img, (250, 220), 420, BRAND_2, 70)
    glow(img, (860, 880), 420, BRAND, 45)
    mk = mark(560)  # reste dans le cercle affiché par Facebook (diamètre = côté)
    img.alpha_composite(mk, ((S - mk.width) // 2, (S - mk.height) // 2 + 10))
    save(img, "profil-crushduo-1080.png")
    # aperçu du recadrage rond (contrôle visuel, non publié)
    prev = img.resize((360, 360), Image.LANCZOS)
    m = Image.new("L", (360, 360), 0)
    ImageDraw.Draw(m).ellipse((0, 0, 359, 359), fill=255)
    out = Image.new("RGBA", (360, 360), (240, 242, 245, 255))
    out.paste(prev, (0, 0), m)
    save(out, "_apercu-profil-rond.png")


# ---------- couverture ----------

def cover():
    W, H = 1640, 624
    img = gradient((W, H), STRONG, BRAND).convert("RGBA")
    glow(img, (330, 120), 360, BRAND_2, 90)
    glow(img, (1500, 560), 380, STRONG_2, 120)
    d = ImageDraw.Draw(img)
    # Zone sûre mobile : environ x 265–1375 (centre 1110 × 624). La photo de profil masque le bas-gauche sur ordinateur.
    ph = couple(470)
    m = Image.new("L", ph.size, 0)
    ImageDraw.Draw(m).rectangle((0, 0, ph.width, ph.height), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(0))
    # fondu des bords pour que le fond rose d'og.jpg se mêle au dégradé
    edge = Image.new("L", ph.size, 255)
    ed = ImageDraw.Draw(edge)
    for i in range(90):
        a = int(255 * (i / 90) ** 1.6)
        ed.rectangle((i, i, ph.width - 1 - i, ph.height - 1 - i), outline=a)
    img.alpha_composite(Image.merge("RGBA", (*ph.split(), edge)), (880, H - ph.height + 6))
    lg = white_logo(88)
    img.alpha_composite(lg, (300, 92))
    y = text_block(d, (304, 230), "Rencontres sérieuses en Afrique francophone", font(50, 800), WHITE, 560, 1.14)
    y = text_block(d, (304, y + 14), "Profils vérifiés par selfie · Modération humaine · Soirées Crush", font(29, 600), (255, 232, 240), 560, 1.3)
    pill(d, (304, y + 26), "Inscription gratuite sur crushduo.com", font(28, 700), WHITE, STRONG_2)
    save(img, "couverture-crushduo-1640x624.jpg")
    # aperçu des recadrages (ordinateur 820 × 312 avec photo de profil, mobile 640 × 360 centre)
    desk = img.resize((820, 312), Image.LANCZOS)
    dd = ImageDraw.Draw(desk)
    dd.ellipse((24, 312 - 70, 24 + 168, 312 + 98), outline=(255, 255, 0, 255), width=3)
    save(desk, "_apercu-couverture-ordinateur.png")
    cw = int(H * 640 / 360)
    mob = img.crop(((W - cw) // 2, 0, (W + cw) // 2, H)).resize((640, 360), Image.LANCZOS)
    save(mob, "_apercu-couverture-mobile.png")


# ---------- publications (1080 × 1350, format 4:5 du fil) ----------

def post_canvas(dark=False):
    W, H = 1080, 1350
    if dark:
        img = gradient((W, H), NIGHT, NIGHT_CARD).convert("RGBA")
        glow(img, (880, 260), 380, BRAND, 70)
        glow(img, (160, 1150), 360, BRAND_2, 40)
    else:
        img = Image.new("RGBA", (W, H), (*SOFT, 255))
        glow(img, (930, 160), 380, BRAND_2, 55)
        glow(img, (120, 1240), 360, BRAND, 30)
    return img, ImageDraw.Draw(img)


def kicker(d, xy, text, dark=False):
    return pill(d, xy, tr(text).upper(), font(26, 800), STRONG_2 if not dark else INK_DARK, WHITE if not dark else NIGHT, pad=(22, 10))


def post_launch():
    W, H = 1080, 1350
    img = gradient((W, H), STRONG, BRAND).convert("RGBA")
    glow(img, (200, 200), 360, BRAND_2, 90)
    d = ImageDraw.Draw(img)
    ph = couple(640)
    edge = Image.new("L", ph.size, 255)
    ed = ImageDraw.Draw(edge)
    for i in range(110):
        ed.rectangle((i, i, ph.width - 1 - i, ph.height - 1 - i), outline=int(255 * (i / 110) ** 1.6))
    img.alpha_composite(Image.merge("RGBA", (*ph.split(), edge)), (W - ph.width + 40, 720))
    lg = white_logo(70)
    img.alpha_composite(lg, (64, 70))
    y = text_block(d, (64, 210), "Deux cœurs, une belle histoire.", font(84, 800), WHITE, 900, 1.08)
    text_block(d, (64, y + 20), "Le site de rencontre sérieuse pour l’Afrique francophone est ouvert.", font(38, 600), (255, 232, 240), 560, 1.25)
    y2 = 590
    for t in ["Profils vérifiés", "Modération humaine", "Gratuit pour commencer"]:
        icon_check(d, 92, y2 + 26, 26, WHITE, STRONG_2)
        d.text((136, y2), tr(t), font=font(36, 700), fill=WHITE)
        y2 += 74
    pill(d, (64, H - 170), "crushduo.com", font(40, 800), WHITE, STRONG_2, pad=(34, 16))
    d.text((64, H - 70), tr("Réservé aux 18 ans et plus"), font=font(28, 500), fill=(255, 220, 232))
    save(img, "post-01-lancement.jpg")


def post_how():
    img, d = post_canvas()
    W = img.width
    kicker(d, (64, 72), "Comment ça marche")
    text_block(d, (64, 160), "Trois étapes, à votre rythme", font(72, 800), FG, 950, 1.1)
    steps = [
        ("1", "Créez votre profil", "Photos, présentation, ce que vous cherchez. Inscription gratuite, 18 ans et plus."),
        ("2", "Découvrez des profils compatibles", "Pourcentage de compatibilité et raisons communes affichées. J’aime ou Passer."),
        ("3", "C’est un Duo !", "Quand l’intérêt est réciproque, la conversation s’ouvre. Prenez le temps d’échanger."),
    ]
    y = 380
    for n, t, s in steps:
        d.rounded_rectangle((64, y, W - 64, y + 230), radius=36, fill=WHITE)
        d.ellipse((104, y + 50, 204, y + 150), fill=STRONG)
        d.text((154, y + 100), n, font=font(56, 800), fill=WHITE, anchor="mm")
        yy = text_block(d, (240, y + 40), t, font(40, 800), FG, 720, 1.1)
        text_block(d, (240, yy + 8), s, font(30, 500), MUTED, 720, 1.3)
        y += 260
    footer(img, d)
    save(img, "post-02-comment-ca-marche.jpg")


def post_verified():
    img, d = post_canvas()
    W = img.width
    kicker(d, (64, 72), "Confiance")
    icon_shield(d, W - 170, 230, 96, STRONG)
    text_block(d, (64, 160), "Le badge « vérifié », ce qu’il prouve vraiment", font(66, 800), FG, 720, 1.1)
    items = [
        ("Un selfie, une vraie personne", "Vous envoyez un selfie : un modérateur le compare à vos photos."),
        ("Jamais automatique", "Le badge n’est attribué qu’après ce contrôle humain."),
        ("Le selfie est supprimé", "Il sert à la vérification, puis il est effacé."),
        ("Filtre « profils vérifiés »", "Pour ne voir que des profils vérifiés (filtre avancé)."),
    ]
    y = 470
    for t, s in items:
        icon_check(d, 104, y + 30, 30, (220, 252, 231), SUCCESS)
        yy = text_block(d, (160, y + 4), t, font(38, 800), FG, 840, 1.1)
        y = text_block(d, (160, yy + 4), s, font(30, 500), MUTED, 840, 1.3) + 34
    footer(img, d)
    save(img, "post-03-profils-verifies.jpg")


def post_safety():
    img, d = post_canvas()
    W = img.width
    kicker(d, (64, 72), "Sécurité")
    icon_lock(d, W - 150, 230, 70, STRONG)
    y = text_block(d, (64, 160), "Ne versez jamais d’argent à quelqu’un que vous n’avez pas rencontré.", font(62, 800), FG, 740, 1.12)
    tips = [
        "Ne donnez ni code reçu par SMS, ni coordonnées bancaires.",
        "Méfiez-vous des urgences soudaines : hôpital, douane, billet bloqué.",
        "Signalez en un geste : c’est confidentiel et examiné par un modérateur.",
        "Votre position précise n’est jamais affichée.",
    ]
    y += 40
    for t in tips:
        d.rounded_rectangle((64, y, W - 64, y + 132), radius=28, fill=WHITE)
        icon_shield(d, 124, y + 66, 32, STRONG)
        text_block(d, (180, y + 26), t, font(32, 600), FG, 800, 1.25)
        y += 152
    footer(img, d)
    save(img, "post-04-securite.jpg")


def post_crush_nights():
    img, d = post_canvas(dark=True)
    W, H = img.size
    kicker(d, (64, 72), "Soirées Crush", dark=True)
    icon_moon(img, W - 170, 200, 78, INK_DARK)
    y = text_block(d, (64, 160), "Tout le monde en ligne, au même moment.", font(74, 800), WHITE, 800, 1.08)
    text_block(d, (64, y + 18), "Une heure fixe, des membres connectés en même temps, dans l’onglet Crush.", font(34, 500), (214, 208, 224), 900, 1.3)
    steps = [
        ("Repérez la soirée", "Elle s’affiche dans l’onglet Crush, parfois réservée à une ville."),
        ("Touchez « Me prévenir »", "Rappel une heure avant, puis au début."),
        ("Lancez votre recherche", "Des personnes en ligne et compatibles, à inviter en direct."),
    ]
    y = 640
    for i, (t, s) in enumerate(steps, 1):
        d.rounded_rectangle((64, y, W - 64, y + 176), radius=32, fill=(42, 36, 54))
        d.text((120, y + 88), str(i), font=font(64, 800), fill=INK_DARK, anchor="mm")
        yy = text_block(d, (190, y + 34), t, font(38, 800), WHITE, 800, 1.1)
        text_block(d, (190, yy + 6), s, font(29, 500), (190, 184, 202), 800, 1.3)
        y += 196
    footer(img, d, dark=True)
    save(img, "post-05-soirees-crush.jpg")


def post_first_message():
    img, d = post_canvas()
    W = img.width
    kicker(d, (64, 72), "Conseil")
    text_block(d, (64, 160), "Le premier message qui obtient une réponse", font(68, 800), FG, 950, 1.1)
    bubbles = [
        (False, "Salut ça va ?", "Trop vague : rien à quoi répondre."),
        (True, "Tu cites le garba d’Abidjan dans ton profil : tu as une adresse préférée ?", "Précis, sincère, appelle une réponse."),
    ]
    y = 430
    for good, msg, why in bubbles:
        f = font(36, 600)
        lines = wrap(d, msg, f, 700)
        bh = len(lines) * 46 + 56
        x0 = 64 if not good else W - 64 - 780
        d.rounded_rectangle((x0, y, x0 + 780, y + bh), radius=36, fill=WHITE if not good else STRONG)
        text_block(d, (x0 + 40, y + 26), msg, f, FG if not good else WHITE, 700, 1.28)
        y += bh + 18
        icon = (254, 226, 226) if not good else (220, 252, 231)
        col = (185, 28, 28) if not good else SUCCESS
        if good:
            icon_check(d, x0 + 30, y + 22, 22, icon, col)
        else:
            d.ellipse((x0 + 8, y, x0 + 52, y + 44), fill=icon)
            d.line([(x0 + 20, y + 12), (x0 + 40, y + 32)], fill=col, width=5)
            d.line([(x0 + 40, y + 12), (x0 + 20, y + 32)], fill=col, width=5)
        d.text((x0 + 66, y + 4), tr(why), font=font(30, 600), fill=col)
        y += 110
    text_block(d, (64, y + 10), "Appuyez-vous sur un détail de son profil. Les brise-glaces de la messagerie peuvent aider.", font(32, 500), MUTED, 950, 1.3)
    footer(img, d)
    save(img, "post-06-premier-message.jpg")


def post_first_date():
    img, d = post_canvas()
    W = img.width
    kicker(d, (64, 72), "Premier rendez-vous")
    text_block(d, (64, 160), "Cinq réflexes pour un premier rendez-vous serein", font(66, 800), FG, 950, 1.1)
    tips = [
        "Un lieu public et animé, en journée si possible.",
        "Prévenez un proche : où, quand, avec qui.",
        "Venez et repartez par vos propres moyens.",
        "Gardez votre téléphone chargé.",
        "Mal à l’aise ? Vous pouvez partir, puis signaler.",
    ]
    y = 420
    for i, t in enumerate(tips, 1):
        d.rounded_rectangle((64, y, W - 64, y + 118), radius=28, fill=WHITE)
        d.ellipse((96, y + 24, 166, y + 94), fill=STRONG)
        d.text((131, y + 59), str(i), font=font(38, 800), fill=WHITE, anchor="mm")
        text_block(d, (196, y + 36), t, font(34, 600), FG, 800, 1.2)
        y += 138
    footer(img, d)
    save(img, "post-07-premier-rendez-vous.jpg")


def post_discreet():
    img, d = post_canvas()
    W = img.width
    kicker(d, (64, 72), "Vie privée")
    icon_eye_off(d, W - 180, 220, 82, STRONG)
    y = text_block(d, (64, 160), "Le mode discret", font(78, 800), FG, 760, 1.1)
    y = text_block(d, (64, y + 14), "Pour chercher sans vous exposer.", font(40, 600), STRONG_2, 800, 1.2)
    items = [
        ("Visible seulement des personnes que vous avez likées", ""),
        ("Vous n’apparaissez pas dans « Ils ont vu votre profil »", ""),
        ("Vos messages et vos Duos restent normaux", ""),
    ]
    y += 60
    for t, _ in items:
        icon_check(d, 104, y + 30, 30, (220, 252, 231), SUCCESS)
        y = text_block(d, (160, y + 4), t, font(36, 700), FG, 840, 1.2) + 40
    d.rounded_rectangle((64, y + 10, W - 64, y + 210), radius=32, fill=WHITE)
    text_block(d, (104, y + 44), "Inclus dans les formules VIP et Gold. Pour tous : position jamais affichée, profil masquable, mode pause.", font(31, 500), MUTED, 870, 1.3)
    footer(img, d)
    save(img, "post-08-mode-discret.jpg")


POSTS = [post_launch, post_how, post_verified, post_safety, post_crush_nights, post_first_message, post_first_date, post_discreet]

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--font", required=True, help="Fichier TTF de DM Sans (variable)")
    ap.add_argument("--lang", choices=["fr", "en", "all"], default="all", help="fr : profil, couverture et publications ; en : publications en anglais (images/en/)")
    args = ap.parse_args()
    FONT_PATH = args.font
    if args.lang in ("fr", "all"):
        LANG = "fr"
        profile()
        cover()
        for post in POSTS:
            post()
    if args.lang in ("en", "all"):
        LANG = "en"
        for post in POSTS:
            post()
        if MISSING:
            raise SystemExit("Textes sans traduction anglaise : " + " | ".join(sorted(MISSING)))

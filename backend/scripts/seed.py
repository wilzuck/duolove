"""Données de DÉVELOPPEMENT uniquement (refuse de tourner en production).
Tous les comptes ont une adresse en @duo.test ; mot de passe commun affiché à la fin.
Usage : cd backend && .venv/bin/python -m scripts.seed   (SEED_PASSWORD pour fixer le mot de passe, sinon tirage aléatoire ;
SEED_MEMBERS=500 pour une foule plus grande, 100 par défaut ; relancer ajoute seulement les comptes manquants)"""
from __future__ import annotations

import asyncio
import datetime
import os
import secrets
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import insert, select

from app.core.config import get_settings
from app.core.constants import INTEREST_SLUGS
from app.core.ids import utcnow
from app.core.security import hash_password
from app.db.session import dispose, session_maker
from app.models.models import (
    Conversation, Entitlement, Interest, Match, Message, NotificationPreference, Preference, Profile, ProfilePhoto, Swipe, User, t_UserInterest,
)

if get_settings().is_prod:
    raise SystemExit("Le seed de développement est interdit en production.")

# Jamais de mot de passe en clair dans le dépôt : variable SEED_PASSWORD, sinon tirage aléatoire (affiché à la fin).
PASSWORD = os.environ.get("SEED_PASSWORD") or f"{secrets.token_urlsafe(9)}aA1!"
ROOT = Path(get_settings().upload_dir).resolve()
DAY = datetime.timedelta(days=1)
MEMBERS = max(0, min(int(os.environ.get("SEED_MEMBERS", "100")), 5000))

PEOPLE = [
    ("Aminata", "WOMAN", 27, "SN", "Dakar", "SERIOUS", ["music", "cooking", "travel"]),
    ("Kofi", "MAN", 31, "CI", "Abidjan", "MARRIAGE", ["sport", "faith", "family"]),
    ("Awa", "WOMAN", 25, "CI", "Abidjan", "DATING", ["dance", "fashion", "music"]),
    ("Yao", "MAN", 29, "TG", "Lomé", "SERIOUS", ["tech", "gaming", "cinema"]),
    ("Mariama", "WOMAN", 33, "BJ", "Cotonou", "MARRIAGE", ["faith", "family", "cooking"]),
    ("Ibrahim", "MAN", 35, "BJ", "Cotonou", "SERIOUS", ["entrepreneurship", "reading", "travel"]),
    ("Chantal", "WOMAN", 28, "CM", "Douala", "SERIOUS", ["art", "photography", "nature"]),
    ("Serge", "MAN", 30, "CM", "Yaoundé", "DATING", ["music", "sport", "cinema"]),
    ("Fatou", "WOMAN", 24, "SN", "Dakar", "FRIENDSHIP", ["reading", "art", "dance"]),
    ("Koffi", "MAN", 26, "TG", "Lomé", "SERIOUS", ["tech", "music", "travel"]),
    ("Adjoa", "WOMAN", 30, "TG", "Lomé", "SERIOUS", ["cooking", "nature", "faith"]),
    ("Moussa", "MAN", 32, "SN", "Dakar", "MARRIAGE", ["family", "sport", "faith"]),
    ("Nadège", "WOMAN", 29, "BJ", "Porto-Novo", "DATING", ["fashion", "photography", "travel"]),
    ("Eric", "MAN", 28, "BJ", "Cotonou", "SERIOUS", ["gaming", "cinema", "tech"]),
    ("Grâce", "WOMAN", 26, "CM", "Douala", "SERIOUS", ["music", "faith", "dance"]),
    ("Landry", "MAN", 34, "CI", "Abidjan", "SERIOUS", ["entrepreneurship", "family", "reading"]),
    ("Sika", "WOMAN", 31, "TG", "Lomé", "MARRIAGE", ["family", "cooking", "reading"]),
    ("Mamadou", "MAN", 27, "SN", "Dakar", "DATING", ["music", "dance", "sport"]),
    ("Prisca", "WOMAN", 23, "BJ", "Cotonou", "DATING", ["fashion", "dance", "art"]),
    ("Hervé", "MAN", 33, "CI", "Abidjan", "SERIOUS", ["nature", "travel", "photography"]),
    ("Inès", "WOMAN", 28, "FR", "Paris", "SERIOUS", ["cinema", "art", "travel"]),
    ("Thomas", "MAN", 30, "FR", "Paris", "SERIOUS", ["sport", "tech", "cooking"]),
    ("Rachelle", "WOMAN", 27, "CM", "Yaoundé", "SERIOUS", ["reading", "faith", "family"]),
    ("Dieudonné", "MAN", 36, "BJ", "Cotonou", "MARRIAGE", ["faith", "family", "entrepreneurship"]),
]
HUES = [340, 350, 10, 20, 330, 320, 355, 5]
NAMES_F = "Adèle Bintou Carine Dalila Estelle Fanta Gisèle Hawa Ida Jocelyne Khadija Léa Mireille Nafi Océane Pélagie Rokia Sandrine Tatiana Ursule Vanessa Yasmine Zita Amélie Brigitte Clarisse Déborah Eugénie Flora Hélène".split()
NAMES_M = "Abdoul Basile Cédric Désiré Emmanuel Fabrice Gaston Habib Idrissa Jonas Kader Léonce Maxime Nestor Olivier Pascal Quentin Rodrigue Samuel Thierry Ulrich Victor Wilfried Yannick Zacharie Alain Bertrand Constant Didier Éric".split()
PLACES = [("BJ", "Cotonou"), ("BJ", "Porto-Novo"), ("BJ", "Parakou"), ("CI", "Abidjan"), ("CI", "Bouaké"), ("TG", "Lomé"), ("TG", "Kara"), ("SN", "Dakar"), ("SN", "Thiès"),
          ("CM", "Douala"), ("CM", "Yaoundé"), ("BF", "Ouagadougou"), ("ML", "Bamako"), ("GA", "Libreville"), ("FR", "Paris"), ("FR", "Lyon"), ("BE", "Bruxelles"), ("CA", "Montréal")]
INTENTS = ["SERIOUS", "SERIOUS", "SERIOUS", "MARRIAGE", "MARRIAGE", "DATING", "DATING", "FRIENDSHIP", "UNSURE"]
BIOS = [
    "Passionné(e) de {a} et de {b}. Je cherche quelqu’un de sincère avec qui partager de beaux moments.",
    "La vie est courte : {a}, {b} et de bonnes conversations. Ravi(e) de faire de nouvelles rencontres.",
    "Calme, curieux(se) et attaché(e) à la famille. J’aime {a} et {b}. On en discute autour d’un café ?",
    "Entre {a} et {b}, je cherche la personne qui me fera sourire tous les jours.",
    "Profil sérieux. Amateur(trice) de {a}, fan de {b}. Les relations honnêtes avant tout.",
    "Ambitieux(se) mais pas stressé(e). {a}, {b}, et un bon sens de l’humour.",
]
JOBS = ["Ingénieur·e", "Enseignant·e", "Infirmier·ère", "Comptable", "Entrepreneur·e", "Médecin", "Développeur·se", "Commerçant·e", "Juriste", "Designer", "Chauffeur·se",
        "Étudiant·e en master", "Photographe", "Banquier·ère", "Cuisinier·ère"]


class Rng:
    """Mulberry32 : générateur déterministe (mêmes données à chaque exécution)."""

    def __init__(self, seed: int):
        self.a = seed & 0xFFFFFFFF

    def __call__(self) -> float:
        self.a = (self.a + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.a
        t = ((t ^ (t >> 15)) * (1 | t)) & 0xFFFFFFFF
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    def pick(self, seq):
        return seq[int(self() * len(seq))]

    def shuffled(self, seq):
        out = list(seq)
        for i in range(len(out) - 1, 0, -1):
            j = int(self() * (i + 1))
            out[i], out[j] = out[j], out[i]
        return out


def _hsl(h: int, s: float, l: float) -> tuple[int, int, int]:
    import colorsys

    r, g, b = colorsys.hls_to_rgb(h / 360, l, s)
    return int(r * 255), int(g * 255), int(b * 255)


def avatar(name: str, i: int, key: str | None = None) -> str:
    """Avatar de démonstration : dégradé + initiale (photo plein format et miniature `_t`)."""
    hue = HUES[i % len(HUES)]
    w, h = 800, 1000
    c1, c2 = _hsl(hue, 0.85, 0.62), _hsl((hue + 40) % 360, 0.8, 0.45)
    # Dégradé diagonal : une image 2×2 agrandie en bilinéaire (instantané, contrairement à une boucle pixel par pixel).
    mask = Image.new("L", (2, 2))
    mask.putdata([0, 128, 128, 255])
    mask = mask.resize((w, h), Image.BILINEAR)
    img = Image.composite(Image.new("RGB", (w, h), c2), Image.new("RGB", (w, h), c1), mask)
    d = ImageDraw.Draw(img)
    d.ellipse((230, 250, 570, 590), fill=tuple(int(c * 0.6 + 255 * 0.4) for c in c1))
    d = ImageDraw.Draw(img)
    d.text((400, 420), name[0], fill=(255, 255, 255), font=ImageFont.load_default(size=190), anchor="mm")
    key = key or f"photos/5eed{secrets.token_hex(10)}.webp"  # `key` fourni : régénère le fichier d'une photo déjà en base
    (ROOT / "photos").mkdir(parents=True, exist_ok=True)
    img.save(ROOT / key, "WEBP", quality=80)
    img.resize((480, 600)).save(ROOT / key.replace(".webp", "_t.webp"), "WEBP", quality=75)
    return key


async def add_member(db, *, email, pw_hash, name, gender, birth, country, city, intent, completeness, verified, visibility="VISIBLE", languages=("fr",),
                     bio="", occupation=None, seeking="EVERYONE", age_min=18, age_max=99, pref_country=None, keys=(), plan="FREE", last_active=None,
                     created=None, tags=(), interests=None, role="USER"):
    now = utcnow()
    u = User(email=email, passwordHash=pw_hash, role=role, emailVerifiedAt=now, acceptedTermsAt=now, lastActiveAt=last_active or now, createdAt=created or now)
    db.add(u)
    await db.flush()
    p = Profile(userId=u.id, displayName=name, birthDate=birth, gender=gender, country=country, city=city, intent=intent, completeness=completeness, onboardedAt=now,
                verified=verified, visibility=visibility, languages=list(languages), bio=bio, occupation=occupation)
    db.add(p)
    await db.flush()
    db.add_all([Preference(userId=u.id, seeking=seeking, ageMin=age_min, ageMax=age_max, country=pref_country), NotificationPreference(userId=u.id),
                Entitlement(userId=u.id, plan=plan, validUntil=(now + 20 * DAY) if plan != "FREE" else None)])
    for n, key in enumerate(keys):
        db.add(ProfilePhoto(profileId=p.id, key=key, width=800, height=1000, position=n, isPrimary=n == 0, moderationStatus="APPROVED"))
    if tags and interests:
        await db.execute(insert(t_UserInterest), [{"userId": u.id, "interestId": interests[t]} for t in tags])
    return u


def birth_for(age: int, day: int | None = None) -> datetime.datetime:
    n = utcnow()
    return n.replace(year=n.year - age - 1, day=day or n.day) if (day or n.day) <= 28 else n.replace(year=n.year - age - 1, day=28)


async def seed_crowd(db, pw_hash: str, interests: dict[str, str]) -> int:
    """`MEMBERS` membres de démonstration variés (déterministes ; 100 par défaut)."""
    r = Rng(20261103)
    created = 0
    for i in range(1, MEMBERS + 1):
        email = f"membre{i:04d}@duo.test" if MEMBERS > 999 else f"membre{i:03d}@duo.test"
        if (await db.execute(select(User.id).where(User.email == email))).first():
            continue
        roll = r()
        gender = "WOMAN" if roll < 0.47 else "MAN" if roll < 0.94 else "NON_BINARY" if roll < 0.97 else "OTHER"
        name = r.pick(NAMES_F) if gender == "WOMAN" else r.pick(NAMES_M) if gender == "MAN" else r.pick(NAMES_F + NAMES_M)
        age = 19 + int(r() * 30)
        country, city = r.pick(PLACES)
        tags = r.shuffled(INTEREST_SLUGS)[: 3 + int(r() * 4)]
        bio = r.pick(BIOS).replace("{a}", tags[0]).replace("{b}", tags[1])
        seeking = ("WOMEN" if r() < 0.9 else "EVERYONE") if gender == "MAN" else ("MEN" if r() < 0.9 else "EVERYONE") if gender == "WOMAN" else "EVERYONE"
        keys = [avatar(name, i + k * 3) for k in range(1 + int(r() * 3))]
        plan = "VIP" if i % 25 == 0 else "PREMIUM" if i % 10 == 0 else "FREE"
        await add_member(
            db, email=email, pw_hash=pw_hash, name=name, gender=gender, birth=birth_for(age, 1 + int(r() * 27)), country=country, city=city, intent=r.pick(INTENTS),
            completeness=60 + int(r() * 41), verified=r() < 0.28, visibility="HIDDEN" if r() < 0.04 else "VISIBLE",
            languages=("fr", "en") if country in ("FR", "BE", "CA") else ("fr",), bio=bio, occupation=r.pick(JOBS), seeking=seeking, age_min=max(18, age - 8),
            age_max=min(99, age + 12), pref_country=country if r() < 0.5 else None, keys=keys, plan=plan, last_active=utcnow() - datetime.timedelta(milliseconds=int(r() * 20 * 86_400_000)),
            created=utcnow() - datetime.timedelta(milliseconds=int(r() * 60 * 86_400_000)), tags=tags, interests=interests)
        created += 1
    await db.commit()
    return created


async def seed_activity(db) -> None:
    """Des likes, un Super Like et trois conversations pour que « Likes » et « Messages » ne soient pas vides côté Aminata."""
    me = (await db.execute(select(User).where(User.email == "aminata@duo.test"))).scalar_one_or_none()
    if not me:
        return
    men = (await db.execute(select(User).join(Profile, Profile.userId == User.id).where(User.email.like("membre%"), Profile.gender == "MAN", Profile.visibility == "VISIBLE")
                            .order_by(User.email).limit(18))).scalars().all()

    async def swipe(giver, target, action):
        if not (await db.execute(select(Swipe.id).where(Swipe.giverId == giver, Swipe.targetId == target))).first():
            db.add(Swipe(giverId=giver, targetId=target, action=action))

    for i, m in enumerate(men):
        await swipe(m.id, me.id, "SUPER_LIKE" if i == 2 else "LIKE")
    lines = [["Bonjour Aminata, ton profil m’a tapé dans l’œil 😊", "Merci ! Tu fais quoi dans la vie ?", "Je suis dans la tech. Et toi, tu aimes voyager ?"],
             ["Salut ! On a plein de points communs.", "Ah oui ? Lesquels ?"], ["Coucou, ravi de ce match !"]]
    for n, m in enumerate(men[:3]):
        a, b = sorted([me.id, m.id])
        await swipe(me.id, m.id, "LIKE")
        match = (await db.execute(select(Match).where(Match.userAId == a, Match.userBId == b))).scalar_one_or_none()
        if not match:
            match = Match(userAId=a, userBId=b)
            db.add(match)
            await db.flush()
            db.add(Conversation(matchId=match.id))
            await db.flush()
        conv = (await db.execute(select(Conversation).where(Conversation.matchId == match.id))).scalar_one()
        if not (await db.execute(select(Message.id).where(Message.conversationId == conv.id).limit(1))).first():
            base = utcnow() - datetime.timedelta(hours=n + 1)
            for k, body in enumerate(lines[n]):
                db.add(Message(conversationId=conv.id, senderId=m.id if k % 2 == 0 else me.id, body=body, createdAt=base + datetime.timedelta(minutes=k),
                               readAt=utcnow() if (k % 2 == 1 or n > 0) else None))
            conv.lastMessageAt = base + datetime.timedelta(minutes=2)
    await db.commit()


async def seed_lifestyle(db) -> None:
    """Mode de vie des profils de démonstration (taille, enfants, animaux…) : permet de tester les critères du menu Match. Idempotent."""
    rows = (await db.execute(select(Profile).join(User, User.id == Profile.userId).where(Profile.heightCm.is_(None), User.email.like("%@duo.test"), User.role == "USER")
                             .order_by(Profile.id))).scalars().all()
    r = Rng(2026)
    for p in rows:
        base = 168 if p.gender.value == "MAN" else 156
        p.heightCm, p.hasChildren, p.likesPets = base + int(r() * 28), r() < 0.3, r() < 0.65
        p.living = ["ALONE", "FAMILY", "ROOMMATES"][int(r() * 3)]
        p.originCountry = p.country if r() < 0.8 else ["CI", "SN", "CM", "BJ", "TG"][int(r() * 5)]
    await db.commit()
    print(f"Mode de vie renseigné pour {len(rows)} profils de démonstration.")


def blog_cover(hue: int) -> str:
    """Illustration décorative de couverture (dégradé + formes, 16:9) : à remplacer par de vraies images depuis l'admin."""
    w, h = 1600, 900
    c1, c2 = _hsl(hue, 0.85, 0.66), _hsl((hue + 45) % 360, 0.75, 0.42)
    mask = Image.new("L", (2, 2))
    mask.putdata([0, 128, 128, 255])
    img = Image.composite(Image.new("RGB", (w, h), c2), Image.new("RGB", (w, h), c1), mask.resize((w, h), Image.BILINEAR))
    lay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    for cx, cy, r, a in ((1180, 330, 330, 60), (1330, 560, 210, 80), (260, 760, 280, 45), (700, 200, 150, 50)):
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255, a))
    img = Image.alpha_composite(img.convert("RGBA"), lay).convert("RGB")
    key = f"blog/{secrets.token_hex(16)}.webp"
    (ROOT / "blog").mkdir(parents=True, exist_ok=True)
    img.save(ROOT / key, "WEBP", quality=82)
    img.resize((800, 450)).save(ROOT / key.replace(".webp", "_t.webp"), "WEBP", quality=75)
    return key


async def seed_blog(db) -> int:
    from sqlalchemy import func

    from app.models.models import BlogPost
    from scripts.blog_content import POSTS

    author = (await db.execute(select(User.id).where(User.email == "admin@duo.test"))).scalar()
    made = 0
    for post in POSTS:
        for loc in ("fr", "en"):
            c = post[loc]
            if (await db.execute(select(func.count()).select_from(BlogPost).where(BlogPost.locale == loc, BlogPost.slug == c["slug"]))).scalar():
                continue
            when = utcnow() - datetime.timedelta(days=post["ageDays"])
            db.add(BlogPost(slug=c["slug"], locale=loc, title=c["title"], excerpt=c["excerpt"], body=c["body"], coverKey=blog_cover(post["hue"]), coverAlt=c["alt"],
                            status="PUBLISHED", publishedAt=when, authorId=author, createdAt=when))
            made += 1
    await db.commit()
    return made


async def main() -> None:
    pw_hash = await hash_password(PASSWORD)
    async with session_maker()() as db:
        # Base déjà semée : les nouveaux comptes reprennent le mot de passe des comptes existants (un seul mot de passe à retenir).
        known = (await db.execute(select(User.passwordHash).where(User.email == "aminata@duo.test"))).scalar_one_or_none()
        if known:
            pw_hash = known
        # Offres, prix et produits : créés au démarrage de l'API (plan_config.ensure_defaults), jamais par le seed.
        have = {i.slug for i in (await db.execute(select(Interest))).scalars()}
        for slug in INTEREST_SLUGS:
            if slug not in have:
                db.add(Interest(slug=slug))
        await db.commit()
        interests = {i.slug: i.id for i in (await db.execute(select(Interest))).scalars()}

        staff = [("super@duo.test", "Super Admin", "SUPER_ADMIN"), ("admin@duo.test", "Admin CrushDuo", "ADMIN"), ("moderateur@duo.test", "Modératrice", "MODERATOR")]
        for email, name, role in staff:
            if (await db.execute(select(User.id).where(User.email == email))).first():
                continue
            await add_member(db, email=email, pw_hash=pw_hash, name=name, gender="OTHER", birth=datetime.datetime(1990, 1, 1), country="BJ", city="Cotonou", intent="UNSURE",
                             completeness=30, verified=False, visibility="HIDDEN", role=role, seeking="EVERYONE")
        await db.commit()

        created = 0
        for i, (name, gender, age, country, city, intent, tags) in enumerate(PEOPLE):
            import unicodedata

            ascii_name = "".join(c for c in unicodedata.normalize("NFD", name.lower()) if "a" <= c <= "z")
            email = f"{ascii_name}@duo.test"
            if (await db.execute(select(User.id).where(User.email == email))).first():
                continue
            await add_member(db, email=email, pw_hash=pw_hash, name=name, gender=gender, birth=birth_for(age), country=country, city=city, intent=intent, completeness=85,
                             verified=i % 4 == 0, bio=f"Profil de démonstration ({city}). J’aime {', '.join(tags)} et les belles rencontres.",
                             occupation=["Ingénieur·e", "Enseignant·e", "Entrepreneur·e", "Infirmier·ère"][i % 4], seeking="WOMEN" if gender == "MAN" else "MEN", age_max=60,
                             keys=[avatar(name, i)], tags=tags, interests=interests)
            created += 1
        await db.commit()
        crowd = await seed_crowd(db, pw_hash, interests)
        await seed_activity(db)
        await seed_lifestyle(db)
        blog_posts = await seed_blog(db)
    print(f"Blog : {blog_posts} articles créés (images de couverture décoratives).")
    print(f"Seed OK : {crowd} membres de démonstration supplémentaires, {created} membres créés, {len(staff)} comptes staff (si absents).")
    print(f"Mot de passe de TOUS les comptes seed : {PASSWORD}  (domaine @duo.test ; les comptes déjà existants gardent leur mot de passe)" if not known else "Mot de passe : celui des comptes déjà semés (inchangé).")
    await dispose()


if __name__ == "__main__":
    asyncio.run(main())

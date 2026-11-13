"""Blog : articles bilingues (une ligne par langue), image de couverture obligatoire pour publier, corps en Markdown restreint."""
from __future__ import annotations

import datetime
import math
import re
import secrets
import unicodedata

from sqlalchemy import select, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.errors import AppError, bad_request, not_found
from app.core.ids import utcnow
from app.models.models import BlogPost

LOCALES = ("fr", "en")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
COVER_RE = re.compile(r"^blog/[a-f0-9]{32}\.webp$")
THUMB = (800, 450)
WORDS_PER_MINUTE = 200


def slugify(title: str) -> str:
    s = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:80]


def thumb_key(key: str) -> str:
    return key.replace(".webp", "_t.webp")


def url_of(key: str | None) -> str | None:
    return f"/api/media/{key}" if key else None


def thumb_url_of(key: str | None) -> str | None:
    return f"/api/media/{thumb_key(key)}" if key else None


def read_minutes(body: str) -> int:
    return max(1, math.ceil(len(re.findall(r"\w+", body)) / WORDS_PER_MINUTE))


def iso(d):
    return d.isoformat(timespec="milliseconds") + "Z" if d else None


SHOW_VIEWS_KEY = "blog.showViews"


async def show_views(db: AsyncSession) -> bool:
    """Affichage public du nombre de visites : désactivé par défaut, activable par l'administration."""
    from app.models.models import SystemSetting

    v = (await db.execute(select(SystemSetting.value).where(SystemSetting.key == SHOW_VIEWS_KEY))).scalar_one_or_none()
    return bool(v.get("enabled")) if isinstance(v, dict) else False


async def set_show_views(db: AsyncSession, enabled: bool) -> bool:
    from app.models.models import SystemSetting

    row = await db.get(SystemSetting, SHOW_VIEWS_KEY)
    if row:
        row.value = {"enabled": enabled}
    else:
        db.add(SystemSetting(key=SHOW_VIEWS_KEY, value={"enabled": enabled}))
    await db.commit()
    return enabled


def card(p: BlogPost, views: bool = False) -> dict:
    return {**_card(p), **({"views": p.views or 0} if views else {})}


def _card(p: BlogPost) -> dict:
    return {"id": p.id, "slug": p.slug, "locale": p.locale, "title": p.title, "excerpt": p.excerpt, "coverUrl": url_of(p.coverKey),
            "coverThumbUrl": thumb_url_of(p.coverKey), "coverAlt": p.coverAlt, "publishedAt": iso(p.publishedAt), "readMinutes": read_minutes(p.body), "featured": bool(p.featured)}


def admin_row(p: BlogPost) -> dict:
    return {**card(p, views=True), "status": p.status, "coverKey": p.coverKey, "createdAt": iso(p.createdAt), "updatedAt": iso(p.updatedAt)}


async def upload_image(data: bytes) -> dict:
    img = await storage.process_image(data, THUMB)
    key = f"blog/{secrets.token_hex(16)}.webp"
    await storage.put(key, img.full)
    await storage.put(thumb_key(key), img.thumb)
    return {"key": key, "url": url_of(key), "thumbUrl": thumb_url_of(key), "width": img.width, "height": img.height}


async def delete_cover_files(db: AsyncSession, key: str) -> bool:
    """Supprime l'image et sa miniature, sauf si un autre article (ou une autre table) la référence encore. Renvoie True si supprimée."""
    from app.core import orphans

    if not COVER_RE.match(key) or key in await orphans.referenced_keys(db):
        return False
    await storage.delete(key)
    await storage.delete(thumb_key(key))
    return True


async def _check(db: AsyncSession, p: BlogPost) -> None:
    if p.coverKey and (not COVER_RE.match(p.coverKey) or await storage.get(p.coverKey) is None):
        raise bad_request("INVALID_COVER", "Image de couverture introuvable : téléversez-la d'abord")
    if p.status == "PUBLISHED":
        if not p.coverKey:
            raise bad_request("COVER_REQUIRED", "Un article publié doit avoir une image de couverture")
        if not (p.coverAlt or "").strip():
            raise bad_request("COVER_ALT_REQUIRED", "Décrivez l'image de couverture (texte alternatif) pour publier")
    dup = (await db.execute(select(BlogPost.id).where(BlogPost.locale == p.locale, BlogPost.slug == p.slug, BlogPost.id != (p.id or "")))).first()
    if dup:
        raise AppError(409, "SLUG_TAKEN", "Ce lien (slug) existe déjà dans cette langue")


def _utc(d):
    """Date reçue (avec ou sans fuseau) → heure UTC sans fuseau, comme en base ; jamais dans le futur (à 5 minutes près)."""
    if d is None:
        return None
    d = d.astimezone(datetime.timezone.utc).replace(tzinfo=None) if d.tzinfo else d
    if d > utcnow() + datetime.timedelta(minutes=5):
        raise bad_request("DATE_IN_FUTURE", "La date ne peut pas être dans le futur")
    return d


async def _apply_featured(db: AsyncSession, p: BlogPost, wanted: bool | None) -> None:
    """Un seul article « à la une » par langue, et seulement parmi les publiés ; dépublier retire la mise à la une."""
    if p.status != "PUBLISHED":
        p.featured = False
        return
    if wanted is not None:
        p.featured = wanted
    if p.featured:
        await db.execute(sql_update(BlogPost).where(BlogPost.locale == p.locale, BlogPost.id != p.id, BlogPost.featured.is_(True)).values(featured=False))


async def create(db: AsyncSession, data: dict, author_id: str) -> BlogPost:
    p = BlogPost(**{k: data[k] for k in ("slug", "locale", "title", "excerpt", "body", "coverKey", "coverAlt", "status")}, authorId=author_id)
    p.id = secrets.token_hex(12)
    p.featured = False
    if p.status == "PUBLISHED":
        p.publishedAt = _utc(data.get("publishedAt")) or utcnow()
    if data.get("createdAt"):
        p.createdAt = _utc(data["createdAt"])
    await _check(db, p)
    await _apply_featured(db, p, data.get("featured"))
    db.add(p)
    await db.commit()
    return p


async def update(db: AsyncSession, post_id: str, data: dict) -> BlogPost:
    p = await db.get(BlogPost, post_id)
    if not p:
        raise not_found("POST_NOT_FOUND")
    old_cover = p.coverKey
    created_at, published_at = _utc(data.pop("createdAt", None)), _utc(data.pop("publishedAt", None))
    wanted_featured = data.pop("featured", None)
    for k, v in data.items():
        setattr(p, k, v)
    if "status" in data:
        if p.status == "PUBLISHED" and not p.publishedAt:
            p.publishedAt = utcnow()
        elif p.status == "DRAFT":
            p.publishedAt = None
    if created_at:
        p.createdAt = created_at
    if published_at and p.status == "PUBLISHED":  # la date de publication n'a de sens que pour un article publié
        p.publishedAt = published_at
    await _check(db, p)
    await _apply_featured(db, p, wanted_featured)
    await db.commit()
    if "coverKey" in data and old_cover and old_cover != p.coverKey:
        await delete_cover_files(db, old_cover)
    return p


async def delete(db: AsyncSession, post_id: str) -> None:
    p = await db.get(BlogPost, post_id)
    if not p:
        raise not_found("POST_NOT_FOUND")
    key = p.coverKey
    await db.delete(p)
    await db.commit()
    if key:
        await delete_cover_files(db, key)

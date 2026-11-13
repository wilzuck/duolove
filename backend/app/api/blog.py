"""Blog public : seuls les articles PUBLISHED sont visibles."""
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import blog
from app.core.errors import not_found
from app.core.ratelimit import limit
from app.db.session import get_db
from app.models.models import BlogPost

router = APIRouter(prefix="/blog", tags=["blog"])


@router.get("")
async def list_posts(locale: Literal["fr", "en"] = Query("fr"), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BlogPost).where(BlogPost.locale == locale, BlogPost.status == "PUBLISHED").order_by(desc(BlogPost.publishedAt)).limit(100))).scalars().all()
    sv = await blog.show_views(db)
    return {"items": [blog.card(p, sv) for p in rows]}


@router.get("/{slug}")
async def get_post(slug: str, locale: Literal["fr", "en"] = Query("fr"), db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(BlogPost).where(BlogPost.locale == locale, BlogPost.slug == slug, BlogPost.status == "PUBLISHED"))).scalar_one_or_none()
    if not p:
        raise not_found("POST_NOT_FOUND")
    return {**blog.card(p, await blog.show_views(db)), "body": p.body}


@router.post("/{slug}/view", status_code=204, dependencies=[limit(30, 60, scope="blog-view")])
async def count_view(slug: str, locale: Literal["fr", "en"] = Query("fr"), db: AsyncSession = Depends(get_db)):
    """Compte une visite d'un article publié (appelé une fois par session de navigation par la page de l'article)."""
    await db.execute(update(BlogPost).where(BlogPost.locale == locale, BlogPost.slug == slug, BlogPost.status == "PUBLISHED").values(views=BlogPost.views + 1))
    await db.commit()
    return Response(status_code=204)

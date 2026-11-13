"""Administration du blog : brouillons, publication, images. Réservé aux ADMIN."""
from fastapi import APIRouter, Depends, File, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, audit
from app.api.profiles import read_upload
from app.core import blog
from app.core.auth import AuthUser
from app.core.errors import not_found
from app.db.session import get_db
from app.models.models import BlogPost
from app.schemas.blog import PostIn, PostPatch

router = APIRouter(prefix="/admin/blog", tags=["admin"])


@router.get("")
async def list_all(_: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BlogPost).order_by(desc(BlogPost.updatedAt)).limit(200))).scalars().all()
    tr = await blog.translations_of(db, rows)
    return {"items": [blog.admin_row(p, tr.get(p.id)) for p in rows]}


class ViewsSettingIn(BaseModel):
    showViews: bool


@router.get("/settings")
async def get_settings_(_: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    return {"showViews": await blog.show_views(db)}


@router.put("/settings")
async def put_settings(body: ViewsSettingIn, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    await blog.set_show_views(db, body.showViews)
    await audit(db, a.id, "blog.settings", "Setting", blog.SHOW_VIEWS_KEY, {"showViews": body.showViews})
    return {"showViews": body.showViews}


@router.post("/images", status_code=201)
async def upload(file: UploadFile | None = File(None), _: AuthUser = ADM):
    return await blog.upload_image(await read_upload(file))


@router.delete("/images", status_code=204)
async def discard_image(key: str, _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Retire une image téléversée mais jamais enregistrée (remplacée avant la sauvegarde) ; sans effet si un article la référence."""
    await blog.delete_cover_files(db, key)
    return Response(status_code=204)


@router.get("/{post_id}")
async def get_one(post_id: str, _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    p = await db.get(BlogPost, post_id)
    if not p:
        raise not_found("POST_NOT_FOUND")
    return await _full(db, p)


@router.post("", status_code=201)
async def create(body: PostIn, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    p = await blog.create(db, body.model_dump(), a.id)
    await audit(db, a.id, "blog.create", "BlogPost", p.id, {"slug": p.slug, "locale": p.locale, "status": p.status})
    return await _full(db, p)


@router.patch("/{post_id}")
async def update(post_id: str, body: PostPatch, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    p = await blog.update(db, post_id, body.model_dump(exclude_unset=True))
    await audit(db, a.id, "blog.update", "BlogPost", p.id, {"slug": p.slug, "status": p.status})
    return await _full(db, p)


@router.delete("/{post_id}", status_code=204)
async def remove(post_id: str, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    await blog.delete(db, post_id)
    await audit(db, a.id, "blog.delete", "BlogPost", post_id)
    return Response(status_code=204)


async def _full(db: AsyncSession, p: BlogPost) -> dict:
    tr = await blog.translations_of(db, [p])
    return {**blog.admin_row(p, tr.get(p.id)), "body": p.body}

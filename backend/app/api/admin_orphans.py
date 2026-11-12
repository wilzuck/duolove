"""Images orphelines du stockage : liste et suppression (ADMIN)."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, audit
from app.core import orphans
from app.core.auth import AuthUser
from app.core.errors import AppError
from app.db.session import get_db

router = APIRouter(prefix="/admin/orphans", tags=["admin"])


class DeleteIn(BaseModel):
    keys: list[str] = Field(min_length=1, max_length=orphans.MAX_DELETE)


@router.get("")
async def list_orphans(minAgeHours: int = orphans.MIN_AGE_HOURS, _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    try:
        out = await orphans.scan(db, max(1, min(minAgeHours, 24 * 365)))
    except RuntimeError as e:
        raise AppError(503, "STORAGE_UNAVAILABLE", str(e)) from None
    out["truncated"] = out["count"] > 500
    out["items"] = [{**i, "url": f"/api/media/{i['key']}" if i["kind"] in ("blog", "photo") else None} for i in out["items"][:500]]
    return out


@router.post("/delete")
async def delete_orphans(body: DeleteIn, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    res = await orphans.delete_orphans(db, body.keys)
    await audit(db, a.id, "storage.orphans.delete", "Storage", "orphans", {"deleted": len(res["deleted"]), "skipped": len(res["skipped"]), "freedBytes": res["freedBytes"]})
    return res

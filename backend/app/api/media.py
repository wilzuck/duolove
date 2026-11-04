import re

from fastapi import APIRouter, Response

from app.core import storage
from app.core.errors import not_found

router = APIRouter(prefix="/media", tags=["media"])
_FILE = re.compile(r"^[a-f0-9]+(_t)?\.webp$")


@router.get("/photos/{file}")
async def photo(file: str):
    """Seules les photos de profil (clés aléatoires) sont publiques ; `private/` n'est jamais servi ici."""
    if not _FILE.match(file):
        raise not_found()  # clé hex aléatoire, miniature = suffixe _t
    data = await storage.get(f"photos/{file}")
    if data is None:
        raise not_found()
    return Response(data, media_type="image/webp", headers={"Cache-Control": "public, max-age=31536000, immutable", "Cross-Origin-Resource-Policy": "cross-origin"})

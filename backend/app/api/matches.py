from fastapi import APIRouter, Depends
from sqlalchemy import or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import AuthUser, verified_user
from app.core.errors import not_found
from app.core.match_list import list_conversations
from app.db.session import get_db
from app.models.models import Match

router = APIRouter(prefix="/matches", tags=["matches"])


@router.get("")
async def list_matches(u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    """Mes matchs actifs (les conversations classées par activité récente)."""
    return await list_conversations(db, u.id)


@router.delete("/{match_id}")
async def unmatch(match_id: str, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    """Unmatch : ferme la conversation pour les deux. Les décisions précédentes restent : le profil ne réapparaît pas."""
    r = await db.execute(update(Match).where(Match.id == match_id, Match.status == "ACTIVE", or_(Match.userAId == u.id, Match.userBId == u.id))
                         .values(status="UNMATCHED", unmatchedById=u.id))
    await db.commit()
    if r.rowcount == 0:
        raise not_found("MATCH_NOT_FOUND")
    return {"ok": True}

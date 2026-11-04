"""Engagement : configuration publique des nouvelles fonctionnalités, questions de personnalité."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import appsettings, flags, promptsvc
from app.core.constants import REACTION_EMOJIS
from app.core.auth import AuthUser, verified_user
from app.db.session import get_db
from app.schemas.profiles import PromptAnswersIn

router = APIRouter(prefix="/engagement", tags=["engagement"])


@router.get("/config")
async def config(_: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    cfg = await appsettings.all_values(db)
    fl = await flags.all_flags(db)
    return {"flags": {k: fl[k] for k in ("profile_prompts", "like_comments", "daily_picks", "message_reactions", "message_replies", "icebreakers")},
            "prompts": {"min": cfg["prompts.min"], "max": cfg["prompts.max"], "answerMax": promptsvc.ANSWER_MAX}, "commentMax": cfg["likes.comment_max"], "reactionEmojis": list(REACTION_EMOJIS)}


@router.get("/prompts", dependencies=[flags.require_flag("profile_prompts")])
async def prompts(_: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return {"items": [promptsvc.prompt_dict(p) for p in await promptsvc.catalog(db)]}


@router.get("/me/prompts", dependencies=[flags.require_flag("profile_prompts")])
async def my_prompts(u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await promptsvc.mine(db, u.id)


@router.put("/me/prompts", dependencies=[flags.require_flag("profile_prompts")])
async def set_my_prompts(body: PromptAnswersIn, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await promptsvc.set_answers(db, u.id, [i.model_dump() for i in body.items])

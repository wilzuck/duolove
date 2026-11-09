"""Engagement : configuration publique des nouvelles fonctionnalités, questions de personnalité."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import appsettings, callsvc, dailyqsvc, flags, promptsvc, rhythm
from app.core.constants import REACTION_EMOJIS
from app.core.auth import AuthUser, verified_user
from app.db.session import get_db
from app.schemas.engagement import DailyAnswerIn
from app.schemas.profiles import PauseIn, PromptAnswersIn, RhythmIn

router = APIRouter(prefix="/engagement", tags=["engagement"])


@router.get("/config")
async def config(_: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    cfg = await appsettings.all_values(db)
    fl = await flags.all_flags(db)
    return {"flags": {k: fl[k] for k in ("profile_prompts", "like_comments", "daily_picks", "message_reactions", "message_replies", "icebreakers", "date_proposals", "pause_mode", "profile_tips", "calls", "speed_dating", "daily_question", "payments_enabled", "promo_codes", "boosts", "live_match")},
            "prompts": {"min": cfg["prompts.min"], "max": cfg["prompts.max"], "answerMax": promptsvc.ANSWER_MAX}, "commentMax": cfg["likes.comment_max"], "reactionEmojis": list(REACTION_EMOJIS),
            "calls": await callsvc.config(db),
            "dates": {"minNoticeHours": cfg["dates.min_notice_hours"], "maxDaysAhead": cfg["dates.max_days_ahead"]}}


@router.get("/prompts", dependencies=[flags.require_flag("profile_prompts")])
async def prompts(_: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return {"items": [promptsvc.prompt_dict(p) for p in await promptsvc.catalog(db)]}


@router.get("/me/prompts", dependencies=[flags.require_flag("profile_prompts")])
async def my_prompts(u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await promptsvc.mine(db, u.id)


@router.put("/me/prompts", dependencies=[flags.require_flag("profile_prompts")])
async def set_my_prompts(body: PromptAnswersIn, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await promptsvc.set_answers(db, u.id, [i.model_dump() for i in body.items])


@router.get("/me/rhythm")
async def my_rhythm(u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    """Pause, période de repos et rappels : tout ce qui règle le rythme de CrushDuo pour le membre."""
    return await rhythm.get(db, u.id)


@router.put("/me/rhythm")
async def set_my_rhythm(body: RhythmIn, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await rhythm.set_prefs(db, u.id, body.model_dump(exclude_unset=True))


@router.post("/me/pause")
async def pause(body: PauseIn, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await rhythm.start_pause(db, u.id, body.days)


@router.delete("/me/pause")
async def resume(u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await rhythm.resume(db, u.id)


@router.get("/me/tips")
async def tips(u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await rhythm.tips(db, u.id)


@router.get("/daily-question")
async def daily_question(u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await dailyqsvc.state(db, u.id)


@router.post("/daily-question/answer")
async def daily_question_answer(body: DailyAnswerIn, u: AuthUser = Depends(verified_user), db: AsyncSession = Depends(get_db)):
    return await dailyqsvc.answer(db, u.id, body.optionKey)

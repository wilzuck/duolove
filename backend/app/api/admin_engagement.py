"""Administration de l'engagement : réglages (pondérations du matching, quotas…), questions de profil, indicateurs. Réservé aux ADMIN."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, audit
from app.core import appsettings, icebreakers, promptsvc
from app.core.auth import AuthUser
from app.core.errors import AppError, not_found
from app.core.ids import utcnow
from app.db.session import get_db
from app.models.models import IcebreakerTemplate, ProfilePrompt, ProfilePromptAnswer
from app.schemas.engagement import IcebreakerCreate, IcebreakerPatch, PromptCreate, PromptPatch, SettingsPatch

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/settings")
async def get_settings(_: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    return {"values": await appsettings.all_values(db), "defaults": appsettings.DEFAULTS,
            "limits": {k: {"min": v[1], "max": v[2]} for k, v in appsettings.INT_SPECS.items()}}


@router.patch("/settings")
async def patch_settings(body: SettingsPatch, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    before = await appsettings.all_values(db)
    values = await appsettings.update(db, body.values)
    await audit(db, a.id, "settings.update", "SystemSetting", None, {"before": {k: before[k] for k in body.values}, "after": {k: values[k] for k in body.values}})
    return {"values": values}


@router.get("/prompts")
async def list_prompts(_: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    used = dict((await db.execute(select(ProfilePromptAnswer.promptId, func.count()).group_by(ProfilePromptAnswer.promptId))).all())
    return {"items": [{**promptsvc.prompt_dict(p), "answers": used.get(p.id, 0)} for p in await promptsvc.catalog(db, active_only=False)]}


@router.post("/prompts", status_code=201)
async def create_prompt(body: PromptCreate, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    p = ProfilePrompt(**body.model_dump())
    db.add(p)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise AppError(409, "SLUG_TAKEN", "Cette clé existe déjà") from None
    await audit(db, a.id, "prompt.create", "ProfilePrompt", p.id, {"slug": p.slug})
    return promptsvc.prompt_dict(p)


@router.patch("/prompts/{prompt_id}")
async def patch_prompt(prompt_id: str, body: PromptPatch, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    p = await db.get(ProfilePrompt, prompt_id)
    if not p:
        raise not_found("PROMPT_NOT_FOUND")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(p, k, v)
    await db.commit()
    await audit(db, a.id, "prompt.update", "ProfilePrompt", p.id, data)
    return promptsvc.prompt_dict(p)


@router.get("/icebreakers")
async def list_icebreakers(_: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(IcebreakerTemplate).order_by(IcebreakerTemplate.sortOrder, IcebreakerTemplate.createdAt))).scalars().all()
    return {"items": [icebreakers.template_dict(t) for t in rows]}


@router.post("/icebreakers", status_code=201)
async def create_icebreaker(body: IcebreakerCreate, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    t = IcebreakerTemplate(**body.model_dump())
    db.add(t)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise AppError(409, "SLUG_TAKEN", "Cette clé existe déjà") from None
    await audit(db, a.id, "icebreaker.create", "IcebreakerTemplate", t.id, {"slug": t.slug})
    return icebreakers.template_dict(t)


@router.patch("/icebreakers/{template_id}")
async def patch_icebreaker(template_id: str, body: IcebreakerPatch, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    t = await db.get(IcebreakerTemplate, template_id)
    if not t:
        raise not_found("TEMPLATE_NOT_FOUND")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(t, k, v)
    await db.commit()
    await audit(db, a.id, "icebreaker.update", "IcebreakerTemplate", t.id, data)
    return icebreakers.template_dict(t)


@router.get("/engagement/metrics")
async def metrics(_: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Indicateurs calculés sur les données réelles. Rien n'est estimé ni inventé ; ce qui n'est pas mesuré est listé dans `unavailable`."""
    from app.core.engagement_metrics import compute

    return await compute(db, utcnow())

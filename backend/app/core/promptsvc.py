"""Questions de personnalité : catalogue géré par l'administration, réponses des membres (3 à 5 par défaut, réordonnables)."""
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import appsettings
from app.core.errors import bad_request
from app.core.ids import utcnow
from app.models.models import ProfilePrompt, ProfilePromptAnswer

ANSWER_MIN, ANSWER_MAX = 3, 300
DEFAULT_PROMPTS = [  # (slug, français, anglais)
    ("ideal-date", "Mon rendez-vous idéal serait…", "My ideal date would be…"),
    ("charm", "Ce qui me fait craquer…", "What makes me fall for someone…"),
    ("dream", "Mon plus grand rêve…", "My biggest dream…"),
    ("seduce", "Pour me séduire, il faut…", "To win me over, you need to…"),
    ("sunday", "Mon dimanche parfait…", "My perfect Sunday…"),
    ("unguessed", "Une chose que personne ne devine sur moi…", "Something nobody guesses about me…"),
    ("looking-for", "Ce que je recherche vraiment…", "What I am really looking for…"),
    ("love-language", "Mon langage de l’amour…", "My love language…"),
]


async def ensure_defaults(db: AsyncSession) -> None:
    """Crée le catalogue initial si la table est vide ; ne touche jamais aux questions modifiées ou supprimées par l'administration."""
    if (await db.execute(select(ProfilePrompt.id).limit(1))).first():
        return
    for i, (slug, fr, en) in enumerate(DEFAULT_PROMPTS):
        db.add(ProfilePrompt(slug=slug, textFr=fr, textEn=en, sortOrder=i))
    await db.commit()


def prompt_dict(p: ProfilePrompt) -> dict:
    return {"id": p.id, "slug": p.slug, "textFr": p.textFr, "textEn": p.textEn, "active": p.active, "sortOrder": p.sortOrder}


async def catalog(db: AsyncSession, *, active_only: bool = True) -> list[ProfilePrompt]:
    q = select(ProfilePrompt).order_by(ProfilePrompt.sortOrder, ProfilePrompt.createdAt)
    if active_only:
        q = q.where(ProfilePrompt.active.is_(True))
    return list((await db.execute(q)).scalars().all())


def answer_dict(a: ProfilePromptAnswer, p: ProfilePrompt) -> dict:
    return {"id": a.id, "promptId": p.id, "position": a.position, "question": {"fr": p.textFr, "en": p.textEn}, "answer": a.answer}


async def answers_for(db: AsyncSession, user_ids: list[str]) -> dict[str, list[dict]]:
    """Réponses visibles (questions actives seulement), dans l'ordre choisi par chaque membre."""
    if not user_ids:
        return {}
    rows = (await db.execute(
        select(ProfilePromptAnswer, ProfilePrompt).join(ProfilePrompt, ProfilePrompt.id == ProfilePromptAnswer.promptId)
        .where(ProfilePromptAnswer.userId.in_(user_ids), ProfilePrompt.active.is_(True)).order_by(ProfilePromptAnswer.position)
    )).all()
    out: dict[str, list[dict]] = {}
    for a, p in rows:
        out.setdefault(a.userId, []).append(answer_dict(a, p))
    return out


async def mine(db: AsyncSession, user_id: str) -> dict:
    cfg = await appsettings.all_values(db)
    return {"items": (await answers_for(db, [user_id])).get(user_id, []), "rules": {"min": cfg["prompts.min"], "max": cfg["prompts.max"], "answerMax": ANSWER_MAX}}


async def set_answers(db: AsyncSession, user_id: str, items: list[dict]) -> dict:
    """Remplace l'ensemble des réponses (ordre = ordre reçu). Vide = tout retirer ; sinon entre `prompts.min` et `prompts.max` réponses."""
    cfg = await appsettings.all_values(db)
    lo, hi = cfg["prompts.min"], cfg["prompts.max"]
    if items and not lo <= len(items) <= hi:
        raise bad_request("PROMPT_COUNT", f"Répondez à {lo} à {hi} questions", {"min": lo, "max": hi})
    ids = [i["promptId"] for i in items]
    if len(set(ids)) != len(ids):
        raise bad_request("PROMPT_DUPLICATE", "Une question ne peut être choisie qu'une fois")
    active = {p.id for p in await catalog(db)}
    if any(i not in active for i in ids):
        raise bad_request("PROMPT_UNKNOWN", "Question inconnue ou retirée")
    for it in items:
        if not ANSWER_MIN <= len(it["answer"]) <= ANSWER_MAX:
            raise bad_request("INVALID_ANSWER", f"Réponse : {ANSWER_MIN} à {ANSWER_MAX} caractères")
    await db.execute(delete(ProfilePromptAnswer).where(ProfilePromptAnswer.userId == user_id))
    now = utcnow()
    for pos, it in enumerate(items):
        db.add(ProfilePromptAnswer(userId=user_id, promptId=it["promptId"], answer=it["answer"], position=pos, createdAt=now))
    await db.commit()
    return await mine(db, user_id)

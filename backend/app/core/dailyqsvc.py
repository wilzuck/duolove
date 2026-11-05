"""Question du jour : une question partagée par tous, avec des choix fermés. L'admin la planifie par date ; sans date prévue, le fonds de questions
tourne chaque jour (déterministe). La réponse d'une personne n'est visible d'un autre membre que si celui-ci a lui-même répondu (réciprocité) et
seulement sur les cartes des découvertes du jour : une façon douce d'ouvrir la conversation, jamais un classement."""
import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import flags
from app.core.errors import bad_request, conflict, not_found
from app.core.ids import utcnow
from app.models.models import DailyQuestion, DailyQuestionAnswer, SystemSetting

SEEDED_KEY = "catalog.daily_questions_seeded"

DEFAULTS: list[tuple[str, str, list[tuple[str, str]]]] = [
    ("Un dimanche parfait, c’est…", "A perfect Sunday is…", [("Un grand repas en famille", "A big family meal"), ("Une balade et un café à deux", "A walk and a coffee for two"), ("Du sport puis du repos", "Sport, then rest"), ("Des amis et de la musique", "Friends and music")]),
    ("Ce qui me touche le plus chez quelqu’un", "What touches me most in someone", [("Son humour", "Their humor"), ("Sa gentillesse", "Their kindness"), ("Sa sincérité", "Their sincerity"), ("Son ambition", "Their ambition")]),
    ("Pour une première rencontre, je préfère…", "For a first date, I prefer…", [("Un café", "A coffee"), ("Une promenade", "A walk"), ("Un repas", "A meal"), ("Une activité à deux", "An activity together")]),
    ("Mon rythme de vie ressemble à…", "My daily rhythm is…", [("Lève-tôt", "Early riser"), ("Couche-tard", "Night owl"), ("Cela dépend des jours", "It depends on the day")]),
    ("Dans un couple, l’essentiel c’est…", "In a couple, what matters most is…", [("La confiance", "Trust"), ("La communication", "Communication"), ("Les projets communs", "Shared plans"), ("La complicité", "Complicity")]),
    ("Ma façon de dire « je t’aime »", "My way of saying “I love you”", [("Les mots", "Words"), ("Les gestes", "Gestures"), ("Le temps passé ensemble", "Time together"), ("Les petites attentions", "Little attentions")]),
    ("Pour me détendre", "To unwind", [("La musique", "Music"), ("La cuisine", "Cooking"), ("La nature", "Nature"), ("Un film ou une série", "A film or a series")]),
    ("Un voyage idéal", "An ideal trip", [("Une plage", "A beach"), ("Une grande ville", "A big city"), ("Un village authentique", "An authentic village"), ("Une aventure", "An adventure")]),
    ("Je dirais que je suis plutôt…", "I would say I am rather…", [("Spontané·e", "Spontaneous"), ("Organisé·e", "Organized"), ("Rêveur·se", "A dreamer"), ("Pragmatique", "Pragmatic")]),
    ("Autour d’un repas, j’aime…", "Around a meal, I like…", [("La cuisine de chez nous", "Home cooking"), ("Découvrir de nouvelles saveurs", "Discovering new flavors"), ("Surtout partager un bon moment", "Mostly sharing a good time")]),
]


def make_options(pairs: list[tuple[str, str]]) -> list[dict]:
    return [{"key": f"o{i + 1}", "fr": fr, "en": en} for i, (fr, en) in enumerate(pairs)]


async def ensure_defaults(db: AsyncSession) -> None:
    """Fonds initial créé une seule fois (marqueur) : une question modifiée, désactivée ou supprimée par l'admin n'est jamais recréée."""
    if await db.get(SystemSetting, SEEDED_KEY):
        return
    for fr, en, opts in DEFAULTS:
        db.add(DailyQuestion(textFr=fr, textEn=en, options=make_options(opts)))
    db.add(SystemSetting(key=SEEDED_KEY, value=True))
    await db.commit()


def today() -> datetime.date:
    return utcnow().date()


async def question_for(db: AsyncSession, day: datetime.date | None = None) -> DailyQuestion | None:
    day = day or today()
    q = (await db.execute(select(DailyQuestion).where(DailyQuestion.day == day, DailyQuestion.active.is_(True)))).scalar_one_or_none()
    if q:
        return q
    pool = list((await db.execute(select(DailyQuestion).where(DailyQuestion.day.is_(None), DailyQuestion.active.is_(True)).order_by(DailyQuestion.createdAt, DailyQuestion.id))).scalars().all())
    return pool[day.toordinal() % len(pool)] if pool else None


def question_dict(q: DailyQuestion) -> dict:
    return {"id": q.id, "text": {"fr": q.textFr, "en": q.textEn}, "options": q.options}


async def state(db: AsyncSession, user_id: str) -> dict:
    if not await flags.read_flag(db, "daily_question"):
        return {"enabled": False, "question": None, "myAnswer": None}
    q = await question_for(db)
    if not q:
        return {"enabled": False, "question": None, "myAnswer": None}
    mine = (await db.execute(select(DailyQuestionAnswer.optionKey).where(DailyQuestionAnswer.questionId == q.id, DailyQuestionAnswer.userId == user_id))).scalar_one_or_none()
    return {"enabled": True, "question": question_dict(q), "myAnswer": mine}


async def answer(db: AsyncSession, user_id: str, option_key: str) -> dict:
    await flags.assert_on(db, "daily_question")
    q = await question_for(db)
    if not q:
        raise not_found("NO_DAILY_QUESTION")
    if option_key not in {o["key"] for o in q.options}:
        raise bad_request("INVALID_OPTION", "Choix invalide")
    row = (await db.execute(select(DailyQuestionAnswer).where(DailyQuestionAnswer.questionId == q.id, DailyQuestionAnswer.userId == user_id))).scalar_one_or_none()
    if row:
        row.optionKey = option_key  # on peut changer d'avis dans la journée
    else:
        db.add(DailyQuestionAnswer(questionId=q.id, userId=user_id, optionKey=option_key))
    await db.commit()
    return await state(db, user_id)


async def reveal_for(db: AsyncSession, user_id: str, target_ids: list[str]) -> dict[str, dict]:
    """Réponses des autres, uniquement si `user_id` a répondu à la question du jour. {targetId: {optionKey, same}}."""
    if not target_ids or not await flags.read_flag(db, "daily_question"):
        return {}
    q = await question_for(db)
    if not q:
        return {}
    mine = (await db.execute(select(DailyQuestionAnswer.optionKey).where(DailyQuestionAnswer.questionId == q.id, DailyQuestionAnswer.userId == user_id))).scalar_one_or_none()
    if mine is None:
        return {}
    rows = (await db.execute(select(DailyQuestionAnswer.userId, DailyQuestionAnswer.optionKey).where(DailyQuestionAnswer.questionId == q.id, DailyQuestionAnswer.userId.in_(target_ids)))).all()
    return {uid: {"optionKey": k, "same": k == mine} for uid, k in rows}


# ───────── administration ─────────
def _clean_options(raw: list[dict]) -> list[dict]:
    pairs = [(o["fr"].strip(), o["en"].strip()) for o in raw]
    if not 2 <= len(pairs) <= 4 or any(not fr or not en for fr, en in pairs) or len({fr.lower() for fr, _ in pairs}) != len(pairs):
        raise bad_request("INVALID_OPTIONS", "De 2 à 4 choix distincts, en français et en anglais")
    return make_options(pairs)


async def admin_list(db: AsyncSession) -> list[dict]:
    counts: dict[tuple[str, str], int] = {(q, k): n for q, k, n in (await db.execute(select(DailyQuestionAnswer.questionId, DailyQuestionAnswer.optionKey, func.count()).group_by(DailyQuestionAnswer.questionId, DailyQuestionAnswer.optionKey))).all()}
    qs = (await db.execute(select(DailyQuestion).order_by(DailyQuestion.day.desc().nulls_last(), DailyQuestion.createdAt.desc()))).scalars().all()
    cur = await question_for(db)
    out = []
    for q in qs:
        per = {o["key"]: counts.get((q.id, o["key"]), 0) for o in q.options}
        out.append({**question_dict(q), "day": q.day.isoformat() if q.day else None, "active": q.active, "answers": sum(per.values()), "perOption": per, "isToday": bool(cur and cur.id == q.id)})
    return out


async def admin_create(db: AsyncSession, data: dict) -> DailyQuestion:
    q = DailyQuestion(day=data.get("day"), textFr=data["textFr"], textEn=data["textEn"], options=_clean_options(data["options"]), active=data.get("active", True))
    if q.day and (await db.execute(select(DailyQuestion.id).where(DailyQuestion.day == q.day))).first():
        raise conflict("DAY_TAKEN", "Une question est déjà prévue ce jour-là.")
    db.add(q)
    await db.commit()
    return q


async def admin_patch(db: AsyncSession, qid: str, data: dict) -> DailyQuestion:
    q = await db.get(DailyQuestion, qid)
    if not q:
        raise not_found("DAILY_QUESTION_NOT_FOUND")
    if "options" in data and data["options"] is not None:
        answered = (await db.execute(select(func.count()).select_from(DailyQuestionAnswer).where(DailyQuestionAnswer.questionId == qid))).scalar_one()
        if answered:
            raise conflict("QUESTION_ANSWERED", "Des membres ont déjà répondu : les choix ne se modifient plus.")
        q.options = _clean_options(data["options"])
    for k in ("textFr", "textEn", "active"):
        if data.get(k) is not None:
            setattr(q, k, data[k])
    if "day" in data:
        if data["day"] and (await db.execute(select(DailyQuestion.id).where(DailyQuestion.day == data["day"], DailyQuestion.id != qid))).first():
            raise conflict("DAY_TAKEN", "Une question est déjà prévue ce jour-là.")
        q.day = data["day"]
    await db.commit()
    return q


async def admin_delete(db: AsyncSession, qid: str) -> None:
    q = await db.get(DailyQuestion, qid)
    if not q:
        raise not_found("DAILY_QUESTION_NOT_FOUND")
    await db.delete(q)
    await db.commit()


async def stats(db: AsyncSession) -> dict:
    q = await question_for(db)
    if not q:
        return {"todayAnswers": 0, "totalAnswers": 0}
    today_n = (await db.execute(select(func.count()).select_from(DailyQuestionAnswer).where(DailyQuestionAnswer.questionId == q.id))).scalar_one()
    total = (await db.execute(select(func.count()).select_from(DailyQuestionAnswer))).scalar_one()
    return {"todayAnswers": today_n, "totalAnswers": total}

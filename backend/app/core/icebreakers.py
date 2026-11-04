"""Brise-glace : suggestions de sujets de conversation à partir de ce que les DEUX personnes ont renseigné (centres d'intérêt et intention
communs). Modèles gérés par l'administration (bilingues) ; aucune IA, aucun message envoyé automatiquement, le membre garde la main sur le texte."""
import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import appsettings, chat_service
from app.models.models import IcebreakerTemplate, Interest, Profile, t_UserInterest

DEFAULTS = [  # (slug, kind, key, français, anglais)
    ("music", "INTEREST", "music", "Vous aimez tous les deux la musique. Quel artiste me recommanderais-tu ?", "You both love music. Which artist would you recommend me?"),
    ("cinema", "INTEREST", "cinema", "Vous aimez tous les deux le cinéma. Quel film pourrais-tu revoir cent fois ?", "You both love cinema. Which film could you watch a hundred times?"),
    ("cooking", "INTEREST", "cooking", "Vous aimez tous les deux la cuisine. Quel plat préparerions-nous ensemble ?", "You both love cooking. Which dish would we cook together?"),
    ("travel", "INTEREST", "travel", "Vous aimez tous les deux voyager. Quelle destination choisirais-tu ?", "You both love travelling. Which destination would you choose?"),
    ("sport", "INTEREST", "sport", "Vous aimez tous les deux le sport. Plutôt match à regarder ou activité à pratiquer ?", "You both love sport. Watching a match or playing something?"),
    ("reading", "INTEREST", "reading", "Vous aimez tous les deux la lecture. Quel livre t’a marqué(e) ?", "You both love reading. Which book stayed with you?"),
    ("dance", "INTEREST", "dance", "Vous aimez tous les deux la danse. Quelle musique te donne envie de danser ?", "You both love dancing. Which song makes you want to dance?"),
    ("faith", "INTEREST", "faith", "Vous partagez un intérêt pour la foi. Quelles valeurs comptent le plus pour toi au quotidien ?", "You share an interest in faith. Which values matter most to you day to day?"),
    ("fashion", "INTEREST", "fashion", "Vous aimez tous les deux la mode. Quelle pièce ne quitterais-tu jamais ?", "You both love fashion. Which piece would you never give up?"),
    ("tech", "INTEREST", "tech", "Vous aimez tous les deux la technologie. Quelle invention aimerais-tu voir arriver ?", "You both love technology. Which invention would you like to see?"),
    ("art", "INTEREST", "art", "Vous aimez tous les deux l’art. Quel lieu ou quelle œuvre t’a le plus touché(e) ?", "You both love art. Which place or work moved you the most?"),
    ("nature", "INTEREST", "nature", "Vous aimez tous les deux la nature. Quel est ton endroit préféré pour te ressourcer ?", "You both love nature. Where do you go to recharge?"),
    ("photography", "INTEREST", "photography", "Vous aimez tous les deux la photographie. Quelle est ta photo préférée que tu aies prise ?", "You both love photography. What is your favourite photo you have taken?"),
    ("gaming", "INTEREST", "gaming", "Vous aimez tous les deux les jeux vidéo. Quel jeu te détend le plus ?", "You both love video games. Which game relaxes you the most?"),
    ("entrepreneurship", "INTEREST", "entrepreneurship", "Vous aimez tous les deux entreprendre. Quel projet te fait vibrer en ce moment ?", "You both love entrepreneurship. Which project excites you right now?"),
    ("family", "INTEREST", "family", "La famille compte pour vous deux. Quel souvenir de famille te fait sourire ?", "Family matters to you both. Which family memory makes you smile?"),
    ("intent-serious", "INTENT", "SERIOUS", "Vous cherchez tous les deux une relation sérieuse. Qu’est-ce qui compte le plus pour toi dans un couple ?", "You are both looking for something serious. What matters most to you in a couple?"),
    ("intent-marriage", "INTENT", "MARRIAGE", "Vous pensez tous les deux au mariage. Comment imagines-tu la vie à deux ?", "You are both thinking about marriage. How do you picture life together?"),
    ("intent-dating", "INTENT", "DATING", "Vous voulez tous les deux faire des rencontres. Quel serait ton rendez-vous idéal ?", "You both want to meet people. What would your ideal date be?"),
    ("intent-friendship", "INTENT", "FRIENDSHIP", "Vous cherchez tous les deux de l’amitié. Qu’est-ce qui fait un(e) bon(ne) ami(e) pour toi ?", "You are both looking for friendship. What makes a good friend for you?"),
    ("intent-unsure", "INTENT", "UNSURE", "Vous prenez tous les deux le temps de voir venir. Qu’est-ce qui te donne envie de continuer une conversation ?", "You are both taking your time. What makes you want to keep a conversation going?"),
    ("generic-weekend", "GENERIC", None, "Quel est ton week-end idéal ?", "What does your ideal weekend look like?"),
    ("generic-learn", "GENERIC", None, "Quelle chose as-tu apprise récemment qui t’a surpris(e) ?", "What did you learn recently that surprised you?"),
    ("generic-day", "GENERIC", None, "Qu’est-ce qui a rendu ta journée meilleure aujourd’hui ?", "What made your day better today?"),
]


async def ensure_defaults(db: AsyncSession) -> None:
    """Crée le catalogue initial si la table est vide ; ne touche jamais à ce que l'administration a modifié ou supprimé."""
    if (await db.execute(select(IcebreakerTemplate.id).limit(1))).first():
        return
    for i, (slug, kind, key, fr, en) in enumerate(DEFAULTS):
        db.add(IcebreakerTemplate(slug=slug, kind=kind, key=key, textFr=fr, textEn=en, sortOrder=i))
    await db.commit()


def template_dict(t: IcebreakerTemplate) -> dict:
    return {"id": t.id, "slug": t.slug, "kind": t.kind, "key": t.key, "textFr": t.textFr, "textEn": t.textEn, "active": t.active, "sortOrder": t.sortOrder}


async def _profile_facts(db: AsyncSession, user_id: str) -> tuple[str, set[str]]:
    intent = (await db.execute(select(Profile.intent).where(Profile.userId == user_id))).scalar_one()
    slugs = set((await db.execute(select(Interest.slug).join(t_UserInterest, t_UserInterest.c.interestId == Interest.id).where(t_UserInterest.c.userId == user_id))).scalars())
    return getattr(intent, "value", intent), slugs


async def suggestions(db: AsyncSession, user_id: str, conversation_id: str, seed: int = 0, locale: str = "fr") -> dict:
    """Quelques sujets (nombre = réglage `icebreakers.count`), toujours déduits d'éléments communs ; `seed` varie la sélection (« autres idées »)."""
    conv, other_id, _ = await chat_service.membership(db, user_id, conversation_id)
    mine_intent, mine = await _profile_facts(db, user_id)
    their_intent, theirs = await _profile_facts(db, other_id)
    common = mine & theirs
    templates = (await db.execute(select(IcebreakerTemplate).where(IcebreakerTemplate.active.is_(True)).order_by(IcebreakerTemplate.sortOrder, IcebreakerTemplate.createdAt))).scalars().all()
    specific = [t for t in templates if (t.kind == "INTEREST" and t.key in common) or (t.kind == "INTENT" and mine_intent == their_intent and t.key == mine_intent)]
    generic = [t for t in templates if t.kind == "GENERIC"]
    n = await appsettings.get(db, "icebreakers.count")
    rng = random.Random(f"{conversation_id}:{seed}")
    rng.shuffle(specific)
    rng.shuffle(generic)
    picked = (specific + generic)[:n]  # les sujets communs d'abord, complétés par des sujets neutres
    text = (lambda t: t.textEn) if locale == "en" else (lambda t: t.textFr)
    return {"items": [{"id": t.id, "kind": t.kind, "text": text(t)} for t in picked], "basedOn": {"commonInterests": sorted(common), "sameIntent": mine_intent == their_intent}}

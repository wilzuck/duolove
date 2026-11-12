"""Résumé hebdomadaire par e-mail : « votre semaine sur Crushduo » (personnes qui ont vu votre profil, likes en attente, nouveaux duos, messages non lus).

Règles :
- **Consentement** : seulement les membres qui ont accepté les offres (`marketingConsent`) ET gardé la case « résumé hebdomadaire » (`emailWeekly`, activée par défaut). Le lien de
  désabonnement de l'e-mail coupe les deux. C'est une communication d'engagement, pas une alerte de sécurité.
- **Utile ou rien** : pas d'e-mail s'il n'y a rien à dire cette semaine ; pas d'e-mail aux membres inactifs depuis plus de 60 jours (réputation d'envoi).
- **Un seul par semaine** : dimanche entre 17 h et 23 h UTC (= 17 h au Bénin, au Togo, en Côte d'Ivoire, au Sénégal, au Burkina…), réservé par un UPDATE conditionnel (jamais deux fois, même avec deux instances).
- **Gratuit : comptes seulement** (le nom des visiteurs reste réservé à Premium/VIP, comme dans l'application) ; une phrase invite à passer Premium."""
from __future__ import annotations

import asyncio
import datetime
import logging

from sqlalchemy import exists, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import entitlements, live_events, mail
from app.core.ids import utcnow
from app.models.models import Block, Conversation, Match, Message, NotificationPreference, Profile, ProfileVisit, Swipe, User

log = logging.getLogger("digest")

WINDOW = datetime.timedelta(days=7)
MIN_GAP = datetime.timedelta(days=6)
INACTIVE_AFTER = datetime.timedelta(days=60)
SEND_WEEKDAY, SEND_FROM_HOUR, SEND_TO_HOUR = 6, 17, 23  # dimanche, 17 h inclus à 23 h exclu (UTC)
BATCH = 100


def in_send_window(now: datetime.datetime) -> bool:
    return now.weekday() == SEND_WEEKDAY and SEND_FROM_HOUR <= now.hour < SEND_TO_HOUR


async def collect(db: AsyncSession, user_ids: list[str], since: datetime.datetime) -> dict[str, dict]:
    """Chiffres de la semaine pour plusieurs membres, en requêtes groupées (jamais une requête par membre et par chiffre)."""
    out = {u: {"visits": 0, "likes": 0, "duos": 0, "unread": 0} for u in user_ids}
    if not user_ids:
        return out
    # Visites : personnes DIFFÉRENTES qui ont consulté le profil (visiteurs actifs, ni bloqués ni bloquants).
    rows = (await db.execute(
        select(ProfileVisit.visitedId, func.count()).join(User, User.id == ProfileVisit.viewerId)
        .where(ProfileVisit.visitedId.in_(user_ids), ProfileVisit.lastVisitAt >= since, User.status == "ACTIVE",
               ~exists().where(Block.blockerId == ProfileVisit.visitedId, Block.blockedId == ProfileVisit.viewerId),
               ~exists().where(Block.blockerId == ProfileVisit.viewerId, Block.blockedId == ProfileVisit.visitedId))
        .group_by(ProfileVisit.visitedId))).all()
    for uid, n in rows:
        out[uid]["visits"] = n
    # Likes en attente : reçus cette semaine, auxquels le membre n'a pas encore répondu (pas de like/pass en retour).
    mine = Swipe.__table__.alias("mine")
    rows = (await db.execute(
        select(Swipe.targetId, func.count()).join(User, User.id == Swipe.giverId)
        .where(Swipe.targetId.in_(user_ids), Swipe.action.in_(["LIKE", "SUPER_LIKE"]), Swipe.createdAt >= since, User.status == "ACTIVE",
               ~exists().where(mine.c.giverId == Swipe.targetId, mine.c.targetId == Swipe.giverId),
               ~exists().where(Block.blockerId == Swipe.targetId, Block.blockedId == Swipe.giverId))
        .group_by(Swipe.targetId))).all()
    for uid, n in rows:
        out[uid]["likes"] = n
    # Nouveaux duos de la semaine.
    for col in (Match.userAId, Match.userBId):
        rows = (await db.execute(select(col, func.count()).where(col.in_(user_ids), Match.status == "ACTIVE", Match.createdAt >= since).group_by(col))).all()
        for uid, n in rows:
            out[uid]["duos"] += n
    # Conversations avec au moins un message non lu de l'autre personne.
    for col in (Match.userAId, Match.userBId):
        rows = (await db.execute(
            select(col, func.count(func.distinct(Conversation.id))).select_from(Match).join(Conversation, Conversation.matchId == Match.id).join(Message, Message.conversationId == Conversation.id)
            .where(col.in_(user_ids), Match.status == "ACTIVE", Message.senderId != col, Message.readAt.is_(None), Message.deletedAt.is_(None)).group_by(col))).all()
        for uid, n in rows:
            out[uid]["unread"] += n
    return out


def has_news(c: dict) -> bool:
    return any(c[k] for k in ("visits", "likes", "duos", "unread"))


async def _claim(db: AsyncSession, now: datetime.datetime) -> list[tuple[str, str, str]]:
    """Réserve un lot de membres éligibles (UPDATE conditionnel) : (id, e-mail, prénom). Deux instances ne réservent jamais le même membre."""
    eligible = (select(NotificationPreference.userId).join(User, User.id == NotificationPreference.userId)
                .where(User.status == "ACTIVE", User.emailVerifiedAt.is_not(None), User.marketingConsent.is_(True), NotificationPreference.emailWeekly.is_(True),
                       User.lastActiveAt >= now - INACTIVE_AFTER, User.email.is_not(None),
                       or_(NotificationPreference.lastDigestAt.is_(None), NotificationPreference.lastDigestAt < now - MIN_GAP))
                .order_by(NotificationPreference.userId).limit(BATCH))
    ids = (await db.execute(update(NotificationPreference).where(NotificationPreference.userId.in_(eligible)).values(lastDigestAt=now).returning(NotificationPreference.userId))).scalars().all()
    await db.commit()
    if not ids:
        return []
    rows = (await db.execute(select(User.id, User.email, Profile.displayName).join(Profile, Profile.userId == User.id, isouter=True).where(User.id.in_(ids)))).all()
    return [(r[0], r[1], r[2] or "") for r in rows]


async def run_once(db: AsyncSession, now: datetime.datetime | None = None) -> int:
    """Envoie un lot ; renvoie le nombre de résumés envoyés (0 = plus personne à traiter OU rien à dire à ce lot)."""
    now = now or utcnow()
    batch = await _claim(db, now)
    if not batch:
        return -1  # plus personne d'éligible
    stats = await collect(db, [b[0] for b in batch], now - WINDOW)
    sent = 0
    for uid, email, name in batch:
        c = stats[uid]
        if not has_news(c):
            continue
        try:
            can_see = (await entitlements.get(db, uid))["limits"]["seeLikers"]
            nxt = (await live_events.upcoming(db, uid, 1))["events"]
            event = {"title": nxt[0]["title"], "startsAt": nxt[0]["startsAt"]} if nxt else None
            if await mail.send_weekly_digest(email, name, uid, c, premium=bool(can_see), event=event):
                sent += 1
        except Exception:  # noqa: BLE001 — un échec ne doit pas empêcher les autres membres
            log.exception("Résumé hebdomadaire pour %s", uid)
    return sent


async def run_all(db: AsyncSession, now: datetime.datetime | None = None) -> int:
    total = 0
    while True:
        n = await run_once(db, now)
        if n < 0:
            return total
        total += n


async def sweep_loop(maker, every: float = 600.0) -> None:
    while True:
        try:
            if in_send_window(utcnow()):
                async with maker() as db:
                    n = await run_all(db)
                    if n:
                        log.info("résumés hebdomadaires envoyés : %s", n)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("Balayage du résumé hebdomadaire")
        await asyncio.sleep(every)

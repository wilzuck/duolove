"""Garantie Duo : remplace le remboursement sans sortir d'argent. Un abonné payant qui n'a obtenu AUCUN duo pendant `guarantee.window_days` jours alors que
son profil est complet et qu'il a envoyé au moins `guarantee.min_likes` likes reçoit `guarantee.days` jours ajoutés à son abonnement.

Désactivée par défaut (`guarantee.enabled` = 0, réglable en administration). Une même personne ne reçoit pas deux fois les jours pour la même période :
la fenêtre repart de la date de l'abonnement ou du dernier octroi. Jamais de jours pour un compte suspendu ou supprimé."""
from __future__ import annotations

import asyncio
import datetime
import logging

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import appsettings, notifications
from app.core.ids import utcnow
from app.models.models import DuoGuaranteeGrant, Entitlement, Match, Profile, Subscription, SubscriptionStatus, Swipe, User

log = logging.getLogger("duomatch.guarantee")


async def _grant(db: AsyncSession, sub: Subscription, cfg: dict, now: datetime.datetime) -> bool:
    window = datetime.timedelta(days=cfg["guarantee.window_days"])
    last = (await db.execute(select(func.max(DuoGuaranteeGrant.createdAt)).where(DuoGuaranteeGrant.userId == sub.userId))).scalar_one()
    start = max(sub.createdAt, last) if last else sub.createdAt
    if start > now - window:
        return False  # la période n'est pas écoulée
    user = await db.get(User, sub.userId)
    if not user or user.status != "ACTIVE" or (user.suspendedUntil and user.suspendedUntil > now):
        return False
    prof = (await db.execute(select(Profile).where(Profile.userId == sub.userId))).scalar_one_or_none()
    if not prof or prof.completeness < 80:
        return False  # profil non complet : la garantie suppose qu'on a joué le jeu
    likes = (await db.execute(select(func.count()).select_from(Swipe).where(Swipe.giverId == sub.userId, Swipe.action.in_(["LIKE", "SUPER_LIKE"]), Swipe.createdAt >= start))).scalar_one()
    if likes < cfg["guarantee.min_likes"]:
        return False
    duos = (await db.execute(select(func.count()).select_from(Match).where(or_(Match.userAId == sub.userId, Match.userBId == sub.userId), Match.createdAt >= start))).scalar_one()
    if duos:
        return False
    days = cfg["guarantee.days"]
    sub.currentPeriodEnd = (sub.currentPeriodEnd or now) + datetime.timedelta(days=days)
    ent = (await db.execute(select(Entitlement).where(Entitlement.userId == sub.userId))).scalar_one_or_none()
    if ent and ent.plan != "FREE":
        ent.validUntil = sub.currentPeriodEnd  # les droits suivent la date de fin de l'abonnement
    db.add(DuoGuaranteeGrant(userId=sub.userId, subscriptionId=sub.id, days=days, likesSent=likes))
    await db.commit()
    await notifications.create(db, sub.userId, "DUO_GUARANTEE", {"days": days})
    return True


async def run_all(db: AsyncSession, now: datetime.datetime | None = None) -> int:
    """Octroie les jours dus ; renvoie le nombre de membres concernés (0 si la garantie est désactivée)."""
    now = now or utcnow()
    cfg = await appsettings.all_values(db)
    if not cfg["guarantee.enabled"]:
        return 0
    rows = (await db.execute(select(Subscription).where(Subscription.status == SubscriptionStatus.ACTIVE, Subscription.currentPeriodEnd > now).order_by(Subscription.currentPeriodEnd.desc()))).scalars().all()
    seen, n = set(), 0
    for sub in rows:
        if sub.userId in seen:
            continue  # une seule période (la plus longue) par membre
        seen.add(sub.userId)
        if await _grant(db, sub, cfg, now):
            n += 1
    return n


async def sweep_loop(maker, every: float = 3600.0) -> None:
    while True:
        try:
            async with maker() as db:
                n = await run_all(db)
                if n:
                    log.info("garantie Duo : %s membre(s) ont reçu des jours", n)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("Balayage de la garantie Duo")
        await asyncio.sleep(every)

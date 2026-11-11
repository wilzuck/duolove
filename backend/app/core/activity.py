"""Statut d'activité des personnes avec qui l'on a un match : « en ligne », « actif aujourd'hui », « actif cette semaine ».

Règles (voir docs/STATUS.md) :
- Tout le monde voit le statut approximatif des personnes avec qui il a un match (confiance et réponses plus rapides).
- Premium et VIP (filtres avancés) le voient aussi sur les profils de la découverte, avant tout match : palier arrondi seulement (jamais d'heure exacte hors « mode discret »).
- Un membre peut ne pas l'afficher (`Profile.showActivity`) ; il ne voit alors celui des autres que s'il a la formule « mode discret » (`limits.incognito`).
- Le mode discret (`Profile.incognito`) masque aussi le statut de celui qui l'active.
- L'heure exacte de dernière activité n'est donnée qu'aux formules « mode discret » : les autres n'ont que le palier.
"""
import datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import entitlements, realtime
from app.core.ids import utcnow
from app.models.models import Match, Profile, User

ONLINE_WINDOW = datetime.timedelta(minutes=5)


def tier(last: datetime.datetime | None, now: datetime.datetime, connected: bool) -> str | None:
    if connected or (last and now - last <= ONLINE_WINDOW):
        return "online"
    if last and now - last < datetime.timedelta(days=1):
        return "today"
    if last and now - last < datetime.timedelta(days=7):
        return "week"
    return None


async def statuses(db: AsyncSession, viewer_id: str, ids: list[str]) -> dict[str, dict]:
    """État de chaque personne demandée : celles avec qui le demandeur a un match actif, et toutes les autres pour les formules à filtres avancés (Premium, VIP)."""
    ids = list(dict.fromkeys(ids))[:50]
    if not ids:
        return {}
    ent = await entitlements.get(db, viewer_id)
    if ent["limits"]["advancedFilters"]:
        matched = set(ids)
    else:
        matched = {
            (m.userBId if m.userAId == viewer_id else m.userAId)
            for m in (await db.execute(select(Match).where(Match.status == "ACTIVE", or_(Match.userAId == viewer_id, Match.userBId == viewer_id)))).scalars()
        } & set(ids)
    matched.discard(viewer_id)
    if not matched:
        return {}
    discreet = bool(ent["limits"]["incognito"])
    mine = (await db.execute(select(Profile.showActivity).where(Profile.userId == viewer_id))).scalar_one_or_none()
    if not (mine or discreet):  # ne rien montrer pour ne rien recevoir : le statut est réciproque, sauf pour les formules « mode discret »
        return {}
    rows = (await db.execute(
        select(Profile.userId, Profile.showActivity, Profile.incognito, User.lastActiveAt).join(User, User.id == Profile.userId).where(Profile.userId.in_(matched), User.status == "ACTIVE")
    )).all()
    now, connected = utcnow(), set(realtime.online_ids())
    out: dict[str, dict] = {}
    for uid, show, incog, last in rows:
        if not show or incog:
            continue
        t = tier(last, now, uid in connected)
        if t:
            out[uid] = {"state": t, "lastSeenAt": last if discreet and t != "online" else None}
    return out

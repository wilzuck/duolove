"""Administration : modération, finances, offres, codes promo, flags, audit. Rôle minimal MODERATOR ; ADMIN / SUPER_ADMIN selon la route."""
from __future__ import annotations

import asyncio
import datetime

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, distinct, func, inspect as sa_inspect, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import entitlements, flags as flagsvc
from app.core import notifications, payments, plan_config, promo, refunds, storage, storage_config
from app.core.auth import AuthUser, has_role, require_role
from app.core.constants import FEATURE_FLAGS
from app.core.config import get_settings
from app.core.errors import AppError, bad_request, forbidden, not_found
from app.core.ids import utcnow
from app.core.profile_card import thumb_key
from app.db.session import get_db
from app.models.models import (
    AppInstall, AuditLog, ContactMessage, Conversation, Entitlement, FeatureFlag, Match, Message, ModerationAction, Payment, PlanPrice, Preference, Product, Profile, ProfilePhoto,
    PromoCode, Refund, Report, Session, Subscription, SubscriptionPlan, Swipe, SystemSetting, User, VerificationRequest,
)
from app.schemas.admin import (
    FlagSet, PlanGrant, PlanPatch, ProductPatch, PromoCreate, PromoPatch, ReasonOnly, RefundApprove, RefundCreate, RefundReject, ResolveReport,
    Review, RoleChange, Sanction,
)

router = APIRouter(prefix="/admin", tags=["admin"])
public_router = APIRouter(tags=["admin"])
MOD, ADM, SUP = Depends(require_role("MODERATOR")), Depends(require_role("ADMIN")), Depends(require_role("SUPER_ADMIN"))
ev = payments.ev
DAY = datetime.timedelta(days=1)


def resolve_period(days: int, date_from: str | None, date_to: str | None, allowed: tuple[int, ...], now: datetime.datetime) -> tuple[int, datetime.datetime]:
    """Période d'un tableau de bord : `days` parmi `allowed` (défaut 30, aujourd'hui inclus) ou dates `from`/`to` (AAAA-MM-JJ, bornes incluses, 366 jours au plus, pas dans le futur).
    Renvoie (nombre de jours, minuit UTC du premier jour) ; la fin est `début + jours`."""
    if date_from or date_to:
        try:
            first, last = datetime.date.fromisoformat(date_from or ""), datetime.date.fromisoformat(date_to or "")
        except ValueError:
            raise bad_request("INVALID_PERIOD", "Dates attendues au format AAAA-MM-JJ") from None
        if first > last or last > now.date() or (last - first).days + 1 > 366:
            raise bad_request("INVALID_PERIOD", "Période invalide : début avant fin, fin au plus aujourd'hui, 366 jours au plus")
        return (last - first).days + 1, datetime.datetime.combine(first, datetime.time.min)
    days = days if days in allowed else 30
    return days, now.replace(hour=0, minute=0, second=0, microsecond=0) - (days - 1) * DAY


def page(limit: str | None) -> int:
    try:
        n = int(limit or "25")
    except ValueError:
        n = 25
    return min(max(n or 25, 1), 100)


def iso(d):
    return d.isoformat(timespec="milliseconds") + "Z" if d else None


def to_dict(obj) -> dict:
    """Toutes les colonnes d'une ligne (noms d'attributs), valeurs enum converties en chaîne."""
    return {a.key: ev(getattr(obj, a.key)) for a in sa_inspect(obj).mapper.column_attrs}


async def after_cursor(db: AsyncSession, q, model, cursor: str | None, *, desc: bool = True):
    """Pagination par curseur sur (createdAt, id) : lignes strictement après la ligne `cursor` dans l'ordre demandé."""
    if cursor:
        c = await db.get(model, cursor)
        if c:
            if desc:
                q = q.where(or_(model.createdAt < c.createdAt, and_(model.createdAt == c.createdAt, model.id < c.id)))
            else:
                q = q.where(or_(model.createdAt > c.createdAt, and_(model.createdAt == c.createdAt, model.id > c.id)))
    return q


def paged(rows, take: int, items: list) -> dict:
    return {"items": items, "nextCursor": rows[take - 1].id if len(rows) > take else None}


async def audit(db: AsyncSession, actor_id: str, action: str, target_type: str | None = None, target_id: str | None = None, metadata: dict | None = None):
    db.add(AuditLog(actorId=actor_id, action=action, targetType=target_type, targetId=target_id, metadata_=metadata or {}))
    await db.commit()


async def _display_names(db: AsyncSession, ids) -> dict[str, str]:
    ids = list({i for i in ids if i})
    if not ids:
        return {}
    return dict((await db.execute(select(Profile.userId, Profile.displayName).where(Profile.userId.in_(ids)))).all())


# ───────── Vue d'ensemble ─────────
# Séries par jour (zéro si aucun événement) : table, colonne et filtre sont des constantes de ce module, jamais une saisie.
_SERIES = {
    "signups": ('"User"', '"createdAt"', "COUNT(*)", "TRUE"),
    "likes": ('"Swipe"', '"createdAt"', "COUNT(*)", "\"action\" IN ('LIKE','SUPER_LIKE')"),
    "matches": ('"Match"', '"createdAt"', "COUNT(*)", "TRUE"),
    "messages": ('"Message"', '"createdAt"', "COUNT(*)", "TRUE"),
    "revenue": ('"Payment"', '"paidAt"', 'COALESCE(SUM("amountXof"),0)', "\"status\" = 'SUCCEEDED'"),
}


# Séries supplémentaires de la page Statistiques (mêmes règles : constantes du module, jamais une saisie).
_STATS_SERIES = {
    **_SERIES,
    "passes": ('"Swipe"', '"createdAt"', "COUNT(*)", "\"action\" = 'PASS'"),
    "crushSearches": ('"LiveSearch"', '"createdAt"', "COUNT(*)", "TRUE"),
    "crushInvites": ('"LiveInvite"', '"createdAt"', "COUNT(*)", "TRUE"),
    "crushAccepted": ('"LiveInvite"', '"respondedAt"', "COUNT(*)", "\"status\" IN ('ACCEPTED','CHOSEN')"),
    "subscriptions": ('"Subscription"', '"createdAt"', "COUNT(*)", "\"status\" <> 'PENDING'"),
    "installs": ('"AppInstall"', '"createdAt"', "COUNT(*)", "TRUE"),
}


async def _series(db: AsyncSession, key: str, days: int, start: datetime.datetime) -> list[dict]:
    """Valeur par jour calendaire UTC à partir de `start` (minuit UTC du premier jour) : même définition que les totaux, quel que soit le fuseau de la base."""
    table, col, agg, where = _STATS_SERIES[key]
    rows = (await db.execute(text(
        f"SELECT g::date AS day, COALESCE(c.n, 0)::bigint AS n FROM generate_series(CAST(:start AS timestamp), CAST(:start AS timestamp) + (:d - 1) * interval '1 day', interval '1 day') g "
        f"LEFT JOIN (SELECT date_trunc('day', {col}) AS d, {agg} AS n FROM {table} WHERE {col} >= CAST(:start AS timestamp) AND {where} GROUP BY 1) c ON c.d = g ORDER BY 1"), {"d": days, "start": start})).all()
    return [{"day": r.day.isoformat(), "value": int(r.n)} for r in rows]


@router.get("/overview")
async def overview(days: int = Query(30), date_from: str | None = Query(None, alias="from"), date_to: str | None = Query(None, alias="to"), _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Vue d'ensemble. `days` (7, 30 ou 90) ou les dates `from` et `to` fixent la période ; `period` compare la période courante à la précédente, avec une série par jour."""
    now = utcnow()
    days, start = resolve_period(days, date_from, date_to, (7, 30, 90), now)
    d = lambda n: now - n * DAY  # noqa: E731

    async def count(model, *where):
        return (await db.execute(select(func.count()).select_from(model).where(*where))).scalar_one()

    async def total(*where):
        return (await db.execute(select(func.coalesce(func.sum(Payment.amountXof), 0)).where(*where))).scalar_one()

    users = await count(User, User.status != "DELETED")
    paid = (await db.execute(select(func.count(distinct(Payment.userId))).where(Payment.status == "SUCCEEDED"))).scalar_one()
    cohort = await count(User, User.createdAt >= d(30), User.createdAt < d(7))
    cohort_active = await count(User, User.createdAt >= d(30), User.createdAt < d(7), User.lastActiveAt >= d(7))
    series = (await db.execute(text('SELECT date_trunc(\'day\', "createdAt") AS day, COUNT(*)::bigint AS count FROM "User" WHERE "createdAt" > now() - interval \'14 days\' GROUP BY 1 ORDER BY 1'))).all()
    plans = (await db.execute(select(Entitlement.plan, func.count()).group_by(Entitlement.plan))).all()
    recent = (await db.execute(select(User).where(User.status != "DELETED").order_by(User.createdAt.desc()).limit(8))).scalars().all()
    profiles = {p.userId: p for p in (await db.execute(select(Profile).where(Profile.userId.in_([u.id for u in recent])))).scalars()}
    by_country = (await db.execute(select(Profile.country, func.count().label("n")).group_by(Profile.country).order_by(func.count().desc()).limit(6))).all()
    refunded = (await db.execute(select(func.coalesce(func.sum(Refund.amountXof), 0)).where(Refund.status == "COMPLETED"))).scalar_one()

    end = start + days * DAY  # exclue : la période se termine à la fin de son dernier jour

    async def flow(model, col, *where, summed=None):
        """Valeur sur la période courante et sur la précédente (même durée, juste avant)."""
        agg = func.coalesce(func.sum(summed), 0) if summed is not None else func.count()
        # Mêmes jours calendaires (UTC) que le graphique par jour : le total d'un indicateur est toujours égal à la somme de sa courbe.
        cur = (await db.execute(select(agg).select_from(model).where(col >= start, col < end, *where))).scalar_one()
        prev = (await db.execute(select(agg).select_from(model).where(col >= start - days * DAY, col < start, *where))).scalar_one()
        return {"current": int(cur), "previous": int(prev)}

    period = {
        "days": days, "from": start.date().isoformat(), "to": (end - DAY).date().isoformat(),
        "signups": await flow(User, User.createdAt),
        "likes": await flow(Swipe, Swipe.createdAt, Swipe.action.in_(["LIKE", "SUPER_LIKE"])),
        "matches": await flow(Match, Match.createdAt),
        "messages": await flow(Message, Message.createdAt),
        "revenue": await flow(Payment, Payment.paidAt, Payment.status == "SUCCEEDED", summed=Payment.amountXof),
        "series": {k: await _series(db, k, days, start) for k in _SERIES},
    }
    return {
        "period": period, "generatedAt": now,
        "planDistribution": [{"plan": ev(p), "count": c} for p, c in plans],
        "recentSignups": [{"id": u.id, "displayName": profiles[u.id].displayName if u.id in profiles else "—", "city": profiles[u.id].city if u.id in profiles else "",
                           "country": profiles[u.id].country if u.id in profiles else "", "createdAt": u.createdAt} for u in recent],
        "refundedXof": refunded, "topCountries": [{"country": c, "count": n} for c, n in by_country],
        "users": users, "signups7": await count(User, User.createdAt >= d(7)), "signups30": await count(User, User.createdAt >= d(30)),
        "active7": await count(User, User.lastActiveAt >= d(7), User.status == "ACTIVE"), "profilesCompleted": await count(Profile, Profile.completeness >= 80),
        "likes": await count(Swipe, Swipe.action.in_(["LIKE", "SUPER_LIKE"])), "matches": await count(Match),
        "activeConversations": await count(Conversation, Conversation.lastMessageAt >= d(7)), "activeSubscriptions": await count(Subscription, Subscription.status == "ACTIVE"),
        "revenueXof": await total(Payment.status == "SUCCEEDED"), "revenue30dXof": await total(Payment.status == "SUCCEEDED", Payment.paidAt >= d(30)),
        "conversionRate": round(paid / users * 1000) / 10 if users else 0, "retentionD7": round(cohort_active / cohort * 1000) / 10 if cohort else 0,
        "signupsPerDay": [{"day": r.day.date().isoformat(), "count": int(r.count)} for r in series],
    }


@router.get("/stats")
async def stats(days: int = Query(30), date_from: str | None = Query(None, alias="from"), date_to: str | None = Query(None, alias="to"), _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Évolution dans le temps : une série par jour (jours calendaires UTC) et le total comparé à la période précédente, pour chaque indicateur.
    Période : `days` (7, 30, 90, 180, 365) ou dates `from` et `to` (AAAA-MM-JJ, bornes incluses, 366 jours au plus, pas dans le futur) ; la comparaison porte sur la période de même durée juste avant."""
    now = utcnow()
    days, start = resolve_period(days, date_from, date_to, (7, 30, 90, 180, 365), now)
    series = {k: await _series(db, k, days, start) for k in _STATS_SERIES}
    flows = {}
    for k, pts in series.items():
        table, col, agg, where = _STATS_SERIES[k]
        prev = (await db.execute(text(f"SELECT {agg} FROM {table} WHERE {col} >= CAST(:a AS timestamp) AND {col} < CAST(:b AS timestamp) AND {where}"), {"a": start - days * DAY, "b": start})).scalar_one()
        flows[k] = {"current": sum(p["value"] for p in pts), "previous": int(prev)}
    before = (await db.execute(select(func.count()).select_from(User).where(User.createdAt < start, User.status != "DELETED"))).scalar_one()
    run, members = before, []
    for p in series["signups"]:
        run += p["value"]
        members.append({"day": p["day"], "value": run})
    series["members"] = members
    plans = (await db.execute(select(Entitlement.plan, func.count()).group_by(Entitlement.plan))).all()
    by_platform = dict((await db.execute(select(AppInstall.platform, func.count()).group_by(AppInstall.platform))).all())
    sent = flows["crushInvites"]["current"]
    return {"days": days, "from": start.date().isoformat(), "to": (start + (days - 1) * DAY).date().isoformat(), "generatedAt": now, "series": series, "flows": flows,
            "installs": {"total": sum(by_platform.values()), "ios": by_platform.get("ios", 0), "android": by_platform.get("android", 0), "desktop": by_platform.get("desktop", 0)},
            "totals": {"members": run, "activeSubscriptions": (await db.execute(select(func.count()).select_from(Subscription).where(Subscription.status == "ACTIVE"))).scalar_one()},
            "crushAcceptRate": round(flows["crushAccepted"]["current"] / sent * 1000) / 10 if sent else None,
            "matchRate": round(flows["matches"]["current"] / flows["likes"]["current"] * 1000) / 10 if flows["likes"]["current"] else None,
            "planDistribution": [{"plan": ev(p), "count": c} for p, c in plans]}


@router.get("/stats/health")
async def stats_health(_: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Santé de la plateforme : équilibre hommes/femmes, villes actives et part des membres actifs qui n'ont presque plus de profils à voir (« bassin » trop mince)."""
    now = utcnow()
    since, threshold = now - 7 * DAY, 20
    base = [User.status == "ACTIVE", User.lastActiveAt >= since]
    g = {k: n for k, n in (await db.execute(select(Profile.gender, func.count()).join(User, User.id == Profile.userId).where(*base).group_by(Profile.gender))).all()}
    gender = {"men": g.get("MAN", 0), "women": g.get("WOMAN", 0), "other": sum(n for k, n in g.items() if k not in ("MAN", "WOMAN"))}
    cities = (await db.execute(select(Profile.city, Profile.country, func.count().label("n"), func.count().filter(Profile.gender == "MAN").label("men"), func.count().filter(Profile.gender == "WOMAN").label("women"))
                               .join(User, User.id == Profile.userId).where(*base).group_by(Profile.city, Profile.country).order_by(func.count().desc()).limit(6))).all()
    # Bassin de chaque membre actif = profils actifs de son pays qui correspondent à sa recherche (genre et âge). Calculé par agrégats (pays × genre × âge), pas membre par membre : reste rapide à grande échelle.
    age = func.date_part("year", func.age(Profile.birthDate))
    supply: dict[str, dict[tuple[str, int], int]] = {}
    for country, gen, yrs, n in (await db.execute(select(Profile.country, Profile.gender, age, func.count()).join(User, User.id == Profile.userId).where(*base).group_by(Profile.country, Profile.gender, age))).all():
        supply.setdefault(country, {})[(ev(gen), int(yrs))] = n
    pools: list[tuple[int, int]] = []  # (taille du bassin, nombre de membres concernés)
    for country, seeking, amin, amax, n in (await db.execute(select(Profile.country, Preference.seeking, func.coalesce(Preference.ageMin, text("18")), func.coalesce(Preference.ageMax, text("99")), func.count())
                                                             .join(User, User.id == Profile.userId).outerjoin(Preference, Preference.userId == Profile.userId).where(*base)
                                                             .group_by(Profile.country, Preference.seeking, func.coalesce(Preference.ageMin, text("18")), func.coalesce(Preference.ageMax, text("99"))))).all():
        want = {"MEN": {"MAN"}, "WOMEN": {"WOMAN"}}.get(ev(seeking) if seeking else "EVERYONE")
        pool = sum(c for (gen, yrs), c in supply.get(country, {}).items() if (want is None or gen in want) and amin <= yrs <= amax) - 1  # -1 : le membre lui-même
        pools.append((max(pool, 0), n))
    total = sum(n for _, n in pools)
    pools.sort()
    cum, median = 0, None
    for pool, n in pools:
        cum += n
        if median is None and cum * 2 >= total:
            median = pool
    active = sum(gender.values())
    return {"generatedAt": now, "activeMembers": active, "gender": gender, "threshold": threshold,
            "thinPoolShare": round(sum(n for p, n in pools if p < threshold) / total * 1000) / 10 if total else None, "medianPool": median,
            "topCities": [{"city": c.city, "country": c.country, "active": c.n, "men": c.men, "women": c.women} for c in cities]}


@router.get("/badges")
async def badges(_: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    """Compteurs de travail en attente (pastilles du menu) — modérateurs et plus."""
    async def c(model, *w):
        return (await db.execute(select(func.count()).select_from(model).where(*w))).scalar_one()

    reports, verifs, appeals = await c(Report, Report.status == "OPEN"), await c(VerificationRequest, VerificationRequest.status == "PENDING"), await c(ModerationAction, ModerationAction.appealStatus == "PENDING")
    return {"reports": reports, "moderation": verifs + appeals, "verifications": verifs, "appeals": appeals}


@router.get("/summary")
async def summary(a: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    """Compteurs par section pour les en-têtes de pages (indicateurs et onglets de statut). Les chiffres financiers ne sont donnés qu'aux administrateurs."""
    async def by(col, *where) -> dict:
        rows = (await db.execute(select(col, func.count()).where(*where).group_by(col))).all()
        return {ev(k): int(n) for k, n in rows}

    out = {"users": await by(User.status), "reports": await by(Report.status)}
    out["users"]["total"] = sum(v for k, v in out["users"].items() if k != "DELETED")
    if has_role(a.role, "ADMIN"):
        since = utcnow() - 30 * DAY
        pays = await by(Payment.status, Payment.createdAt >= since)
        revenue = (await db.execute(select(func.coalesce(func.sum(Payment.amountXof), 0)).where(Payment.status == "SUCCEEDED", Payment.paidAt >= since))).scalar_one()
        out.update({"payments": {**pays, "revenue30": int(revenue)}, "subscriptions": await by(Subscription.status), "refunds": await by(Refund.status),
                    "contact": await by(ContactMessage.status)})
    return out


# ───────── Utilisateurs ─────────
@router.get("/users")
async def users(a: AuthUser = MOD, q: str | None = None, status: str | None = None, cursor: str | None = None, limit: str | None = None, db: AsyncSession = Depends(get_db)):
    take = page(limit)
    stmt = select(User).order_by(User.createdAt.desc(), User.id.desc())
    if status in ("ACTIVE", "SUSPENDED", "BANNED", "DELETED"):
        stmt = stmt.where(User.status == status)
    if q:
        conds = [User.id == q, User.id.in_(select(Profile.userId).where(Profile.displayName.ilike(f"%{q}%")))]
        if has_role(a.role, "ADMIN"):
            conds.append(User.email.ilike(f"%{q}%"))
        stmt = stmt.where(or_(*conds))
    stmt = await after_cursor(db, stmt, User, cursor)
    rows = (await db.execute(stmt.limit(take + 1))).scalars().all()
    ids = [u.id for u in rows[:take]]
    profiles = {p.userId: p for p in (await db.execute(select(Profile).where(Profile.userId.in_(ids)))).scalars()}
    plans = dict((await db.execute(select(Entitlement.userId, Entitlement.plan).where(Entitlement.userId.in_(ids)))).all())
    reports = dict((await db.execute(select(Report.targetId, func.count()).where(Report.targetId.in_(ids)).group_by(Report.targetId))).all())
    items = []
    for u in rows[:take]:
        p = profiles.get(u.id)
        items.append({"id": u.id, "displayName": p.displayName if p else "—", "email": u.email if has_role(a.role, "ADMIN") else None, "role": ev(u.role), "status": ev(u.status),
                      "city": p.city if p else None, "country": p.country if p else None, "verified": bool(p and p.verified), "plan": ev(plans.get(u.id, "FREE")),
                      "reports": reports.get(u.id, 0), "createdAt": u.createdAt, "lastActiveAt": u.lastActiveAt})
    return paged(rows, take, items)


@router.get("/users/{user_id}")
async def user(user_id: str, a: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    u = await db.get(User, user_id)
    if not u:
        raise not_found("USER_NOT_FOUND")
    p = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one_or_none()
    photos = (await db.execute(select(ProfilePhoto).where(ProfilePhoto.profileId == p.id))).scalars().all() if p else []
    mods = (await db.execute(select(ModerationAction).where(ModerationAction.targetUserId == user_id).order_by(ModerationAction.createdAt.desc()).limit(20))).scalars().all()
    reps = (await db.execute(select(Report).where(Report.targetId == user_id).order_by(Report.createdAt.desc()).limit(20))).scalars().all()
    ent = await entitlements.get(db, user_id)
    return {
        "id": u.id, "email": u.email if has_role(a.role, "ADMIN") else None, "role": ev(u.role), "status": ev(u.status), "suspendedUntil": u.suspendedUntil,
        "createdAt": u.createdAt, "lastActiveAt": u.lastActiveAt, "emailVerified": bool(u.emailVerifiedAt), "plan": ent["plan"], "planValidUntil": ent["validUntil"],
        "profile": {"displayName": p.displayName, "bio": p.bio, "city": p.city, "country": p.country, "gender": ev(p.gender), "verified": p.verified, "completeness": p.completeness,
                    "photos": [{"id": x.id, "url": f"/api/media/{x.key}", "status": ev(x.moderationStatus)} for x in photos]} if p else None,
        "moderation": [to_dict(m) for m in mods], "reports": [to_dict(r) for r in reps],
    }


async def guard_target(db: AsyncSession, actor: AuthUser, target_id: str) -> User:
    """Un modérateur ne peut pas sanctionner un rôle égal ou supérieur, ni lui-même."""
    t = await db.get(User, target_id)
    if not t:
        raise not_found("USER_NOT_FOUND")
    if t.id == actor.id or (ev(t.role) != "USER" and not has_role(actor.role, "SUPER_ADMIN")):
        raise forbidden("CANNOT_SANCTION_STAFF")
    return t


@router.post("/users/{user_id}/suspend")
async def suspend(user_id: str, body: Sanction, a: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    u = await guard_target(db, a, user_id)
    until = utcnow() + (body.days or 7) * DAY
    u.status, u.suspendedUntil = "SUSPENDED", until
    db.add(ModerationAction(moderatorId=a.id, targetUserId=user_id, type="SUSPEND", reason=body.reason, expiresAt=until, reportId=body.reportId))
    await db.commit()
    await audit(db, a.id, "user.suspend", "User", user_id, {"days": body.days or 7})
    await notifications.create(db, user_id, "SECURITY_ALERT", {"event": "suspended"})
    return {"ok": True}


@router.post("/users/{user_id}/ban")
async def ban(user_id: str, body: Sanction, a: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    u = await guard_target(db, a, user_id)
    u.status = "BANNED"
    await db.execute(update(Session).where(Session.userId == user_id, Session.revokedAt.is_(None)).values(revokedAt=utcnow()))
    await db.execute(update(Profile).where(Profile.userId == user_id).values(visibility="HIDDEN"))
    db.add(ModerationAction(moderatorId=a.id, targetUserId=user_id, type="BAN", reason=body.reason, reportId=body.reportId))
    await db.commit()
    await audit(db, a.id, "user.ban", "User", user_id)
    return {"ok": True}


@router.post("/users/{user_id}/unsuspend")
async def unsuspend(user_id: str, body: ReasonOnly, a: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    u = await guard_target(db, a, user_id)
    u.status, u.suspendedUntil = "ACTIVE", None
    await db.execute(update(Profile).where(Profile.userId == user_id).values(visibility="VISIBLE"))
    db.add(ModerationAction(moderatorId=a.id, targetUserId=user_id, type="UNSUSPEND", reason=body.reason))
    await db.commit()
    await audit(db, a.id, "user.unsuspend", "User", user_id)
    return {"ok": True}


@router.patch("/users/{user_id}/role")
async def role(user_id: str, body: RoleChange, a: AuthUser = SUP, db: AsyncSession = Depends(get_db)):
    if user_id == a.id:
        raise forbidden("CANNOT_CHANGE_SELF")
    res = await db.execute(update(User).where(User.id == user_id).values(role=body.role, updatedAt=utcnow()))
    if res.rowcount == 0:
        raise not_found("NOT_FOUND")
    await db.commit()
    await audit(db, a.id, "user.role", "User", user_id, {"role": body.role})
    return {"ok": True}


@router.post("/users/{user_id}/grant-plan")
async def grant_plan(user_id: str, body: PlanGrant, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Offre une formule à un membre pour une durée déterminée (sans paiement). Remplace les droits en cours ; échéance = maintenant + durée."""
    if not await db.get(User, user_id):
        raise not_found("USER_NOT_FOUND")
    if user_id == a.id and not has_role(a.role, "SUPER_ADMIN"):
        raise forbidden("CANNOT_GRANT_SELF", "Un administrateur ne peut pas s'offrir une formule : demandez à un super administrateur.")
    until = utcnow() + body.days * DAY
    await entitlements.set_(db, user_id, body.plan, until)
    await db.commit()
    await audit(db, a.id, "user.grant-plan", "User", user_id, {"plan": body.plan, "days": body.days, "until": until.isoformat(), "reason": body.reason})
    return {"ok": True, "plan": body.plan, "validUntil": until}


@router.post("/users/{user_id}/revoke-plan")
async def revoke_plan(user_id: str, body: ReasonOnly, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Retire la formule en cours (retour à Gratuit). Un abonnement payant encore actif sera recalculé à sa prochaine échéance."""
    if not await db.get(User, user_id):
        raise not_found("USER_NOT_FOUND")
    await entitlements.set_(db, user_id, "FREE", None)
    await db.commit()
    await audit(db, a.id, "user.revoke-plan", "User", user_id, {"reason": body.reason})
    return {"ok": True}


# ───────── Signalements ─────────
@router.get("/reports")
async def reports(status: str = "OPEN", cursor: str | None = None, limit: str | None = None, _: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    take = page(limit)
    stmt = await after_cursor(db, select(Report).where(Report.status == status).order_by(Report.createdAt.asc(), Report.id.asc()), Report, cursor, desc=False)
    rows = (await db.execute(stmt.limit(take + 1))).scalars().all()
    page_rows = rows[:take]
    names = await _display_names(db, [r.reporterId for r in page_rows] + [r.targetId for r in page_rows])
    targets = {u.id: u for u in (await db.execute(select(User).where(User.id.in_([r.targetId for r in page_rows])))).scalars()}
    totals = dict((await db.execute(select(Report.targetId, func.count()).where(Report.targetId.in_([r.targetId for r in page_rows])).group_by(Report.targetId))).all())
    return paged(rows, take, [{"id": r.id, "reason": ev(r.reason), "details": r.details, "status": ev(r.status), "createdAt": r.createdAt,
                               "evidenceCount": len((r.evidence or {}).get("messages", [])),
                               "reporter": {"id": r.reporterId, "displayName": names.get(r.reporterId)},
                               "target": {"id": r.targetId, "displayName": names.get(r.targetId), "status": ev(targets[r.targetId].status), "totalReports": totals.get(r.targetId, 0)}}
                              for r in page_rows])


@router.get("/reports/{report_id}/evidence")
async def report_evidence(report_id: str, a: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    """Extrait de conversation joint au signalement (copie figée des derniers messages, fournie par la personne qui signale). Chaque consultation est journalisée."""
    r = await db.get(Report, report_id)
    if not r:
        raise not_found("REPORT_NOT_FOUND")
    await audit(db, a.id, "report.evidence.view", "Report", report_id, {"messages": len((r.evidence or {}).get("messages", []))})
    return {"conversationId": r.conversationId, "capturedAt": (r.evidence or {}).get("capturedAt"), "messages": (r.evidence or {}).get("messages", [])}


@router.post("/reports/{report_id}/resolve")
async def resolve_report(report_id: str, body: ResolveReport, a: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    res = await db.execute(update(Report).where(Report.id == report_id).values(status=body.status, resolvedById=a.id, resolvedAt=None if body.status == "REVIEWING" else utcnow()))
    if res.rowcount == 0:
        raise not_found("REPORT_NOT_FOUND")
    await db.commit()
    await audit(db, a.id, "report.resolve", "Report", report_id, {"status": body.status, "note": body.note})
    return {"ok": True}


# ───────── Photos ─────────
@router.get("/photos")
async def photos(status: str = "APPROVED", cursor: str | None = None, limit: str | None = None, _: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    take = page(limit)
    stmt = await after_cursor(db, select(ProfilePhoto).where(ProfilePhoto.moderationStatus == status).order_by(ProfilePhoto.createdAt.desc(), ProfilePhoto.id.desc()), ProfilePhoto, cursor)
    rows = (await db.execute(stmt.limit(take + 1))).scalars().all()
    profs = {p.id: p for p in (await db.execute(select(Profile).where(Profile.id.in_([r.profileId for r in rows[:take]])))).scalars()}
    return paged(rows, take, [{"id": p.id, "url": f"/api/media/{thumb_key(p.key)}", "status": ev(p.moderationStatus), "userId": profs[p.profileId].userId,
                               "displayName": profs[p.profileId].displayName, "createdAt": p.createdAt} for p in rows[:take]])


@router.post("/photos/{photo_id}/reject")
async def reject_photo(photo_id: str, body: ReasonOnly, a: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    p = await db.get(ProfilePhoto, photo_id)
    if not p:
        raise not_found("PHOTO_NOT_FOUND")
    profile = await db.get(Profile, p.profileId)
    p.moderationStatus, p.isPrimary = "REJECTED", False
    db.add(ModerationAction(moderatorId=a.id, targetUserId=profile.userId, type="PHOTO_REJECT", reason=body.reason))
    await db.commit()
    await storage.delete(p.key)
    await storage.delete(thumb_key(p.key))
    rest = (await db.execute(select(ProfilePhoto).where(ProfilePhoto.profileId == p.profileId, ProfilePhoto.moderationStatus != "REJECTED").order_by(ProfilePhoto.position))).scalars().all()
    for i, x in enumerate(rest):
        x.position, x.isPrimary = i, i == 0
    await db.commit()
    from app.core import profilesvc

    await profilesvc.recompute(db, profile.userId)
    await audit(db, a.id, "photo.reject", "ProfilePhoto", photo_id)
    return {"ok": True}


# ───────── Vérification de profil ─────────
@router.get("/verifications")
async def verifications(status: str = "PENDING", _: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(VerificationRequest).where(VerificationRequest.status == status).order_by(VerificationRequest.createdAt).limit(100))).scalars().all()
    names = await _display_names(db, [v.userId for v in rows])
    return [{"id": v.id, "userId": v.userId, "displayName": names.get(v.userId), "status": ev(v.status), "createdAt": v.createdAt} for v in rows]


@router.get("/verifications/{vid}/selfie")
async def selfie(vid: str, a: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    """Le selfie est privé : servi seulement au personnel de modération."""
    v = await db.get(VerificationRequest, vid)
    data = await storage.get(v.selfieKey) if v else None
    if not data:
        raise not_found()
    await audit(db, a.id, "verification.view", "VerificationRequest", vid)
    return Response(content=data, media_type="image/webp", headers={"Cache-Control": "no-store"})


@router.post("/verifications/{vid}/review")
async def review_verification(vid: str, body: Review, a: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    v = await db.get(VerificationRequest, vid)
    if not v or ev(v.status) != "PENDING":
        raise not_found("VERIFICATION_NOT_FOUND")
    v.status, v.reviewedById, v.reviewedAt, v.note = ("APPROVED" if body.approve else "REJECTED"), a.id, utcnow(), body.note
    if body.approve:
        await db.execute(update(Profile).where(Profile.userId == v.userId).values(verified=True))
    db.add(ModerationAction(moderatorId=a.id, targetUserId=v.userId, type="VERIFICATION_APPROVE" if body.approve else "VERIFICATION_REJECT",
                            reason=body.note or ("approved" if body.approve else "rejected")))
    await db.commit()
    # Le selfie n'est plus nécessaire une fois la décision prise : minimisation des données.
    await storage.delete(v.selfieKey)
    if body.approve:
        await notifications.create(db, v.userId, "PROFILE_VERIFIED", {})
    await audit(db, a.id, "verification.review", "VerificationRequest", vid, {"approve": body.approve})
    return {"ok": True}


# ───────── Contestations ─────────
@router.get("/appeals")
async def appeals(_: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(ModerationAction).where(ModerationAction.appealStatus == "PENDING").order_by(ModerationAction.appealedAt))).scalars().all()
    names = await _display_names(db, [r.targetUserId for r in rows])
    return [{"id": r.id, "userId": r.targetUserId, "displayName": names.get(r.targetUserId), "type": ev(r.type), "reason": r.reason, "appealText": r.appealText, "appealedAt": r.appealedAt} for r in rows]


@router.post("/appeals/{aid}/decide")
async def decide_appeal(aid: str, body: Review, a: AuthUser = MOD, db: AsyncSession = Depends(get_db)):
    act = await db.get(ModerationAction, aid)
    if not act or ev(act.appealStatus) != "PENDING":
        raise not_found("APPEAL_NOT_FOUND")
    act.appealStatus = "ACCEPTED" if body.approve else "REJECTED"
    if body.approve:
        await db.execute(update(User).where(User.id == act.targetUserId).values(status="ACTIVE", suspendedUntil=None, updatedAt=utcnow()))
    db.add(ModerationAction(moderatorId=a.id, targetUserId=act.targetUserId, type="APPEAL_ACCEPT" if body.approve else "APPEAL_REJECT", reason=body.note or "—"))
    await db.commit()
    await audit(db, a.id, "appeal.decide", "ModerationAction", aid, {"approve": body.approve})
    return {"ok": True}


# ───────── Finances (ADMIN) ─────────
@router.get("/subscriptions")
async def subscriptions(cursor: str | None = None, limit: str | None = None, _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    take = page(limit)
    stmt = await after_cursor(db, select(Subscription).order_by(Subscription.createdAt.desc(), Subscription.id.desc()), Subscription, cursor)
    rows = (await db.execute(stmt.limit(take + 1))).scalars().all()
    names = await _display_names(db, [s.userId for s in rows[:take]])
    codes = dict((await db.execute(select(SubscriptionPlan.id, SubscriptionPlan.code))).all())
    return paged(rows, take, [{"id": s.id, "userId": s.userId, "displayName": names.get(s.userId), "plan": ev(codes[s.planId]), "status": ev(s.status),
                               "currentPeriodEnd": s.currentPeriodEnd, "cancelAtPeriodEnd": s.cancelAtPeriodEnd, "provider": s.provider, "createdAt": s.createdAt} for s in rows[:take]])


@router.get("/payments")
async def payments_list(cursor: str | None = None, limit: str | None = None, _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    from app.models.models import Invoice

    take = page(limit)
    stmt = await after_cursor(db, select(Payment).order_by(Payment.createdAt.desc(), Payment.id.desc()), Payment, cursor)
    rows = (await db.execute(stmt.limit(take + 1))).scalars().all()
    ids = [p.id for p in rows[:take]]
    names = await _display_names(db, [p.userId for p in rows[:take]])
    invs = dict((await db.execute(select(Invoice.paymentId, Invoice.number).where(Invoice.paymentId.in_(ids)))).all())
    last_refund: dict[str, str] = {}
    for pid, st in (await db.execute(select(Refund.paymentId, Refund.status).where(Refund.paymentId.in_(ids)).order_by(Refund.createdAt.asc()))).all():
        last_refund[pid] = ev(st)  # le dernier (le plus récent) l'emporte
    return paged(rows, take, [{"refund": last_refund.get(p.id), "id": p.id, "userId": p.userId, "displayName": names.get(p.userId), "amountXof": p.amountXof,
                               "status": ev(p.status), "provider": p.provider, "failureReason": p.failureReason, "invoiceNumber": invs.get(p.id), "createdAt": p.createdAt}
                              for p in rows[:take]])


# ───────── Remboursements (ADMIN) ─────────
@router.get("/refunds")
async def refunds_list(status: str | None = None, cursor: str | None = None, limit: str | None = None, _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    return await refunds.list_(db, status, cursor, page(limit))


@router.post("/refunds", status_code=201)
async def refund_create(body: RefundCreate, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Création par un administrateur : nécessite l'approbation d'un AUTRE administrateur."""
    r = await refunds.request_by_admin(db, a.id, body.paymentId, body.reason)
    await audit(db, a.id, "refund.request", "Payment", body.paymentId, {"refundId": r.id, "amountXof": r.amountXof})
    return {"id": r.id, "status": ev(r.status)}


@router.post("/refunds/{refund_id}/approve")
async def refund_approve(refund_id: str, body: RefundApprove, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    r = await refunds.approve(db, a.id, refund_id, body.note, bool(body.manual))
    await audit(db, a.id, "refund.approve", "Refund", refund_id, {"result": r["status"], "manual": bool(body.manual)})
    return r


@router.post("/refunds/{refund_id}/reject")
async def refund_reject(refund_id: str, body: RefundReject, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    r = await refunds.reject(db, a.id, refund_id, body.note)
    await audit(db, a.id, "refund.reject", "Refund", refund_id, {"note": body.note})
    return r


@router.post("/jobs/expire-subscriptions")
async def expire(a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    r = await payments.run_expiry_job(db)
    await audit(db, a.id, "job.expire-subscriptions", None, None, r)
    return r


# ───────── Offres, tarifs et produits (ADMIN) ─────────
@router.get("/plans")
async def plans(_: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Les modifications ne valent QUE pour les achats futurs : le montant est figé sur Payment, la période sur Subscription."""
    rows = (await db.execute(select(SubscriptionPlan).order_by(SubscriptionPlan.sortOrder))).scalars().all()
    prices = (await db.execute(select(PlanPrice).order_by(PlanPrice.months))).scalars().all()
    products = (await db.execute(select(Product).order_by(Product.sortOrder))).scalars().all()
    catalog = await plan_config.catalog(db)
    return {"plans": [{**to_dict(p), "prices": [to_dict(x) for x in prices if x.planId == p.id],
                       "preview": next((c["prices"] for c in catalog if c["code"] == ev(p.code)), [])} for p in rows],
            "products": [to_dict(x) for x in products]}


@router.patch("/plans/{code}")
async def patch_plan(code: str, body: PlanPatch, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    plan = (await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.code == code))).scalar_one_or_none() if code in ("FREE", "PREMIUM", "VIP") else None
    if not plan:
        raise not_found("PLAN_NOT_FOUND")
    if ev(plan.code) == "FREE" and ((body.priceXof or 0) > 0 or body.active is False):
        raise forbidden("FREE_PLAN_LOCKED", "La formule gratuite ne peut ni être payante ni être désactivée")
    before = {"name": plan.name, "priceXof": plan.priceXof, "active": plan.active}
    data = body.model_dump(mode="json", exclude_unset=True)
    for k in ("name", "priceXof", "active", "featured", "sortOrder"):
        if k in data:
            setattr(plan, k, data[k])
    for k in ("taglineFr", "taglineEn"):
        if k in data:
            setattr(plan, k, data[k] or None)  # vide = retour à l'accroche par défaut
    if "features" in data and data["features"] is not None:
        plan.features = data["features"]
    for pr in body.prices or []:
        row = (await db.execute(select(PlanPrice).where(PlanPrice.planId == plan.id, PlanPrice.months == pr.months))).scalar_one_or_none()
        if row:
            row.discountPercent, row.amountOverride = pr.discountPercent, pr.amountOverride
            if pr.active is not None:
                row.active = pr.active
        else:
            db.add(PlanPrice(planId=plan.id, months=pr.months, discountPercent=pr.discountPercent, amountOverride=pr.amountOverride, active=True if pr.active is None else pr.active))
    await db.commit()
    plan_config.invalidate()
    await audit(db, a.id, "plan.update", "SubscriptionPlan", ev(plan.code), {"before": before, "after": data})
    return {"ok": True}


@router.patch("/products/{code}")
async def patch_product(code: str, body: ProductPatch, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(Product).where(Product.code == code))).scalar_one_or_none()
    if not p:
        raise not_found("PRODUCT_NOT_FOUND")
    data = body.model_dump(mode="json", exclude_unset=True)
    for k, v in data.items():
        setattr(p, k, v)
    await db.commit()
    plan_config.invalidate()
    await audit(db, a.id, "product.update", "Product", code, data)
    return {"ok": True}


# ───────── Codes promotionnels (ADMIN) ─────────
@router.get("/promos")
async def list_promos(_: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(PromoCode).order_by(PromoCode.createdAt.desc()))).scalars().all()
    used = await promo.usage_map(db, list(rows))
    return [{**to_dict(r), "used": used[r.id]} for r in rows]


@router.post("/promos", status_code=201)
async def create_promo(body: PromoCreate, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    if (await db.execute(select(PromoCode.id).where(PromoCode.code == body.code))).first():
        raise AppError(409, "PROMO_CODE_EXISTS")
    p = PromoCode(code=body.code, kind=body.kind, percent=body.percent, tokens=body.tokens, maxRedemptions=body.maxRedemptions, startsAt=body.startsAt, expiresAt=body.expiresAt)
    db.add(p)
    await db.commit()
    await audit(db, a.id, "promo.create", "PromoCode", p.code, {"kind": body.kind, "percent": p.percent, "tokens": p.tokens, "maxRedemptions": p.maxRedemptions})
    return to_dict(p)


@router.patch("/promos/{promo_id}")
async def patch_promo(promo_id: str, body: PromoPatch, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    """Le type et la valeur d'un code ne changent jamais : on le désactive et on en crée un autre."""
    p = await db.get(PromoCode, promo_id)
    if not p:
        raise not_found("PROMO_NOT_FOUND")
    sent = body.model_dump(exclude_unset=True)
    for k, v in sent.items():
        setattr(p, k, v)
    await db.commit()
    await audit(db, a.id, "promo.update", "PromoCode", promo_id, body.model_dump(mode="json", exclude_unset=True))
    return {"ok": True}


# ───────── Paramètres ─────────
@router.get("/feature-flags")
async def flags(_: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    by = {r.key: r for r in (await db.execute(select(FeatureFlag))).scalars()}
    # Catalogue fermé : toutes les fonctions pilotables, avec leur état réel (ligne absente = valeur par défaut).
    return [{"key": f.key, "category": f.category, "emergency": f.emergency, "defaultOn": f.default_on,
             "enabled": by[f.key].enabled if f.key in by else f.default_on, "overridden": f.key in by,
             "updatedAt": by[f.key].updatedAt if f.key in by else None} for f in FEATURE_FLAGS]


@router.put("/feature-flags/{key}")
async def set_flag(key: str, body: FlagSet, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    if not any(f.key == key for f in FEATURE_FLAGS):
        raise not_found("UNKNOWN_FLAG", "Fonctionnalité inconnue")
    before = await flagsvc.is_on(db, key)
    row = (await db.execute(select(FeatureFlag).where(FeatureFlag.key == key))).scalar_one_or_none()
    if row:
        row.enabled = body.enabled
    else:
        row = FeatureFlag(key=key, enabled=body.enabled)
        db.add(row)
    await db.commit()
    flagsvc.invalidate()
    await audit(db, a.id, "flag.set", "FeatureFlag", key, {"before": before, "enabled": body.enabled})
    return {"key": key, "enabled": row.enabled}


# ───────── Stockage des fichiers (SUPER_ADMIN) ─────────
class StorageSet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    driver: str
    endpoint: str | None = None
    bucket: str | None = None
    region: str | None = None
    prefix: str | None = None
    backupBucket: str | None = None
    accessKeyId: str | None = None
    secretAccessKey: str | None = None  # écriture seule : jamais renvoyée


async def _storage_view(db: AsyncSession) -> dict:
    cfg = await storage_config.effective()
    return {**storage_config.public_view(cfg), "localFiles": len(await asyncio.to_thread(storage.local_keys)),
            "encryptionKeyConfigured": bool(get_settings().settings_encryption_key), "envDriver": storage_config.from_env().driver}


def _candidate(body: StorageSet, existing: storage_config.Effective) -> storage_config.Effective:
    v = storage_config.validate(body.model_dump(), existing)
    if v["driver"] == "local":
        return storage_config.Effective(driver="local", source="db")
    secret = storage_config.check_secret(body.secretAccessKey) if body.secretAccessKey else existing.secret
    if not secret:
        raise bad_request("SECRET_REQUIRED", "La clé secrète est obligatoire")
    return storage_config.Effective(driver="s3", endpoint=v["endpoint"], bucket=v["bucket"], region=v["region"], prefix=v["prefix"],
                                    access_key_id=v["accessKeyId"], secret=secret, source="db", backup_bucket=v.get("backupBucket"))


@router.get("/storage")
async def storage_get(_: AuthUser = SUP, db: AsyncSession = Depends(get_db)):
    return await _storage_view(db)


@router.post("/storage/test")
async def storage_test(body: StorageSet, a: AuthUser = SUP, db: AsyncSession = Depends(get_db)):
    """Teste la configuration saisie (sans l'enregistrer) : écriture, relecture et suppression d'un fichier d'essai."""
    cand = _candidate(body, await storage_config.effective())
    if cand.driver == "s3":
        await storage.probe(cand)
        if cand.backup_bucket:
            await storage.probe(cand, cand.backup_bucket)  # le bucket des sauvegardes est testé à part : la clé doit y avoir les mêmes droits
    return {"ok": True}


@router.put("/storage")
async def storage_set(body: StorageSet, a: AuthUser = SUP, db: AsyncSession = Depends(get_db)):
    """Enregistre la configuration. Un stockage objet n'est enregistré que si le test d'écriture réussit avec les identifiants fournis."""
    before = await storage_config.effective()
    cand = _candidate(body, before)
    if cand.driver == "s3":
        await storage.probe(cand)
        if cand.backup_bucket:
            await storage.probe(cand, cand.backup_bucket)
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == storage_config.KEY))).scalar_one_or_none()
    value: dict = {"driver": cand.driver}
    if cand.driver == "s3":
        value.update(endpoint=cand.endpoint, bucket=cand.bucket, region=cand.region, prefix=cand.prefix, backupBucket=cand.backup_bucket, accessKeyId=cand.access_key_id,
                     secretEnc=storage_config.encrypt(cand.secret or ""))
    if row:
        row.value = value
    else:
        db.add(SystemSetting(key=storage_config.KEY, value=value))
    await db.commit()
    storage_config.invalidate()
    await audit(db, a.id, "storage.update", "SystemSetting", storage_config.KEY,
                {"before": {"driver": before.driver, "bucket": before.bucket, "backupBucket": before.backup_bucket, "endpoint": before.endpoint, "prefix": before.prefix},
                 "after": {"driver": cand.driver, "bucket": cand.bucket, "backupBucket": cand.backup_bucket, "endpoint": cand.endpoint, "prefix": cand.prefix},
                 "secretChanged": bool(body.secretAccessKey)})  # jamais la clé elle-même
    return await _storage_view(db)


@router.post("/storage/migrate")
async def storage_migrate(a: AuthUser = SUP, db: AsyncSession = Depends(get_db)):
    """Copie les photos du disque vers le bucket par lots de ~20 s ; à rappeler tant que « remaining » > 0. Ne supprime rien."""
    cfg = await storage_config.effective()
    if cfg.driver != "s3":
        raise bad_request("STORAGE_NOT_S3", "Activez d'abord le stockage objet")
    r = await storage.migrate_local(cfg)
    await audit(db, a.id, "storage.migrate", "SystemSetting", storage_config.KEY, r)
    return r


@router.get("/audit-logs")
async def audit_logs(cursor: str | None = None, action: str | None = None, limit: str | None = None, _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    take = page(limit)
    stmt = select(AuditLog).order_by(AuditLog.createdAt.desc(), AuditLog.id.desc())
    if action:
        stmt = stmt.where(AuditLog.action == action)
    stmt = await after_cursor(db, stmt, AuditLog, cursor)
    rows = (await db.execute(stmt.limit(take + 1))).scalars().all()
    names = await _display_names(db, [r.actorId for r in rows[:take]])
    return paged(rows, take, [{"id": l.id, "actorId": l.actorId, "actor": names.get(l.actorId), "action": l.action, "targetType": l.targetType,
                               "targetId": l.targetId, "metadata": l.metadata_, "createdAt": l.createdAt} for l in rows[:take]])


@public_router.get("/feature-flags")
async def public_flags(db: AsyncSession = Depends(get_db)):
    """Drapeaux de fonctionnalité en lecture publique (le web masque/affiche selon l'état)."""
    return await flagsvc.all_flags(db)




# Le routeur exporté regroupe les routes /admin/* et la lecture publique des flags (/feature-flags).
_admin_router = router
router = APIRouter()
router.include_router(_admin_router)
router.include_router(public_router)

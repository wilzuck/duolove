"""Source unique de la configuration commerciale (offres, fonctionnalités, durées, remises, produits).
Les valeurs par défaut ne sont écrites QUE si elles manquent : une modification d'administrateur n'est jamais écrasée."""
import time

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.constants import (
    DEFAULT_DISCOUNTS, DEFAULT_PLANS, DEFAULT_PRODUCTS, DURATION_MONTHS, PLAN_CODES, PLAN_FEATURE_DEFAULTS, price_for_duration,
)
from app.core.errors import bad_request, not_found
from app.core.ids import new_id, utcnow
from app.models.models import PlanPrice, Product, SubscriptionPlan

TTL = 15.0
_cache: dict = {"at": 0.0, "plans": None}


def valid_features(raw: object) -> dict | None:
    """Valide les fonctionnalités d'une formule (équivalent de planFeaturesSchema). None si corrompu."""
    if not isinstance(raw, dict):
        return None
    out = {}
    for k, default in PLAN_FEATURE_DEFAULTS.items():
        v = raw.get(k, default if k in ("live_match_enabled", "live_match_trials", "match_tokens_monthly", "chat_images_enabled", "read_receipts_control", "daily_picks_count") else None)
        if isinstance(default, bool):
            if not isinstance(v, bool):
                return None
        else:
            if isinstance(v, bool) or not isinstance(v, int):
                return None
            lo, hi = {"daily_likes_limit": (-1, 100_000), "super_likes_weekly": (0, 1000), "boosts_monthly": (0, 100),
                      "live_match_trials": (0, 20), "match_tokens_monthly": (0, 500), "daily_picks_count": (1, 30)}[k]
            if not lo <= v <= hi:
                return None
        out[k] = v
    return out


def invalidate() -> None:
    _cache["plans"] = None


async def ensure_defaults(db: AsyncSession) -> None:
    for code in PLAN_CODES:
        d = DEFAULT_PLANS[code]
        await db.execute(
            insert(SubscriptionPlan).values(id=new_id(), code=code, name=d["name"], priceXof=d["priceXof"], features=d["features"],
                                            featured=d["featured"], sortOrder=d["sortOrder"])
            .on_conflict_do_nothing(index_elements=["code"])
        )
        plan = (await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.code == code))).scalar_one()
        # Migration unique des anciennes lignes vers les fonctionnalités configurables.
        if valid_features(plan.features) is None:
            plan.features, plan.featured, plan.sortOrder = d["features"], d["featured"], d["sortOrder"]
        else:
            # Nouvelles fonctionnalités : on AJOUTE les clés absentes sans toucher à celles réglées par l'administration.
            raw = dict(plan.features or {})
            missing = {k: v for k, v in d["features"].items() if k not in raw}
            if missing:
                plan.features = {**raw, **missing}
        if code != "FREE":
            for months in DURATION_MONTHS:
                await db.execute(
                    insert(PlanPrice).values(id=new_id(), planId=plan.id, months=months, discountPercent=DEFAULT_DISCOUNTS[months])
                    .on_conflict_do_nothing(index_elements=["planId", "months"])
                )
    for code, kind, credit, name, qty, price, order in DEFAULT_PRODUCTS:
        await db.execute(
            insert(Product).values(id=new_id(), code=code, kind=kind, creditType=credit, name=name, quantity=qty, priceXof=price,
                                   sortOrder=order)
            .on_conflict_do_nothing(index_elements=["code"])
        )
    await db.commit()
    invalidate()


async def _load(db: AsyncSession) -> dict[str, dict]:
    if _cache["plans"] is not None and time.monotonic() - _cache["at"] < TTL:
        return _cache["plans"]
    rows = (await db.execute(select(SubscriptionPlan).options(selectinload(SubscriptionPlan.PlanPrice)).order_by(SubscriptionPlan.sortOrder))).scalars().all()
    plans: dict[str, dict] = {}
    for r in rows:
        features = valid_features(r.features)
        if features is None:
            continue  # configuration corrompue : on garde la formule hors catalogue plutôt que d'ouvrir des droits
        prices = []
        for p in sorted(r.PlanPrice, key=lambda x: x.months):
            if not p.active:
                continue
            total = price_for_duration(r.priceXof, p.months, p.discountPercent, p.amountOverride)
            prices.append({"months": p.months, "discountPercent": p.discountPercent, "totalXof": total,
                           "monthlyEquivalentXof": int(total / p.months + 0.5), "savingsXof": max(0, r.priceXof * p.months - total)})
        plans[r.code.value] = {"code": r.code.value, "name": r.name, "priceXof": r.priceXof, "currency": r.currency, "features": features,
                               "featured": r.featured, "sortOrder": r.sortOrder, "prices": prices,
                               "taglineFr": r.taglineFr, "taglineEn": r.taglineEn}
    _cache["plans"], _cache["at"] = plans, time.monotonic()
    return plans


async def features_of(db: AsyncSession, code: str) -> dict:
    p = (await _load(db)).get(code)
    return p["features"] if p else DEFAULT_PLANS[code]["features"]


async def catalog(db: AsyncSession) -> list[dict]:
    active = {c.value for c in (await db.execute(select(SubscriptionPlan.code).where(SubscriptionPlan.active.is_(True)))).scalars().all()}
    return [p for p in (await _load(db)).values() if p["code"] in active]


async def quote(db: AsyncSession, code: str, months: int) -> tuple[dict, dict]:
    """Devis calculé côté serveur : le montant payé ne vient JAMAIS du frontend."""
    if code == "FREE":
        raise bad_request("INVALID_PLAN")
    plan = next((p for p in await catalog(db) if p["code"] == code), None)
    if not plan:
        raise not_found("PLAN_NOT_FOUND")
    price = next((p for p in plan["prices"] if p["months"] == months), None)
    if not price:
        raise bad_request("PRICE_NOT_AVAILABLE", "Durée non proposée")
    return plan, price


async def products(db: AsyncSession):
    return (await db.execute(select(Product).where(Product.active.is_(True)).order_by(Product.sortOrder))).scalars().all()

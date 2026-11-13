"""Réglages de l'application pilotés par l'administration (table SystemSetting, une ligne par clé). Catalogue FERMÉ : chaque clé a une valeur par
défaut, des bornes et une validation ; l'API admin refuse tout le reste. Absence de ligne = valeur par défaut."""
import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request
from app.core.scoring import DEFAULT_WEIGHTS
from app.models.models import SystemSetting

INT_SPECS = {  # clé → (défaut, min, max)
    "daily.cooldown_days": (14, 0, 90),
    "daily.retention_days": (90, 7, 365),
    "prompts.min": (3, 1, 5),
    "prompts.max": (5, 3, 8),
    "likes.comment_max": (200, 20, 500),
    "icebreakers.count": (3, 1, 5),
    "dates.min_notice_hours": (2, 0, 72),
    "dates.max_days_ahead": (30, 1, 90),
    "dates.max_open": (2, 1, 5),
    "dates.max_per_day": (5, 1, 20),
    "dates.share_hours_after": (6, 1, 48),
    "pause.max_days": (90, 1, 365),
    "signup.code_ttl_minutes": (15, 5, 60),
    "calls.ring_seconds": (45, 15, 120),
    "live.search_hours": (24, 1, 72),
    "speed.message_max": (300, 50, 1000),
    "speed.min_participants": (4, 2, 50),
    "speed.decision_seconds": (180, 30, 900),
    "speed.gap_seconds": (20, 5, 120),
    "speed.reminder_minutes": (15, 5, 120),
    "calls.max_minutes": (60, 5, 240),
    "calls.max_per_day": (20, 1, 100),
    "signup.unverified_ttl_hours": (72, 1, 720),
    "notifications.max_emails_per_day": (5, 0, 50),
    # Garantie Duo (désactivée par défaut) : un abonné sans aucun duo après `window_days` jours, profil complet et au moins `min_likes` likes envoyés, reçoit `days` jours.
    "guarantee.enabled": (0, 0, 1), "guarantee.days": (7, 1, 60), "guarantee.window_days": (30, 7, 90), "guarantee.min_likes": (15, 1, 200),
    "live.priority_bonus": (15, 0, 40),  # points de classement ajoutés aux abonnés payants dans la découverte PENDANT une soirée Duo (0 = désactivé)
    "moderation.sla_hours": (24, 1, 168),  # délai annoncé pour traiter un signalement (et seuil du badge « en retard » en administration)
}
WEIGHT_KEY = "matching.weights"
KEYS = (WEIGHT_KEY, *INT_SPECS)
DEFAULTS: dict = {WEIGHT_KEY: dict(DEFAULT_WEIGHTS), **{k: v[0] for k, v in INT_SPECS.items()}}
_cache: dict = {"at": 0.0, "map": None}


def invalidate() -> None:
    _cache["map"] = None


def validate(key: str, value):
    """Valeur normalisée, ou 400 INVALID_SETTING."""
    if key == WEIGHT_KEY:
        if not isinstance(value, dict) or set(value) != set(DEFAULT_WEIGHTS) or any(not isinstance(v, int) or isinstance(v, bool) or not 0 <= v <= 100 for v in value.values()):
            raise bad_request("INVALID_SETTING", "Pondérations : cinq entiers de 0 à 100", {"key": key})
        if sum(value.values()) != 100:
            raise bad_request("WEIGHTS_SUM", "Le total des pondérations doit faire 100", {"key": key, "sum": sum(value.values())})
        return {k: value[k] for k in DEFAULT_WEIGHTS}
    spec = INT_SPECS.get(key)
    if not spec:
        raise bad_request("UNKNOWN_SETTING", "Réglage inconnu", {"key": key})
    if not isinstance(value, int) or isinstance(value, bool) or not spec[1] <= value <= spec[2]:
        raise bad_request("INVALID_SETTING", f"{key} : entier entre {spec[1]} et {spec[2]}", {"key": key, "min": spec[1], "max": spec[2]})
    return value


async def all_values(db: AsyncSession) -> dict:
    if _cache["map"] is None or time.monotonic() - _cache["at"] > 10:
        rows = (await db.execute(select(SystemSetting.key, SystemSetting.value).where(SystemSetting.key.in_(KEYS)))).all()
        stored = dict(rows)
        merged = {}
        for k in KEYS:
            try:
                merged[k] = validate(k, stored[k]) if k in stored else DEFAULTS[k]
            except Exception:  # valeur corrompue en base : on retombe sur le défaut plutôt que de casser la découverte
                merged[k] = DEFAULTS[k]
        _cache["map"], _cache["at"] = merged, time.monotonic()
    return dict(_cache["map"])


async def get(db: AsyncSession, key: str):
    return (await all_values(db))[key]


async def update(db: AsyncSession, values: dict) -> dict:
    """Met à jour plusieurs clés atomiquement ; la cohérence croisée (min ≤ max) est contrôlée sur l'état final."""
    clean = {k: validate(k, v) for k, v in values.items()}
    final = {**await all_values(db), **clean}
    if final["prompts.min"] > final["prompts.max"]:
        raise bad_request("INVALID_SETTING", "prompts.min doit être ≤ prompts.max", {"key": "prompts.min"})
    for k, v in clean.items():
        row = await db.get(SystemSetting, k)
        if row:
            row.value = v
        else:
            db.add(SystemSetting(key=k, value=v))
    await db.commit()
    invalidate()
    return await all_values(db)

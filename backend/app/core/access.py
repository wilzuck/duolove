"""Accès payant obligatoire (« modèle B ») : un interrupteur d'administration. Activé, un membre sans formule payante peut créer et soigner son profil,
mais ne voit personne, ne like pas et n'écrit pas tant qu'il n'a pas pris une formule (402 ACCESS_PAYWALL).

Garde-fous : le personnel (modération, administration) n'est jamais bloqué ; les membres inscrits AVANT l'activation gardent l'accès pendant un délai de grâce ;
si le paiement n'est pas opérationnel (fonction coupée, ou simulation en production), le blocage est suspendu : on ne bloque jamais quelqu'un qui ne peut pas payer."""
from __future__ import annotations

import datetime
import time
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import entitlements, flags, payment_config
from app.core.config import get_settings
from app.core.ids import utcnow
from app.models.models import SystemSetting, User

KEY = "access.config"
TTL = 30.0
DEFAULT_GRACE_DAYS = 30
# Chemins qui restent ouverts à un membre bloqué : compte, profil à soi, paiement, notifications, parrainage, pages publiques.
ALLOWED_PREFIXES = ("/api/auth", "/api/users", "/api/profiles/me", "/api/subscriptions", "/api/checkout", "/api/payments", "/api/plans", "/api/access",
                    "/api/notifications", "/api/referral", "/api/places", "/api/installs", "/api/contact", "/api/blog")


@dataclass(frozen=True)
class Config:
    enabled: bool = False
    activated_at: datetime.datetime | None = None
    grace_days: int = DEFAULT_GRACE_DAYS


_cache: dict = {"at": 0.0, "cfg": None}


def invalidate() -> None:
    _cache["cfg"] = None


def path_allowed(path: str) -> bool:
    return path.startswith(ALLOWED_PREFIXES)


def _parse(v: dict | None) -> Config:
    if not isinstance(v, dict):
        return Config()
    at = v.get("activatedAt")
    return Config(enabled=bool(v.get("enabled")), activated_at=datetime.datetime.fromisoformat(at) if at else None,
                  grace_days=int(v.get("graceDays", DEFAULT_GRACE_DAYS)))


async def load(db: AsyncSession) -> Config:
    return _parse((await db.execute(select(SystemSetting.value).where(SystemSetting.key == KEY))).scalar_one_or_none())


async def config() -> Config:
    """Configuration relue en base au plus toutes les 30 s (et tout de suite après un enregistrement)."""
    if _cache["cfg"] is not None and time.monotonic() - _cache["at"] < TTL:
        return _cache["cfg"]
    from app.db.session import session_maker

    try:
        async with session_maker()() as db:
            cfg = await load(db)
    except Exception:  # noqa: BLE001 — base momentanément indisponible : dernière valeur connue, sinon « désactivé » (on n'enferme personne)
        return _cache["cfg"] or Config()
    _cache["cfg"], _cache["at"] = cfg, time.monotonic()
    return cfg


async def payments_ready(db: AsyncSession) -> tuple[bool, str | None]:
    """Le blocage n'a de sens que si l'on peut payer : fonction « paiements » active et, en production, un vrai fournisseur configuré."""
    if not await flags.is_on(db, "payments_enabled"):
        return False, "PAYMENTS_OFF"
    if get_settings().is_prod and (await payment_config.effective()).provider != "kkiapay":
        return False, "PROVIDER_NOT_CONFIGURED"
    return True, None


async def status(db: AsyncSession, user: User, cfg: Config | None = None) -> dict:
    """État d'accès d'un membre : `locked` (bloqué), `graceEndsAt` (fin du délai de grâce des anciens membres, s'il court encore)."""
    cfg = cfg or await config()
    out = {"required": False, "locked": False, "graceEndsAt": None}
    if not cfg.enabled or not (await payments_ready(db))[0] or user.role.value != "USER":
        return out
    out["required"] = True
    if (await entitlements.get(db, user.id))["plan"] != "FREE":
        return out  # formule payante en cours
    if cfg.activated_at and user.createdAt < cfg.activated_at:
        end = cfg.activated_at + datetime.timedelta(days=cfg.grace_days)
        if utcnow() < end:
            out["graceEndsAt"] = end
            return out
    out["locked"] = True
    return out

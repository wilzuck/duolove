"""Configuration du paiement en ligne pilotée par l'administration (ligne `payments.config` de SystemSetting), comme le stockage R2.

Priorité : la ligne en base (si elle existe) l'emporte ; sinon les variables d'environnement (PAYMENT_PROVIDER, KKIAPAY_*).
La clé privée et le secret du webhook saisis dans la console sont chiffrés (Fernet, SETTINGS_ENCRYPTION_KEY), jamais renvoyés au navigateur
(on n'expose que « présent ou non ») et jamais écrits dans le journal d'audit."""
from __future__ import annotations

import re
import time
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage_config
from app.core.config import get_settings
from app.core.errors import bad_request
from app.models.models import SystemSetting

KEY = "payments.config"
TTL = 30.0
KEY_RE = re.compile(r"^[A-Za-z0-9_\-]{8,200}$")
_MISSING = object()


@dataclass(frozen=True)
class Effective:
    provider: str = "mock"  # « mock » ou « kkiapay »
    public_key: str | None = None
    private_key: str | None = None
    secret_key: str | None = None  # « Secret » de KKiaPay : le SDK officiel l'envoie avec chaque appel serveur
    webhook_secret: str | None = None
    sandbox: bool = True
    source: str = "env"  # « env » ou « db »


_cache: dict = {"at": 0.0, "row": _MISSING}


def invalidate() -> None:
    _cache["row"] = _MISSING


def from_env() -> Effective:
    s = get_settings()
    return Effective(provider=(s.payment_provider or "mock").lower(), public_key=s.kkiapay_public_key, private_key=s.kkiapay_private_key,
                     secret_key=s.kkiapay_secret_key, webhook_secret=s.kkiapay_webhook_secret, sandbox=s.kkiapay_sandbox, source="env")


def _from_row(v: dict) -> Effective:
    dec = lambda t: storage_config.decrypt(t) if t else None  # noqa: E731
    return Effective(provider=v.get("provider", "mock"), public_key=v.get("publicKey"), private_key=dec(v.get("privateKeyEnc")),
                     secret_key=dec(v.get("secretKeyEnc")), webhook_secret=dec(v.get("webhookSecretEnc")), sandbox=bool(v.get("sandbox", True)), source="db")


async def load_row(db: AsyncSession) -> dict | None:
    r = (await db.execute(select(SystemSetting.value).where(SystemSetting.key == KEY))).scalar_one_or_none()
    return r if isinstance(r, dict) else None


async def effective() -> Effective:
    """Configuration active : la ligne en base est relue au plus toutes les 30 s (et tout de suite après un enregistrement) ; sans ligne, l'environnement (lu à chaque appel)."""
    if _cache["row"] is _MISSING or time.monotonic() - _cache["at"] >= TTL:
        from app.db.session import session_maker

        try:
            async with session_maker()() as db:
                _cache["row"], _cache["at"] = await load_row(db), time.monotonic()
        except Exception:  # noqa: BLE001 — base momentanément indisponible : dernière configuration connue, sinon l'environnement
            if _cache["row"] is _MISSING:
                return from_env()
    row = _cache["row"]
    return _from_row(row) if isinstance(row, dict) else from_env()


def mask(key: str | None) -> str | None:
    return None if not key else ("•" * 8 + key[-4:])


def public_view(cfg: Effective, webhook_url: str) -> dict:
    return {"source": cfg.source, "provider": cfg.provider, "publicKey": cfg.public_key, "sandbox": cfg.sandbox, "hasPrivateKey": bool(cfg.private_key), "hasSecretKey": bool(cfg.secret_key),
            "hasWebhookSecret": bool(cfg.webhook_secret), "privateKeyMasked": mask(cfg.private_key), "webhookUrl": webhook_url, "live": cfg.provider == "kkiapay" and not cfg.sandbox}


def build(body: dict, existing: Effective) -> Effective:
    """Configuration candidate à partir de la saisie ; les secrets laissés vides sont conservés. 400 si une valeur est incorrecte."""
    provider = str(body.get("provider", "")).lower()
    if provider not in ("mock", "kkiapay"):
        raise bad_request("INVALID_PROVIDER", "Fournisseur : mock ou kkiapay")
    if provider == "mock":
        return Effective(provider="mock", source="db")
    public = str(body.get("publicKey") or "").strip() or existing.public_key or ""
    private = str(body.get("privateKey") or "").strip() or existing.private_key or ""
    secret_key = str(body.get("secretKey") or "").strip() or existing.secret_key or ""
    secret = str(body.get("webhookSecret") or "").strip() or existing.webhook_secret or ""
    for label, v in (("publique", public), ("privée", private), ("secrète", secret_key), ("du webhook", secret)):
        if not KEY_RE.match(v):
            raise bad_request("INVALID_KEY", f"Clé {label} manquante ou invalide")
    return Effective(provider="kkiapay", public_key=public, private_key=private, secret_key=secret_key, webhook_secret=secret, sandbox=bool(body.get("sandbox", True)), source="db")


def to_row(cfg: Effective) -> dict:
    if cfg.provider != "kkiapay":
        return {"provider": "mock"}
    return {"provider": "kkiapay", "publicKey": cfg.public_key, "sandbox": cfg.sandbox,
            "privateKeyEnc": storage_config.encrypt(cfg.private_key or ""), "secretKeyEnc": storage_config.encrypt(cfg.secret_key or ""), "webhookSecretEnc": storage_config.encrypt(cfg.webhook_secret or "")}

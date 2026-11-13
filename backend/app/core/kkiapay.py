"""KKiaPay : paiement par widget (Mobile Money + carte). Le navigateur n'est JAMAIS cru :
le serveur interroge l'API KKiaPay avec les clés privées pour obtenir le statut et le montant réels."""
from __future__ import annotations

import json
from dataclasses import dataclass

import httpx

from app.core.config import get_settings
from app.core.payment_config import Effective
from app.core.security import random_token

BASE = {"sandbox": "https://api-sandbox.kkiapay.me", "live": "https://api.kkiapay.me"}
REF_PREFIX = "crushduo_"
LEGACY_REF_PREFIX = "kk_"  # références créées avant le marquage : toujours acceptées
STATES = {"SUCCESS": "SUCCESS", "FAILED": "FAILED", "FAILURE": "FAILED", "PENDING": "PENDING"}


@dataclass
class KkiapayTransaction:
    status: str  # SUCCESS | FAILED | PENDING
    amount: float
    reference: str | None
    method: str | None


def auth_headers(cfg: Effective) -> dict[str, str]:
    """En-têtes d'authentification serveur, comme le SDK officiel de KKiaPay : `x-api-key` = clé PUBLIQUE, `x-private-key` = clé privée, `x-secret-key` = secret."""
    h = {"x-api-key": cfg.public_key or "", "x-private-key": cfg.private_key or ""}
    if cfg.secret_key:
        h["x-secret-key"] = cfg.secret_key
    return h


async def post_json(url: str, headers: dict, body: dict, timeout: float) -> tuple[int, dict | None]:
    """Appel HTTP unique vers KKiaPay (point d'extension des tests : aucun appel réseau réel en test)."""
    async with httpx.AsyncClient(timeout=timeout) as c:
        r = await c.post(url, json=body, headers=headers)
    try:
        data = r.json()
    except ValueError:
        data = None
    return r.status_code, data


def _base(cfg: Effective) -> str:
    return BASE["sandbox"] if cfg.sandbox else BASE["live"]


async def verify_transaction(cfg: Effective, transaction_id: str) -> KkiapayTransaction | None:
    """Statut réel d'une transaction. None si inconnue ; lève une exception si KKiaPay est injoignable ou répond de façon inexploitable."""
    status, j = await post_json(f"{_base(cfg)}/api/v1/transactions/status", auth_headers(cfg), {"transactionId": transaction_id}, 10)
    if status in (404, 400):
        return None
    if not 200 <= status < 300:
        raise RuntimeError(f"KKiaPay {status}")
    st = STATES.get(str((j or {}).get("status", "")).upper())
    if not j or not st:
        raise RuntimeError("KKiaPay : réponse inexploitable")
    try:
        amount = float(j.get("amount"))
    except (TypeError, ValueError):
        amount = float("nan")
    # `partnerId` = notre référence de paiement, transmise au widget et restituée ici.
    return KkiapayTransaction(st, amount, str(j["partnerId"]) if j.get("partnerId") else None,
                              str(j["source"]).lower() if j.get("source") else None)


class KkiapayProvider:
    name = "kkiapay"

    def __init__(self, cfg: Effective):
        self.cfg = cfg

    async def create_checkout(self, payment_id: str, amount_xof: int, plan: str | None = None, customer: dict | None = None) -> dict:
        # Un même compte KKiaPay peut servir plusieurs applications (ex. WaMarket) : tout ce qui part de Crushduo est marqué, côté KKiaPay, par la
        # référence (partnerId) qui commence par « crushduo_ », le motif « Crushduo · Premium » et le champ `data`.
        ref = f"{REF_PREFIX}{random_token(12)}"
        site = get_settings().site_name
        reason = f"{site} · {plan.replace('_', ' ').title()}" if plan else site
        return {"providerRef": ref, "widget": {"publicKey": self.cfg.public_key, "sandbox": self.cfg.sandbox, "amount": amount_xof, "reference": ref, "name": (customer or {}).get("name") or site, "email": (customer or {}).get("email"), "reason": reason,
                                               "data": json.dumps({"app": "crushduo", "paymentId": payment_id}, separators=(",", ":"))}}

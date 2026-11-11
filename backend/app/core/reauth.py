"""Nouvelle confirmation avant une action sensible (paiement, etc.) : mot de passe, ou code à 6 chiffres envoyé par e-mail pour les comptes
sans mot de passe (connexion Google). Le code n'est jamais stocké en clair (HMAC lié au compte), vaut 10 minutes, 5 essais, et ne sert qu'une fois."""
from __future__ import annotations

import datetime
import hmac
import secrets

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import mail
from app.core.config import get_settings
from app.core.errors import AppError, bad_request
from app.core.ids import utcnow
from app.core.security import hmac_hex
from app.models.models import SystemSetting, User

TTL = datetime.timedelta(minutes=10)
MAX_ATTEMPTS = 5


def _key(user_id: str, purpose: str) -> str:
    return f"reauth.{purpose}.{user_id}"


def _hash(user_id: str, purpose: str, code: str) -> str:
    return hmac_hex(get_settings().ip_hash_salt, f"{purpose}:{user_id}:{code}")


async def send_code(db: AsyncSession, user: User, purpose: str, what: str) -> None:
    """Émet un code (le précédent est remplacé) et l'envoie à l'adresse du compte."""
    code = get_settings().fixed_email_code or f"{secrets.randbelow(1_000_000):06d}"  # code fixe : développement local uniquement
    value = {"hash": _hash(user.id, purpose, code), "expiresAt": (utcnow() + TTL).isoformat(), "attempts": 0}
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == _key(user.id, purpose)))).scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(SystemSetting(key=_key(user.id, purpose), value=value))
    await db.commit()
    await mail.send(user.email, f"Crushduo : votre code de confirmation ({code})",
                    f"Votre code de confirmation : {code}\n\nIl permet de {what}. Il est valable 10 minutes et ne sert qu'une fois.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message et changez votre mot de passe.",
                    kind="verification")


async def verify_code(db: AsyncSession, user_id: str, purpose: str, code: str) -> None:
    """Vérifie et CONSOMME le code. 400 s'il est faux ou expiré ; 429 après 5 essais."""
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == _key(user_id, purpose)))).scalar_one_or_none()
    v = row.value if row and isinstance(row.value, dict) else None
    if not v or datetime.datetime.fromisoformat(v["expiresAt"]) <= utcnow():
        raise bad_request("CODE_EXPIRED", "Ce code a expiré : demandez-en un nouveau")
    if v.get("attempts", 0) >= MAX_ATTEMPTS:
        raise AppError(429, "CODE_LOCKED", "Trop d'essais : demandez un nouveau code")
    if not hmac.compare_digest(str(v.get("hash", "")), _hash(user_id, purpose, code.strip())):
        row.value = {**v, "attempts": v.get("attempts", 0) + 1}
        await db.commit()
        raise AppError(400, "INVALID_CODE", "Code incorrect", {"remaining": max(MAX_ATTEMPTS - v.get("attempts", 0) - 1, 0)})
    await db.execute(delete(SystemSetting).where(SystemSetting.key == _key(user_id, purpose)))
    await db.commit()

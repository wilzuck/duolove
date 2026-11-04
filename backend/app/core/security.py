"""Hachage des mots de passe (Argon2id, mêmes paramètres que l'ancienne API : les hachés existants restent valides) et primitives."""
import asyncio
import hashlib
import hmac
import secrets

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import get_settings

_hasher = PasswordHasher(type=Type.ID, memory_cost=19456, time_cost=2, parallelism=1)
_dummy: str | None = None


async def hash_password(pw: str) -> str:
    return await asyncio.to_thread(_hasher.hash, pw)


async def verify_password(hashed: str, pw: str) -> bool:
    def _v() -> bool:
        try:
            return _hasher.verify(hashed, pw)
        except (VerificationError, InvalidHashError):
            return False

    return await asyncio.to_thread(_v)


async def dummy_hash() -> str:
    """Haché factice : on vérifie toujours un mot de passe, même pour un e-mail inconnu (temps de réponse constant)."""
    global _dummy
    if _dummy is None:
        _dummy = await hash_password("dummy-password-for-timing")
    return _dummy


def sha256(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()


def random_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_ip(ip: str | None) -> str | None:
    if not ip:
        return None
    return hmac.new(get_settings().ip_hash_salt.encode(), ip.encode(), hashlib.sha256).hexdigest()[:32]


def hmac_hex(secret: str, payload: bytes | str) -> str:
    data = payload.encode() if isinstance(payload, str) else payload
    return hmac.new(secret.encode(), data, hashlib.sha256).hexdigest()


def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())

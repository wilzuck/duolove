"""Code à usage unique basé sur le temps (TOTP, RFC 6238) pour la double authentification : compatible avec Google Authenticator, Microsoft Authenticator, Authy,
FreeOTP, etc. Bibliothèque standard seulement (hmac, hashlib) : aucune dépendance ajoutée.

SHA-1, 6 chiffres, pas de 30 s : les valeurs que TOUTES les applications d'authentification comprennent. Tolérance d'un pas avant/après (décalage d'horloge du téléphone).
Un code déjà accepté ne l'est pas deux fois (le dernier pas utilisé est mémorisé par l'appelant)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

STEP = 30
DIGITS = 6
WINDOW = 1  # pas tolérés avant et après le pas courant


def new_secret() -> str:
    """Secret de 160 bits en base32 (sans « = »), au format attendu par les applications."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _key(secret: str) -> bytes:
    s = secret.strip().replace(" ", "").upper()
    return base64.b32decode(s + "=" * (-len(s) % 8))


def code_at(secret: str, step: int) -> str:
    digest = hmac.new(_key(secret), struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % (10 ** DIGITS)
    return f"{value:0{DIGITS}d}"


def current_step(now: float | None = None) -> int:
    return int((time.time() if now is None else now) // STEP)


def verify(secret: str, code: str, last_step: int | None = None, now: float | None = None) -> int | None:
    """Pas (entier) correspondant au code, ou None. Refuse un pas déjà utilisé (`last_step`) : un même code ne sert qu'une fois."""
    code = (code or "").strip().replace(" ", "")
    if len(code) != DIGITS or not code.isdigit():
        return None
    cur = current_step(now)
    found = None
    for step in range(cur - WINDOW, cur + WINDOW + 1):  # on parcourt tout : temps constant, pas d'information sur le pas trouvé
        if hmac.compare_digest(code_at(secret, step), code) and (last_step is None or step > last_step):
            found = step
    return found


def otpauth_uri(secret: str, account: str, issuer: str) -> str:
    """Lien « otpauth:// » : ouvre directement l'application d'authentification sur téléphone, ou se transforme en QR code."""
    return f"otpauth://totp/{quote(issuer)}:{quote(account)}?secret={secret}&issuer={quote(issuer)}&algorithm=SHA1&digits={DIGITS}&period={STEP}"


def grouped(secret: str) -> str:
    """Secret en groupes de 4 caractères pour la saisie à la main."""
    return " ".join(secret[i:i + 4] for i in range(0, len(secret), 4))


RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sans 0/O/1/I : lisible à voix haute


def new_recovery_codes(n: int = 10) -> list[str]:
    return ["".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(4)) + "-" + "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(4)) for _ in range(n)]


def recovery_hash(user_id: str, code: str) -> str:
    norm = code.strip().upper().replace(" ", "")
    return hmac.new(user_id.encode(), norm.encode(), hashlib.sha256).hexdigest()

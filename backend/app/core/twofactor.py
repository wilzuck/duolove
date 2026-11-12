"""Double authentification (TOTP) facultative : activation confirmée par un premier code, 10 codes de secours, désactivation protégée.

Le secret est chiffré en base (même clé que les secrets saisis en administration : SETTINGS_ENCRYPTION_KEY) ; sans cette clé l'activation est refusée avec une erreur claire,
jamais un secret en clair. Les codes de secours ne sont conservés que sous forme d'empreintes. Un code (TOTP ou de secours) ne sert qu'une fois, sous verrou de ligne."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import totp
from app.core.config import get_settings
from app.core.errors import AppError, conflict
from app.core.ids import utcnow
from app.core.security import verify_password
from app.core.storage_config import decrypt, encrypt
from app.models.models import User

ISSUER = "Crushduo"


def status(user: User) -> dict:
    return {"enabled": bool(user.totpEnabledAt), "pending": bool(user.totpSecretEnc and not user.totpEnabledAt),
            "recoveryLeft": len(user.totpRecovery or []) if user.totpEnabledAt else 0, "hasPassword": bool(user.passwordHash)}


async def begin_setup(db: AsyncSession, user: User) -> dict:
    """Nouveau secret (non actif tant qu'un code n'a pas été confirmé). Refuse si la double authentification est déjà active."""
    if user.totpEnabledAt:
        raise conflict("TWOFA_ALREADY_ON", "La double authentification est déjà activée")
    secret = totp.new_secret()
    user.totpSecretEnc = encrypt(secret)  # lève ENCRYPTION_KEY_MISSING si la clé du serveur manque
    user.totpEnabledAt, user.totpLastStep, user.totpRecovery = None, None, None
    await db.commit()
    return {"secret": totp.grouped(secret), "uri": totp.otpauth_uri(secret, user.email or user.id, get_settings().site_name or ISSUER)}


async def _locked(db: AsyncSession, user_id: str) -> User:
    return (await db.execute(select(User).where(User.id == user_id).with_for_update())).scalar_one()


async def check_code(db: AsyncSession, user_id: str, code: str) -> bool:
    """Code TOTP du pas courant ±1 (jamais deux fois le même) OU code de secours (consommé). Sous verrou de ligne : deux requêtes simultanées ne passent pas avec le même code."""
    user = await _locked(db, user_id)
    secret = decrypt(user.totpSecretEnc) if user.totpSecretEnc else None
    ok = False
    if secret:
        step = totp.verify(secret, code, user.totpLastStep)
        if step is not None:
            user.totpLastStep, ok = step, True
    if not ok and user.totpEnabledAt and code and "-" in code.strip():
        h = totp.recovery_hash(user.id, code)
        left = list(user.totpRecovery or [])
        if h in left:
            left.remove(h)
            user.totpRecovery, ok = left, True
    await db.commit()
    return ok


async def confirm_setup(db: AsyncSession, user_id: str) -> list[str]:
    """À appeler APRÈS check_code réussi sur un secret en attente : active la protection et renvoie les codes de secours (montrés une seule fois)."""
    user = await _locked(db, user_id)
    codes = totp.new_recovery_codes()
    user.totpEnabledAt, user.totpRecovery = utcnow(), [totp.recovery_hash(user.id, c) for c in codes]
    await db.commit()
    return codes


async def enable(db: AsyncSession, user: User, code: str) -> list[str]:
    if user.totpEnabledAt:
        raise conflict("TWOFA_ALREADY_ON", "La double authentification est déjà activée")
    if not user.totpSecretEnc:
        raise conflict("TWOFA_NOT_SETUP", "Commencez par générer une clé")
    if not await check_code(db, user.id, code):
        raise AppError(400, "INVALID_2FA_CODE", "Code incorrect")
    return await confirm_setup(db, user.id)


async def disable(db: AsyncSession, user: User, password: str | None, code: str) -> None:
    """Désactivation : mot de passe (s'il y en a un) ET code valide : une session volée ne suffit pas à couper la protection."""
    if not user.totpEnabledAt:
        raise conflict("TWOFA_NOT_ON", "La double authentification n'est pas activée")
    if user.passwordHash and not (password and await verify_password(user.passwordHash, password)):
        raise AppError(401, "INVALID_CREDENTIALS", "Mot de passe incorrect")
    if not await check_code(db, user.id, code):
        raise AppError(400, "INVALID_2FA_CODE", "Code incorrect")
    u = await _locked(db, user.id)
    u.totpSecretEnc = u.totpEnabledAt = u.totpLastStep = u.totpRecovery = None
    await db.commit()


async def admin_reset(db: AsyncSession, user_id: str) -> bool:
    """Réinitialisation par l'administration (téléphone ET codes de secours perdus), APRÈS vérification de l'identité : coupe la protection et déconnecte tous les appareils."""
    from sqlalchemy import update

    from app.models.models import Session
    u = await _locked(db, user_id)
    was = bool(u.totpEnabledAt)
    u.totpSecretEnc = u.totpEnabledAt = u.totpLastStep = u.totpRecovery = None
    await db.execute(update(Session).where(Session.userId == user_id, Session.revokedAt.is_(None)).values(revokedAt=utcnow()))
    await db.commit()
    return was


async def regenerate_recovery(db: AsyncSession, user: User, code: str) -> list[str]:
    """Nouveaux codes de secours (les anciens deviennent inutilisables) : exige un code valide."""
    if not user.totpEnabledAt:
        raise conflict("TWOFA_NOT_ON", "La double authentification n'est pas activée")
    if not await check_code(db, user.id, code):
        raise AppError(400, "INVALID_2FA_CODE", "Code incorrect")
    return await confirm_setup(db, user.id)

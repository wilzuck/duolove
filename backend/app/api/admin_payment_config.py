"""Configuration du paiement en ligne (KKiaPay) depuis l'administration, comme le stockage R2. Réservé au super administrateur.
Les clés sont chiffrées en base, jamais renvoyées, jamais journalisées ; l'enregistrement redemande le mot de passe (c'est de l'argent)."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import SUP, audit
from app.core import kkiapay, payment_config
from app.core.auth import AuthUser
from app.core.config import get_settings
from app.core.errors import AppError, bad_request, unauthorized
from app.core.ratelimit import limit
from app.core.security import verify_password
from app.db.session import get_db
from app.models.models import SystemSetting, User

router = APIRouter(prefix="/admin/payment-config", tags=["admin"])


class PaymentConfigIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: str
    publicKey: str | None = None
    privateKey: str | None = None  # écriture seule : jamais renvoyée
    webhookSecret: str | None = None  # écriture seule : jamais renvoyé
    sandbox: bool = True
    password: str | None = None


def _webhook_url() -> str:
    return f"{get_settings().api_url.rstrip('/')}/api/payments/webhook/kkiapay"


async def _view() -> dict:
    return {**payment_config.public_view(await payment_config.effective(), _webhook_url()), "encryptionKeyConfigured": bool(get_settings().settings_encryption_key),
            "envProvider": payment_config.from_env().provider, "isProd": get_settings().is_prod}


async def _probe(cfg: payment_config.Effective) -> None:
    """Teste les clés SANS déplacer d'argent : interroge le statut d'une transaction inexistante. 401/403 = clé refusée ; 404/400 = clé acceptée."""
    try:
        status, _ = await kkiapay.post_json(f"{kkiapay._base(cfg)}/api/v1/transactions/status", cfg.private_key or "", {"transactionId": "crushduo_test_inexistante"}, 10)
    except Exception:  # noqa: BLE001
        raise bad_request("PAYMENT_TEST_FAILED", "KKiaPay est injoignable : réessayez dans un instant") from None
    if status in (401, 403):
        raise bad_request("PAYMENT_TEST_FAILED", "Clé privée refusée par KKiaPay (vérifiez qu'elle correspond bien au mode bac à sable ou réel choisi)")
    if status >= 500:
        raise bad_request("PAYMENT_TEST_FAILED", "KKiaPay a répondu par une erreur : réessayez dans un instant")


@router.get("")
async def read(_: AuthUser = SUP):
    return await _view()


@router.post("/test", dependencies=[limit(10, 600)])
async def test(body: PaymentConfigIn, _: AuthUser = SUP):
    cand = payment_config.build(body.model_dump(), await payment_config.effective())
    if cand.provider == "kkiapay":
        await _probe(cand)
    return {"ok": True}


@router.put("", dependencies=[limit(10, 600)])
async def save(body: PaymentConfigIn, a: AuthUser = SUP, db: AsyncSession = Depends(get_db)):
    before = await payment_config.effective()
    cand = payment_config.build(body.model_dump(), before)
    user = await db.get(User, a.id)
    if not user or not user.passwordHash:
        raise AppError(403, "PASSWORD_REQUIRED", "Définissez un mot de passe sur votre compte pour modifier le paiement")
    if not body.password or not await verify_password(user.passwordHash, body.password):
        await audit(db, a.id, "payment.config.denied", "SystemSetting", payment_config.KEY, {"reason": "bad_password"})
        raise unauthorized("INVALID_CREDENTIALS", "Mot de passe incorrect")
    if cand.provider == "kkiapay":
        await _probe(cand)
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == payment_config.KEY))).scalar_one_or_none()
    value = payment_config.to_row(cand)
    if row:
        row.value = value
    else:
        db.add(SystemSetting(key=payment_config.KEY, value=value))
    await db.commit()
    payment_config.invalidate()
    await audit(db, a.id, "payment.config.update", "SystemSetting", payment_config.KEY,
                {"before": {"provider": before.provider, "sandbox": before.sandbox}, "after": {"provider": cand.provider, "sandbox": cand.sandbox},
                 "keysChanged": bool(body.privateKey or body.webhookSecret or body.publicKey)})  # jamais les clés elles-mêmes
    return await _view()

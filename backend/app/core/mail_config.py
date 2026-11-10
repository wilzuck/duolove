"""Choix du fournisseur d'envoi d'e-mails piloté par l'administration (ligne `email.provider` de SystemSetting).

Les identifiants restent dans les variables d'environnement du serveur (BREVO_API_KEY, SMTP_URL) : la console ne choisit que le fournisseur ACTIF,
elle ne stocke aucun secret. « auto » reproduit l'ancien comportement (Brevo s'il est configuré, sinon SMTP). Si le fournisseur choisi n'est pas configuré,
on retombe sur « auto » plutôt que de ne plus rien envoyer ; l'administration voit alors l'écart (`choice` ≠ `active`)."""
import time

from sqlalchemy import select

from app.core.config import get_settings
from app.models.models import SystemSetting

KEY = "email.provider"
CHOICES = ("auto", "brevo", "smtp")
TTL = 30.0
_cache: dict = {"at": 0.0, "choice": None}


def invalidate() -> None:
    _cache["choice"] = None


def configured() -> dict[str, bool]:
    s = get_settings()
    return {"brevo": bool(s.brevo_api_key), "smtp": bool(s.smtp_url)}


def resolve(choice: str) -> str:
    """Fournisseur réellement utilisé : « brevo », « smtp » ou « dev » (aucun configuré)."""
    ok = configured()
    if choice in ("brevo", "smtp") and ok[choice]:
        return choice
    return "brevo" if ok["brevo"] else "smtp" if ok["smtp"] else "dev"


async def choice() -> str:
    """Choix enregistré (« auto » par défaut), relu en base au plus toutes les 30 s et immédiatement après un enregistrement."""
    if _cache["choice"] is not None and time.monotonic() - _cache["at"] < TTL:
        return _cache["choice"]
    from app.db.session import session_maker

    try:
        async with session_maker()() as db:
            row = (await db.execute(select(SystemSetting.value).where(SystemSetting.key == KEY))).scalar_one_or_none()
    except Exception:  # base indisponible : dernier choix connu, sinon « auto » (les e-mails de connexion doivent continuer à partir)
        return _cache["choice"] or "auto"
    c = row.get("provider") if isinstance(row, dict) else None
    c = c if c in CHOICES else "auto"
    _cache["choice"], _cache["at"] = c, time.monotonic()
    return c


async def active() -> str:
    return resolve(await choice())

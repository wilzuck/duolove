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


# ── Mode « e-mails essentiels uniquement » (quota d'envoi presque épuisé, fournisseur en attente…) ─────────────────────────────
# Seuls partent les e-mails nécessaires à l'accès au compte, à la sécurité et aux paiements, ainsi que les tests de l'administration.
# Les autres (notifications, rappels, newsletter, envois groupés) sont notés « ignoré » dans le journal ; les membres les voient
# toujours dans l'application. Désactivé par défaut.
ESSENTIAL_KEY = "email.essentialOnly"
ESSENTIAL_KINDS = frozenset({
    "verification", "password_reset", "magic_link",  # accès au compte
    "security",  # alerte de connexion inhabituelle
    "subscription",  # reçus et rappels liés à un paiement
    "newsletter_confirm",  # lien de double confirmation demandé par la personne
    "other",  # alertes ponctuelles envoyées à l'équipe
    "admin_test", "broadcast_test", "newsletter_test",  # tests lancés depuis l'administration
})
_essential: dict = {"at": 0.0, "on": None}


def invalidate_essential() -> None:
    _essential["on"] = None


async def essential_only() -> bool:
    """Réglage relu en base au plus toutes les 30 s ; base injoignable : dernière valeur connue, sinon désactivé (on n'empêche jamais un e-mail par erreur)."""
    if _essential["on"] is not None and time.monotonic() - _essential["at"] < TTL:
        return _essential["on"]
    from app.db.session import session_maker

    try:
        async with session_maker()() as db:
            row = (await db.execute(select(SystemSetting.value).where(SystemSetting.key == ESSENTIAL_KEY))).scalar_one_or_none()
    except Exception:
        return bool(_essential["on"])
    on = bool(row.get("enabled")) if isinstance(row, dict) else False
    _essential["on"], _essential["at"] = on, time.monotonic()
    return on


def is_essential(kind: str) -> bool:
    return kind in ESSENTIAL_KINDS

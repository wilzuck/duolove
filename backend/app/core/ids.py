"""Identifiants opaques et horodatage UTC (colonnes TIMESTAMP sans fuseau, comme le schéma d'origine)."""
import datetime
import secrets


def new_id() -> str:
    """Identifiant non devinable (≥ 120 bits d'aléa)."""
    return secrets.token_hex(15)


def utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

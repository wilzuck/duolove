"""Briques de validation Pydantic équivalentes aux schémas zod du front (mêmes règles, mêmes codes d'erreur courts)."""
import datetime
import re
from typing import Annotated, Literal

from email_validator import EmailNotValidError, validate_email
from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field

from app.core.constants import COUNTRY_CODES, GENDERS, INTENTS, INTEREST_SLUGS, LIVING, MIN_AGE, SEEKING, age_from_birth_date


class Body(BaseModel):
    """Corps de requête : les clés inconnues sont ignorées (comme zod.object)."""

    model_config = ConfigDict(extra="ignore")


def _strip(v):
    return v.strip() if isinstance(v, str) else v


Trimmed = Annotated[str, BeforeValidator(_strip)]


def _email(v: str) -> str:
    v = v.strip().lower()
    try:
        # `test_environment=True` accepte les domaines réservés (.test) des comptes de démonstration, comme zod `.email()`.
        return validate_email(v, check_deliverability=False, test_environment=True).normalized.lower()
    except EmailNotValidError:
        raise ValueError("invalid_email") from None


Email = Annotated[str, BeforeValidator(_strip), Field(max_length=254), AfterValidator(_email)]


def _password(v: str) -> str:
    if len(v) < 10:
        raise ValueError("password_too_short")
    if not re.search(r"[a-z]", v):
        raise ValueError("password_lowercase")
    if not re.search(r"[A-Z]", v):
        raise ValueError("password_uppercase")
    if not re.search(r"[0-9]", v):
        raise ValueError("password_digit")
    return v


Password = Annotated[str, Field(max_length=128), AfterValidator(_password)]


def _to_datetime(v):
    if isinstance(v, datetime.datetime):
        return v.replace(tzinfo=None) if v.tzinfo is None else v.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    if isinstance(v, datetime.date):
        return datetime.datetime(v.year, v.month, v.day)
    if isinstance(v, str):
        s = v.strip()
        try:
            return _to_datetime(datetime.datetime.fromisoformat(s.replace("Z", "+00:00")))
        except ValueError:
            raise ValueError("invalid_date") from None
    raise ValueError("invalid_date")


DateTime = Annotated[datetime.datetime, BeforeValidator(_to_datetime)]


def _adult(d: datetime.datetime) -> datetime.datetime:
    if age_from_birth_date(d) < MIN_AGE:
        raise ValueError("underage")
    return d


BirthDate = Annotated[datetime.datetime, BeforeValidator(_to_datetime), AfterValidator(_adult)]

GenderT = Literal[GENDERS]  # type: ignore[valid-type]
SeekingT = Literal[SEEKING]  # type: ignore[valid-type]
IntentT = Literal[INTENTS]  # type: ignore[valid-type]
CountryT = Literal[COUNTRY_CODES]  # type: ignore[valid-type]
InterestT = Literal[INTEREST_SLUGS]  # type: ignore[valid-type]
LivingT = Literal[LIVING]  # type: ignore[valid-type]
Iso2 = Annotated[str, Field(pattern=r"^[A-Z]{2}$")]

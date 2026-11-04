from typing import Annotated, Literal

from pydantic import AfterValidator, BeforeValidator, Field

from app.schemas.common import BirthDate, Body, CountryT, DateTime, Email, GenderT, Password, Trimmed, _strip


def _upper(v):
    return v.strip().upper() if isinstance(v, str) else v


def _terms(v: bool) -> bool:
    if v is not True:
        raise ValueError("terms_required")
    return v


class RegisterIn(Body):
    displayName: Annotated[Trimmed, Field(min_length=2, max_length=40)]
    email: Email
    password: Password
    birthDate: BirthDate
    gender: GenderT
    country: CountryT
    city: Annotated[Trimmed, Field(min_length=2, max_length=80)]
    acceptTerms: Annotated[bool, AfterValidator(_terms)]
    referralCode: Annotated[str, BeforeValidator(_upper), Field(max_length=32)] | None = None


class LoginIn(Body):
    email: Email
    password: Annotated[str, Field(min_length=1, max_length=128)]
    remember: bool = True  # « Restez connecté » : session de 30 jours ; sinon 24 h et cookie de session


class MagicLinkIn(Body):
    email: Email
    remember: bool = True


class MagicLinkVerifyIn(Body):
    token: Annotated[str, Field(min_length=10, max_length=200)]
    remember: bool = True


class TokenIn(Body):
    token: Annotated[str, Field(min_length=10, max_length=200)]


class EmailIn(Body):
    email: Email


class ResetIn(Body):
    token: Annotated[str, Field(min_length=10, max_length=200)]
    password: Password


class ChangePasswordIn(Body):
    current: Annotated[str, Field(min_length=1, max_length=128)]
    next: Password


class GoogleIn(Body):
    idToken: Annotated[str, Field(min_length=10)]
    birthDate: DateTime | None = None
    gender: GenderT | None = None
    country: CountryT | None = None
    city: Annotated[Trimmed, Field(min_length=2, max_length=80)] | None = None
    acceptTerms: bool | None = None

"""Critères du menu Match : fonctions pures (aucune requête), testées. Miroir de live/criteria.ts."""
import datetime
from dataclasses import dataclass

from app.core.constants import age_from_birth_date


def gender_ok(seeking: str, gender: str) -> bool:
    return seeking == "EVERYONE" or (seeking == "MEN" and gender == "MAN") or (seeking == "WOMEN" and gender == "WOMAN")


def _tri_ok(want: str, has: bool | None) -> bool:
    return want == "ANY" or (has is not None and (want == "YES") == has)


def _v(x):
    """Valeur d'une énumération SQLAlchemy ou d'une chaîne."""
    return getattr(x, "value", x)


def matches_criteria(c: dict, t, now: datetime.datetime | None = None) -> bool:
    """`c` : critères (dict normalisé) ; `t` : profil candidat (attributs gender, birthDate, country, intent, hasChildren, likesPets,
    living, heightCm, originCountry). Les critères s'appliquent strictement : une donnée absente n'est jamais devinée."""
    if not gender_ok(c["seeking"], _v(t.gender)):
        return False
    age = age_from_birth_date(t.birthDate, now)
    if age < c["ageMin"] or age > c["ageMax"]:
        return False
    if c.get("country") and t.country != c["country"]:
        return False
    if not _tri_ok(c["hasChildren"], t.hasChildren) or not _tri_ok(c["likesPets"], t.likesPets):
        return False
    if c["living"] != "ANY" and _v(t.living) != c["living"]:
        return False
    if c.get("heightMin") is not None and (t.heightCm is None or t.heightCm < c["heightMin"]):
        return False
    if c.get("heightMax") is not None and (t.heightCm is None or t.heightCm > c["heightMax"]):
        return False
    if c.get("originCountry") and t.originCountry != c["originCountry"]:
        return False
    if c.get("intents") and _v(t.intent) not in c["intents"]:
        return False
    return True


@dataclass
class SeekerInfo:
    gender: str
    birthDate: datetime.datetime


def accepts_seeker(pref, seeker, now: datetime.datetime | None = None) -> bool:
    """Réciprocité : la personne invitée doit, elle aussi, accepter le genre et l'âge de la personne qui cherche."""
    if pref is None:
        return False
    age = age_from_birth_date(seeker.birthDate, now)
    return gender_ok(_v(pref.seeking), _v(seeker.gender)) and pref.ageMin <= age <= pref.ageMax


# ───────── Validation des critères (équivalent de liveCriteriaSchema) ─────────
from typing import Literal  # noqa: E402

from pydantic import BaseModel, ValidationError, field_validator, model_validator  # noqa: E402

from app.core.constants import COUNTRY_CODES, INTENTS, MIN_AGE, SEEKING  # noqa: E402

_Tri = Literal["ANY", "YES", "NO"]


class LiveCriteria(BaseModel):
    seeking: Literal["MEN", "WOMEN", "EVERYONE"]
    ageMin: int
    ageMax: int
    country: str | None = None
    hasChildren: _Tri = "ANY"
    likesPets: _Tri = "ANY"
    living: Literal["ANY", "ALONE", "FAMILY", "ROOMMATES"] = "ANY"
    heightMin: int | None = None
    heightMax: int | None = None
    originCountry: str | None = None
    intents: list[Literal["SERIOUS", "MARRIAGE", "DATING", "FRIENDSHIP", "UNSURE"]] | None = None

    @field_validator("ageMin", "ageMax")
    @classmethod
    def _age(cls, v: int) -> int:
        if not MIN_AGE <= v <= 99:
            raise ValueError("invalid_age")
        return v

    @field_validator("country")
    @classmethod
    def _country(cls, v):
        if v is not None and v not in COUNTRY_CODES:
            raise ValueError("invalid_country")
        return v

    @field_validator("heightMin", "heightMax")
    @classmethod
    def _height(cls, v):
        if v is not None and not 120 <= v <= 230:
            raise ValueError("invalid_height")
        return v

    @field_validator("originCountry")
    @classmethod
    def _origin(cls, v):
        import re

        if v is not None and not re.fullmatch(r"[A-Z]{2}", v):
            raise ValueError("invalid_origin_country")
        return v

    @field_validator("intents")
    @classmethod
    def _intents(cls, v):
        if v is not None and len(v) > 5:
            raise ValueError("too_many")
        return v

    @model_validator(mode="after")
    def _ranges(self):
        if self.ageMin > self.ageMax:
            raise ValueError("age_range")
        if self.heightMin is not None and self.heightMax is not None and self.heightMin > self.heightMax:
            raise ValueError("height_range")
        return self


def parse_criteria(raw: object) -> tuple[dict | None, list[dict]]:
    """(critères normalisés, []) ou (None, erreurs [{path, code}])."""
    try:
        return LiveCriteria.model_validate(raw).model_dump(), []
    except ValidationError as e:
        return None, [{"path": ".".join(str(p) for p in err["loc"]), "code": str(err["msg"]).removeprefix("Value error, ")} for err in e.errors()]

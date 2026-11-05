"""Schémas d'entrée des rendez-vous."""
import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.core.constants import DATE_PLACE_KINDS


def _naive_utc(d: datetime.datetime) -> datetime.datetime:
    if d.tzinfo is not None:
        return d.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return d  # une heure sans fuseau est lue comme UTC


class DateIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    startsAt: datetime.datetime
    endsAt: datetime.datetime
    placeKind: Literal[DATE_PLACE_KINDS]  # type: ignore[valid-type]
    placeName: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None

    @field_validator("startsAt", "endsAt")
    @classmethod
    def _utc(cls, v: datetime.datetime) -> datetime.datetime:
        return _naive_utc(v)


class ReminderIn(BaseModel):
    minutesBefore: int = Field(ge=0, le=10080)


class FeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)

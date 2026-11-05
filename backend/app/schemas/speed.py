"""Schémas d'entrée du speed dating."""
import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Text = lambda lo, hi: Annotated[str, StringConstraints(strip_whitespace=True, min_length=lo, max_length=hi)]  # noqa: E731


class EventIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Text(3, 80)
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=600)] = ""
    city: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    ageMin: int = Field(18, ge=18, le=99)
    ageMax: int = Field(99, ge=18, le=99)
    intent: Annotated[str, StringConstraints(pattern=r"^(SERIOUS|MARRIAGE|DATING|FRIENDSHIP|UNSURE)$")] | None = None
    capacity: int = Field(20, ge=4, le=100)
    roundSeconds: int = Field(180, ge=60, le=600)
    rounds: int = Field(4, ge=2, le=10)
    startsAt: datetime.datetime

    @model_validator(mode="after")
    def _check(self):
        if self.ageMin > self.ageMax:
            raise ValueError("ageMin > ageMax")
        if self.startsAt.tzinfo is not None:  # stocké en UTC sans fuseau
            self.startsAt = self.startsAt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        return self


class EventPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Text(3, 80) | None = None
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=600)] | None = None
    capacity: int | None = Field(None, ge=4, le=100)


class MessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: str = Field(min_length=1, max_length=2000)


class DecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pairId: str = Field(min_length=1, max_length=64)
    decision: str = Field(min_length=1, max_length=16)

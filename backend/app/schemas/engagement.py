"""Schémas d'entrée de l'administration de l'engagement."""
import datetime
from typing import Annotated

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Text = lambda lo, hi: Annotated[str, StringConstraints(strip_whitespace=True, min_length=lo, max_length=hi)]  # noqa: E731


class DailyOptionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fr: Text(1, 60)
    en: Text(1, 60)


class DailyQuestionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    day: datetime.date | None = None
    textFr: Text(5, 120)
    textEn: Text(5, 120)
    options: list[DailyOptionIn] = Field(min_length=2, max_length=4)
    active: bool = True


class DailyQuestionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    day: datetime.date | None = None
    textFr: Text(5, 120) | None = None
    textEn: Text(5, 120) | None = None
    options: list[DailyOptionIn] | None = Field(None, min_length=2, max_length=4)
    active: bool | None = None


class DailyAnswerIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    optionKey: str = Field(min_length=1, max_length=8)


class SettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    values: dict[str, object] = Field(min_length=1)


class PromptCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    slug: Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", min_length=2, max_length=40)]
    textFr: Text(5, 120)
    textEn: Text(5, 120)
    sortOrder: int = Field(0, ge=0, le=1000)


class PromptPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    textFr: Text(5, 120) | None = None
    textEn: Text(5, 120) | None = None
    active: bool | None = None
    sortOrder: int | None = Field(None, ge=0, le=1000)


class IcebreakerCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    slug: Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", min_length=2, max_length=60)]
    kind: Literal["INTEREST", "INTENT", "GENERIC"]
    key: str | None = None
    textFr: Text(10, 220)
    textEn: Text(10, 220)
    sortOrder: int = Field(0, ge=0, le=1000)

    @model_validator(mode="after")
    def _key(self):
        from app.core.constants import INTENTS, INTEREST_SLUGS

        if self.kind == "GENERIC":
            self.key = None
        elif self.kind == "INTEREST" and self.key not in INTEREST_SLUGS:
            raise ValueError("key doit être un centre d'intérêt connu")
        elif self.kind == "INTENT" and self.key not in INTENTS:
            raise ValueError("key doit être une intention connue")
        return self


class IcebreakerPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    textFr: Text(10, 220) | None = None
    textEn: Text(10, 220) | None = None
    active: bool | None = None
    sortOrder: int | None = Field(None, ge=0, le=1000)

"""Schémas d'entrée de l'administration de l'engagement."""
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Text = lambda lo, hi: Annotated[str, StringConstraints(strip_whitespace=True, min_length=lo, max_length=hi)]  # noqa: E731


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

"""Schémas d'entrée du blog (admin)."""
from __future__ import annotations

import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.blog import SLUG_RE
from app.schemas.admin import Trim


class PostIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    slug: str = Field(min_length=3, max_length=80)
    locale: Literal["fr", "en"]
    title: Trim(3, 140)
    excerpt: Trim(10, 300)
    body: Trim(20, 40_000)
    coverKey: str | None = None
    coverAlt: Trim(0, 200) | None = None
    status: Literal["DRAFT", "PUBLISHED"] = "DRAFT"
    featured: bool | None = None
    createdAt: datetime.datetime | None = None  # date d'ajout (modifiable, jamais dans le futur)
    publishedAt: datetime.datetime | None = None  # date de publication affichée (modifiable, jamais dans le futur)
    translationOf: str | None = Field(None, max_length=40)  # id de la version de l'article dans l'autre langue

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not SLUG_RE.match(v):
            raise ValueError("slug invalide : minuscules, chiffres et tirets")
        return v


class PostPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    slug: str | None = Field(None, min_length=3, max_length=80)
    title: Trim(3, 140) | None = None
    excerpt: Trim(10, 300) | None = None
    body: Trim(20, 40_000) | None = None
    coverKey: str | None = None
    coverAlt: Trim(0, 200) | None = None
    status: Literal["DRAFT", "PUBLISHED"] | None = None
    featured: bool | None = None
    createdAt: datetime.datetime | None = None
    publishedAt: datetime.datetime | None = None
    translationOf: str | None = Field(None, max_length=40)  # null = délier

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str | None) -> str | None:
        if v is not None and not SLUG_RE.match(v):
            raise ValueError("slug invalide : minuscules, chiffres et tirets")
        return v

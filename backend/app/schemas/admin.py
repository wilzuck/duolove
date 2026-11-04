"""Schémas d'entrée de l'administration (équivalents des schémas Zod de admin.controller.ts)."""
from __future__ import annotations

import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from app.core.constants import DURATION_MONTHS
from app.schemas.payments import PromoCode


def _naive_utc(d: datetime.datetime | None):
    if d is not None and d.tzinfo is not None:
        return d.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return d


def Trim(min_length: int, max_length: int):
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)]


class Sanction(BaseModel):
    reason: Trim(3, 500)
    days: int | None = Field(None, ge=1, le=365)
    reportId: str | None = None


class ResolveReport(BaseModel):
    status: Literal["RESOLVED", "DISMISSED", "REVIEWING"]
    note: str | None = Field(None, max_length=500)


class ReasonOnly(BaseModel):
    reason: Trim(3, 300)


class Review(BaseModel):
    approve: bool
    note: str | None = Field(None, max_length=300)


class RoleChange(BaseModel):
    role: Literal["USER", "MODERATOR", "ADMIN"]


class PromoCreate(BaseModel):
    code: PromoCode
    kind: Literal["PERCENT", "TOKENS"]
    percent: int | None = Field(None, ge=1, le=90)
    tokens: int | None = Field(None, ge=1, le=500)
    maxRedemptions: int | None = Field(None, ge=1, le=1_000_000)
    startsAt: datetime.datetime | None = None
    expiresAt: datetime.datetime | None = None

    @field_validator("startsAt", "expiresAt")
    @classmethod
    def _utc(cls, v):
        return _naive_utc(v)

    @model_validator(mode="after")
    def _coherent(self):
        ok = (self.percent is not None and self.tokens is None) if self.kind == "PERCENT" else (self.tokens is not None and self.percent is None)
        if not ok:
            raise ValueError("kind_value_mismatch")
        if self.startsAt and self.expiresAt and not self.expiresAt > self.startsAt:
            raise ValueError("invalid_period")
        return self


class PromoPatch(BaseModel):
    active: bool | None = None
    maxRedemptions: int | None = Field(None, ge=1, le=1_000_000)
    expiresAt: datetime.datetime | None = None

    @field_validator("expiresAt")
    @classmethod
    def _utc(cls, v):
        return _naive_utc(v)


class PlanFeatures(BaseModel):
    """Fonctionnalités configurables d'une formule (équivalent de planFeaturesSchema)."""
    model_config = ConfigDict(extra="ignore")
    daily_likes_limit: int = Field(strict=True, ge=-1, le=100_000)
    super_likes_weekly: int = Field(strict=True, ge=0, le=1000)
    can_see_likes: bool = Field(strict=True)
    advanced_filters: bool = Field(strict=True)
    boosts_monthly: int = Field(strict=True, ge=0, le=100)
    incognito_mode: bool = Field(strict=True)
    rewind_enabled: bool = Field(strict=True)
    ads_enabled: bool = Field(strict=True)
    live_match_enabled: bool = Field(False, strict=True)
    live_match_trials: int = Field(2, strict=True, ge=0, le=20)
    match_tokens_monthly: int = Field(0, strict=True, ge=0, le=500)
    chat_images_enabled: bool = Field(False, strict=True)
    read_receipts_control: bool = Field(False, strict=True)


class PriceIn(BaseModel):
    months: int
    discountPercent: int = Field(ge=0, le=90)
    amountOverride: int | None = Field(None, ge=0)
    active: bool | None = None

    @field_validator("months")
    @classmethod
    def _months(cls, v):
        if v not in DURATION_MONTHS:
            raise ValueError("invalid_months")
        return v


class PlanPatch(BaseModel):
    name: Trim(2, 40) | None = None
    priceXof: int | None = Field(None, ge=0, le=10_000_000)
    active: bool | None = None
    featured: bool | None = None
    sortOrder: int | None = Field(None, ge=0, le=100)
    features: PlanFeatures | None = None
    prices: list[PriceIn] | None = Field(None, max_length=4)
    taglineFr: Trim(0, 120) | None = None
    taglineEn: Trim(0, 120) | None = None


class ProductPatch(BaseModel):
    name: Trim(2, 60) | None = None
    priceXof: int | None = Field(None, ge=0, le=10_000_000)
    quantity: int | None = Field(None, ge=1, le=1000)
    active: bool | None = None
    sortOrder: int | None = Field(None, ge=0, le=100)


class RefundCreate(BaseModel):
    paymentId: str = Field(min_length=1)
    reason: Trim(5, 500)


class RefundApprove(BaseModel):
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None
    manual: bool | None = None


class RefundReject(BaseModel):
    note: Trim(3, 500)


class FlagSet(BaseModel):
    enabled: bool = Field(strict=True)

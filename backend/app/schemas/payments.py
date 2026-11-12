"""Schémas d'entrée des routes de paiement (équivalents des schémas Zod de @duomatch/types)."""
from __future__ import annotations

import re
from typing import Annotated, Literal, Union

from pydantic import BaseModel, BeforeValidator, Field, StringConstraints


def _promo(v):
    if not isinstance(v, str):
        raise ValueError("invalid_promo")
    v = v.strip().upper()
    if not re.fullmatch(r"[A-Z0-9_-]{3,32}", v):
        raise ValueError("invalid_promo")
    return v


PromoCode = Annotated[str, BeforeValidator(_promo)]
Months = Literal[1, 3, 6, 12]


class LegacyCheckout(BaseModel):
    plan: Literal["PREMIUM", "VIP"]
    months: Months = 1


class SubscriptionCheckout(BaseModel):
    type: Literal["subscription"]
    plan: Literal["PREMIUM", "VIP"]
    months: Months = 1
    promoCode: PromoCode | None = None


class ProductCheckout(BaseModel):
    type: Literal["product"]
    code: Annotated[str, StringConstraints(min_length=2, max_length=40)]
    promoCode: PromoCode | None = None


Checkout = Annotated[Union[SubscriptionCheckout, ProductCheckout], Field(discriminator="type")]


class PromoRedeem(BaseModel):
    code: PromoCode


class PromoPreview(BaseModel):
    code: PromoCode
    target: Checkout


class KkiapayConfirm(BaseModel):
    reference: Annotated[str, StringConstraints(pattern=r"^(crushduo|kk)_[A-Za-z0-9_-]{8,40}$")]
    transactionId: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{4,64}$")]


class SimulateOutcome(BaseModel):
    outcome: Literal["success", "fail"]

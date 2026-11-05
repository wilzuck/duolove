"""Constantes métier. Miroir de packages/types/src/index.ts (le web les lit côté TypeScript) :
toute modification se fait des deux côtés — tests/test_contract.py vérifie la cohérence."""
from __future__ import annotations

import datetime
from dataclasses import dataclass

MIN_AGE = 18
GENDERS = ("MAN", "WOMAN", "NON_BINARY", "OTHER")
SEEKING = ("MEN", "WOMEN", "EVERYONE")
INTENTS = ("SERIOUS", "MARRIAGE", "DATING", "FRIENDSHIP", "UNSURE")
PLAN_CODES = ("FREE", "PREMIUM", "VIP")
REPORT_REASONS = ("FAKE_PROFILE", "SCAM", "HARASSMENT", "INAPPROPRIATE_CONTENT", "UNDERAGE", "SPAM", "OTHER")
COUNTRY_CODES = ("BJ", "CI", "TG", "SN", "CM", "BF", "ML", "GA", "CD", "FR", "BE", "CA")
INTEREST_SLUGS = (
    "music", "cinema", "cooking", "travel", "sport", "reading", "dance", "faith",
    "fashion", "tech", "art", "nature", "photography", "gaming", "entrepreneurship", "family",
)
LIVING = ("ALONE", "FAMILY", "ROOMMATES")
TRI = ("ANY", "YES", "NO")
CREDIT_TYPES = ("SUPER_LIKE", "BOOST_30", "BOOST_120", "BOOST_1440", "MATCH_TOKEN")
BOOST_MINUTES = {"BOOST_30": 30, "BOOST_120": 120, "BOOST_1440": 1440}
DURATION_MONTHS = (1, 3, 6, 12)
DEFAULT_DISCOUNTS = {1: 0, 3: 10, 6: 20, 12: 30}
UNLIMITED_LIKES_CAP = 1000

PLAN_FEATURE_DEFAULTS: dict = {
    "daily_likes_limit": 20, "super_likes_weekly": 0, "can_see_likes": False, "advanced_filters": False,
    "boosts_monthly": 0, "incognito_mode": False, "rewind_enabled": False, "ads_enabled": True,
    "live_match_enabled": False, "live_match_trials": 2, "match_tokens_monthly": 0, "chat_images_enabled": False,
    "read_receipts_control": False,
}

DEFAULT_PLANS = {
    "FREE": {"name": "Gratuit", "priceXof": 0, "featured": False, "sortOrder": 0,
             "features": {**PLAN_FEATURE_DEFAULTS}},
    "PREMIUM": {"name": "Premium", "priceXof": 2500, "featured": True, "sortOrder": 1,
                "features": {"daily_likes_limit": -1, "super_likes_weekly": 5, "can_see_likes": True, "advanced_filters": True,
                             "boosts_monthly": 0, "incognito_mode": False, "rewind_enabled": True, "ads_enabled": False,
                             "live_match_enabled": True, "live_match_trials": 0, "match_tokens_monthly": 5, "chat_images_enabled": True, "read_receipts_control": True}},
    "VIP": {"name": "VIP", "priceXof": 5000, "featured": False, "sortOrder": 2,
            "features": {"daily_likes_limit": -1, "super_likes_weekly": 15, "can_see_likes": True, "advanced_filters": True,
                         "boosts_monthly": 2, "incognito_mode": True, "rewind_enabled": True, "ads_enabled": False,
                         "live_match_enabled": True, "live_match_trials": 0, "match_tokens_monthly": 15, "chat_images_enabled": True, "read_receipts_control": True}},
}

DEFAULT_PRODUCTS = (
    ("BOOST_30", "BOOST", "BOOST_30", "Boost 30 minutes", 1, 300, 0),
    ("BOOST_120", "BOOST", "BOOST_120", "Boost 2 heures", 1, 700, 1),
    ("BOOST_1440", "BOOST", "BOOST_1440", "Boost 24 heures", 1, 1500, 2),
    ("SUPERLIKE_5", "SUPER_LIKE_PACK", "SUPER_LIKE", "Pack 5 Super Likes", 5, 500, 3),
    ("SUPERLIKE_15", "SUPER_LIKE_PACK", "SUPER_LIKE", "Pack 15 Super Likes", 15, 1200, 4),
    ("SUPERLIKE_30", "SUPER_LIKE_PACK", "SUPER_LIKE", "Pack 30 Super Likes", 30, 2000, 5),
    ("TOKENS_5", "TOKEN_PACK", "MATCH_TOKEN", "Pack 5 tokens Match", 5, 1000, 6),
    ("TOKENS_15", "TOKEN_PACK", "MATCH_TOKEN", "Pack 15 tokens Match", 15, 2500, 7),
    ("TOKENS_30", "TOKEN_PACK", "MATCH_TOKEN", "Pack 30 tokens Match", 30, 4500, 8),
)


class LIVE:
    PROFILE_GIFT_TOKENS = 3
    TOKENS_PER_CHAT = 1
    MAX_CHOICES = 2
    COOLDOWN_MINUTES = 15
    SEARCH_HOURS = 24
    INVITE_MINUTES = 30
    MAX_INVITES = 12
    MAX_PENDING_PER_INVITEE = 3
    ONLINE_MINUTES = 5


class REFERRAL:
    REFERRER_TOKENS = 5
    REFEREE_TOKENS = 2
    MAX_REWARDED_PER_REFERRER = 20
    CODE_LENGTH = 8


@dataclass(frozen=True)
class FlagDef:
    key: str
    category: str
    default_on: bool
    emergency: bool


FLAG_CATEGORIES = ("access", "money", "social")
FEATURE_FLAGS = (
    FlagDef("registration_open", "access", True, True),
    FlagDef("payments_enabled", "money", True, True),
    FlagDef("promo_codes", "money", True, False),
    FlagDef("boosts", "money", True, False),
    FlagDef("live_match", "social", True, True),
    FlagDef("super_likes", "social", True, False),
    FlagDef("chat_images", "social", True, True),
    FlagDef("referral_program", "social", True, False),
    FlagDef("profile_prompts", "social", True, False),
    FlagDef("like_comments", "social", True, False),
    FlagDef("daily_picks", "social", True, False),
    FlagDef("message_reactions", "social", True, False),
    FlagDef("message_replies", "social", True, False),
    FlagDef("icebreakers", "social", True, False),
    FlagDef("date_proposals", "social", True, False),
)
FLAG_KEYS = tuple(f.key for f in FEATURE_FLAGS)


def age_from_birth_date(birth: datetime.date | datetime.datetime, now: datetime.datetime | None = None) -> int:
    n = now or datetime.datetime.now(datetime.timezone.utc)
    age = n.year - birth.year
    if (n.month, n.day) < (birth.month, birth.day):
        age -= 1
    return age


def limits_from_features(f: dict) -> dict:
    """Forme consommée par l'application, dérivée des fonctionnalités configurées (clés camelCase comme côté web)."""
    unlimited = f["daily_likes_limit"] < 0
    return {
        "dailyLikes": UNLIMITED_LIKES_CAP if unlimited else f["daily_likes_limit"], "unlimitedLikes": unlimited,
        "superLikesWeekly": f["super_likes_weekly"], "seeLikers": f["can_see_likes"], "advancedFilters": f["advanced_filters"],
        "rewind": f["rewind_enabled"], "boostsMonthly": f["boosts_monthly"], "incognito": f["incognito_mode"], "ads": f["ads_enabled"],
        "liveMatch": f["live_match_enabled"], "liveMatchTrials": f["live_match_trials"], "matchTokensMonthly": f["match_tokens_monthly"], "chatImages": f.get("chat_images_enabled", False), "readReceiptsControl": f.get("read_receipts_control", False),
    }


def price_for_duration(monthly_xof: int, months: int, discount_percent: int, amount_override: int | None = None) -> int:
    if amount_override is not None:
        return amount_override
    # Même arrondi que Math.round (moitié vers le haut) pour des montants positifs.
    return int((monthly_xof * months * (100 - discount_percent)) / 100 + 0.5)

# Jeu fermé de réactions aux messages (côté serveur : un emoji hors liste est refusé).
REACTION_EMOJIS = ("❤️", "😂", "😮", "😢", "👍", "🔥")

# Rendez-vous : catégories de lieux PUBLICS (jeu fermé) et statuts.
DATE_PLACE_KINDS = ("CAFE", "RESTAURANT", "PARK", "MALL", "CULTURE", "OTHER_PUBLIC")
DATE_STATUSES = ("PROPOSED", "ACCEPTED", "DECLINED", "RESCHEDULED", "CANCELED", "COMPLETED")
DATE_REMINDER_MINUTES = (60, 1440)

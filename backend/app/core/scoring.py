"""Score de compatibilité de la découverte (documenté dans docs/PRD.md). Seuls des critères choisis par l'utilisateur interviennent :
aucun classement fondé sur l'origine, la couleur de peau, la religion ou toute autre caractéristique protégée."""
import datetime
import math
from dataclasses import dataclass, field

from app.core.ids import utcnow


@dataclass
class ScoreSubject:
    intent: str
    interests: list[str]
    languages: list[str]
    city: str
    country: str
    lastActiveAt: datetime.datetime
    completeness: int
    verified: bool
    boostedUntil: datetime.datetime | None = None


@dataclass
class ScoreResult:
    compatibility: int
    rank: int
    breakdown: dict[str, int] = field(default_factory=dict)


MAX_RAW = 25 + 25 + 10 + 20 + 10 + 10 + 5 + 5


def _round(x: float) -> int:
    return int(math.floor(x + 0.5))  # Math.round (moitié vers le haut)


def intent_score(a: str, b: str) -> int:
    """Compatibilité d'intention (0–25)."""
    if a == b:
        return 25
    pair = {a, b}
    if "SERIOUS" in pair and "MARRIAGE" in pair:
        return 20
    if "UNSURE" in pair:
        return 12
    if "DATING" in pair and ("SERIOUS" in pair or "MARRIAGE" in pair):
        return 10
    if "DATING" in pair and "FRIENDSHIP" in pair:
        return 8
    return 0


def score_candidate(viewer: ScoreSubject, cand: ScoreSubject, distance_km: float | None, now: datetime.datetime | None = None) -> ScoreResult:
    now = now or utcnow()
    mine = set(viewer.interests)
    shared = len([i for i in cand.interests if i in mine])
    shared_lang = any(l in viewer.languages for l in cand.languages)
    age_days = (now - cand.lastActiveAt).total_seconds() / 86400
    b = {
        "intent": intent_score(viewer.intent, cand.intent),
        "interests": min(shared, 5) * 5,
        "languages": 10 if shared_lang else 0,
        "location": 20 if cand.city.lower() == viewer.city.lower() else 10 if cand.country == viewer.country else 0,
        "distance": 0 if distance_km is None else max(0, 10 - math.floor(distance_km / 25)),
        "activity": 10 if age_days <= 1 else 5 if age_days <= 7 else 2 if age_days <= 30 else 0,
        "completeness": _round(cand.completeness / 100 * 5),
        "verified": 5 if cand.verified else 0,
    }
    raw = sum(b.values())
    compat = min(100, _round(raw / MAX_RAW * 100))
    boost = 20 if cand.boostedUntil and cand.boostedUntil > now else 0
    return ScoreResult(compat, compat + boost, b)

"""Moteur de compatibilité (règles pondérées, explicable). Pondérations pilotées par l'administration (`matching.weights`, total 100).
Valeurs de départ 30/25/20/15/10 : des points de départ à évaluer, pas des vérités scientifiques. Le score est une ESTIMATION d'affinité,
jamais une garantie de compatibilité amoureuse. Seuls des critères choisis par l'utilisateur interviennent : aucun classement fondé sur
l'origine, la couleur de peau, la religion ou toute autre caractéristique protégée.

Architecture : `score_candidate` est une fonction pure (entrées = sujets + préférences + poids). Un modèle appris pourra la remplacer plus tard
derrière la même signature, une fois des données suffisantes collectées avec consentement (voir docs/MATCHING_ARCHITECTURE.md)."""
import datetime
import math
from dataclasses import dataclass, field

from app.core.ids import utcnow

DEFAULT_WEIGHTS = {"intent": 30, "mutual": 25, "interests": 20, "location": 15, "other": 10}
BOOST_RANK = 20


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
    age: int | None = None


@dataclass
class SoftPrefs:
    """Critères facultatifs déclarés par une personne (vide = indifférent). Les critères obligatoires sont déjà des filtres SQL."""
    intents: list[str] = field(default_factory=list)
    languages: list[str] = field(default_factory=list)
    interests: list[str] = field(default_factory=list)


@dataclass
class ScoreResult:
    compatibility: int
    rank: int
    breakdown: dict[str, int] = field(default_factory=dict)  # points par famille de critères (somme = compatibility, à l'arrondi près)
    reasons: list[dict] = field(default_factory=list)  # [{code, ...params}] les plus contributives d'abord
    common_interests: list[str] = field(default_factory=list)
    intents_compatible: bool = False


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


def _soft(prefs: SoftPrefs | None, target: ScoreSubject) -> float:
    """Part des critères facultatifs déclarés que `target` satisfait (1 si aucun critère déclaré)."""
    if prefs is None:
        return 1.0
    checks = []
    if prefs.intents:
        checks.append(target.intent in prefs.intents)
    if prefs.languages:
        checks.append(any(l in prefs.languages for l in target.languages))
    if prefs.interests:
        checks.append(any(i in prefs.interests for i in target.interests))
    return sum(checks) / len(checks) if checks else 1.0


def normalize_weights(w: dict | None) -> dict[str, float]:
    w = {k: max(0, float((w or {}).get(k, v))) for k, v in DEFAULT_WEIGHTS.items()}
    total = sum(w.values()) or 1.0
    return {k: v * 100 / total for k, v in w.items()}


def score_candidate(viewer: ScoreSubject, cand: ScoreSubject, distance_km: float | None, now: datetime.datetime | None = None, *,
                    weights: dict | None = None, viewer_prefs: SoftPrefs | None = None, cand_prefs: SoftPrefs | None = None) -> ScoreResult:
    now = now or utcnow()
    w = normalize_weights(weights)
    mine = set(viewer.interests)
    common = [i for i in cand.interests if i in mine]
    shared_lang = any(l in viewer.languages for l in cand.languages)
    age_days = (now - cand.lastActiveAt).total_seconds() / 86400
    same_city = cand.city.lower() == viewer.city.lower()
    activity = 1.0 if age_days <= 1 else 0.5 if age_days <= 7 else 0.2 if age_days <= 30 else 0.0
    loc = 1.0 if same_city else 0.5 if cand.country == viewer.country else 0.0
    if distance_km is not None:
        loc = max(loc, max(0.0, 1 - distance_km / 150))
    # Préférences mutuelles : la réciprocité (âge, genre) est déjà un filtre ; ici, la part des critères facultatifs satisfaits des DEUX côtés.
    mutual = 0.4 + 0.6 * (_soft(viewer_prefs, cand) + _soft(cand_prefs, viewer)) / 2
    parts = {
        "intent": intent_score(viewer.intent, cand.intent) / 25,
        "mutual": mutual,
        "interests": min(len(common), 5) / 5,
        "location": loc,
        "other": 0.4 * shared_lang + 0.3 * activity + 0.2 * (cand.completeness / 100) + 0.1 * cand.verified,
    }
    pts = {k: parts[k] * w[k] for k in parts}
    compat = min(100, _round(sum(pts.values())))
    reasons: list[tuple[float, dict]] = []
    if parts["intent"] >= 0.8:
        reasons.append((pts["intent"], {"code": "intent_same" if viewer.intent == cand.intent else "intent_close"}))
    elif parts["intent"] >= 0.4:
        reasons.append((pts["intent"], {"code": "intent_close"}))
    if common:
        reasons.append((pts["interests"], {"code": "interests_common", "n": len(common)}))
    if same_city:
        reasons.append((pts["location"], {"code": "same_city"}))
    elif cand.country == viewer.country:
        reasons.append((pts["location"], {"code": "same_country"}))
    if shared_lang:
        reasons.append((pts["other"] * 0.8, {"code": "languages_shared"}))
    if mutual >= 0.9:
        reasons.append((pts["mutual"], {"code": "preferences_match"}))
    if activity >= 0.5:
        reasons.append((pts["other"] * 0.5, {"code": "active_recently"}))
    if cand.verified:
        reasons.append((pts["other"] * 0.3, {"code": "verified"}))
    reasons.sort(key=lambda r: r[0], reverse=True)
    boost = BOOST_RANK if cand.boostedUntil and cand.boostedUntil > now else 0
    return ScoreResult(compat, compat + boost, {k: _round(v) for k, v in pts.items()}, [r for _, r in reasons[:4]], common, parts["intent"] >= 0.4)

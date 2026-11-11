import datetime

from app.core.completeness import completeness_level, compute_completeness
from app.core.constants import age_from_birth_date
from app.core.ids import utcnow
from app.core.profile_card import approx_distance_km
from app.core.scoring import ScoreSubject, intent_score, score_candidate
from app.schemas.auth import RegisterIn
import pytest
from pydantic import ValidationError
from types import SimpleNamespace

BASE = ScoreSubject(intent="SERIOUS", interests=["music", "travel", "cooking"], languages=["fr"], city="Lomé", country="TG",
                    lastActiveAt=utcnow(), completeness=80, verified=False, boostedUntil=None)


def sub(**kw):
    return ScoreSubject(**{**BASE.__dict__, **kw})


def test_intent_score():
    assert intent_score("SERIOUS", "SERIOUS") == 25
    assert intent_score("SERIOUS", "MARRIAGE") == 20
    assert intent_score("SERIOUS", "FRIENDSHIP") == 0
    assert intent_score("UNSURE", "MARRIAGE") == 12


def test_near_profile_ranks_above_far_one():
    near = score_candidate(BASE, sub(interests=["music", "travel"]), 5)
    far = score_candidate(BASE, sub(interests=[], city="Dakar", country="SN", languages=["en"], intent="FRIENDSHIP",
                                    lastActiveAt=utcnow() - datetime.timedelta(days=60), completeness=20), 3000)
    assert near.compatibility > far.compatibility
    assert near.compatibility <= 100


def test_boost_changes_rank_not_compatibility():
    plain = score_candidate(BASE, BASE, None)
    boosted = score_candidate(BASE, sub(boostedUntil=utcnow() + datetime.timedelta(seconds=60)), None)
    assert boosted.compatibility == plain.compatibility
    assert boosted.rank == plain.rank + 20


def test_expired_boost_has_no_effect():
    r = score_candidate(BASE, sub(boostedUntil=utcnow() - datetime.timedelta(seconds=1)), None)
    assert r.rank == r.compatibility


def test_completeness():
    empty = compute_completeness(bio="", occupation=None, interest_count=0, photo_count=0, intent="UNSURE")
    full = compute_completeness(bio="x" * 50, occupation="Dev", interest_count=4, photo_count=3, intent="SERIOUS")
    assert empty == 30 and full == 100
    assert completeness_level(empty) == "INCOMPLETE"
    assert completeness_level(70) == "IN_PROGRESS"
    assert completeness_level(full) == "COMPLETE"


def test_approx_distance_rounded_to_5km():
    A = lambda lat, lng: SimpleNamespace(approxLat=lat, approxLng=lng)  # noqa: E731
    assert approx_distance_km(A(6.1, 1.2), A(6.2, 1.2)) % 5 == 0
    assert approx_distance_km(A(None, None), A(6.2, 1.2)) is None


OK = dict(displayName="Ama", email="AMA@Test.com", password="Abcdefghi1", birthDate="1995-05-05", gender="WOMAN", country="TG", city="Lomé", acceptTerms=True)


def test_register_schema_accepts_adult_and_normalizes_email():
    assert RegisterIn(**OK).email == "ama@test.com"


def test_register_schema_rejects_minor_weak_password_and_missing_terms():
    n = utcnow()
    kid = n.replace(year=n.year - 17).date().isoformat()
    for bad in ({"birthDate": kid}, {"password": "court"}, {"acceptTerms": False}):
        with pytest.raises(ValidationError):
            RegisterIn(**{**OK, **bad})


def test_age_on_birthday():
    d = datetime.datetime(2000, 6, 15)
    assert age_from_birth_date(d, datetime.datetime(2026, 6, 14)) == 25
    assert age_from_birth_date(d, datetime.datetime(2026, 6, 15)) == 26


def test_distance_depuis_la_ville_sans_position_partagee():
    from app.core.city_coords import city_coords
    from app.core.cities import POPULAR_CITIES

    P = lambda country, city, lat=None, lng=None: SimpleNamespace(approxLat=lat, approxLng=lng, country=country, city=city)  # noqa: E731
    d = approx_distance_km(P("TG", "Lomé"), P("BJ", "Cotonou"))
    assert d is not None and 120 <= d <= 160 and d % 5 == 0  # Lomé–Cotonou ≈ 135 km
    assert approx_distance_km(P("TG", "lome"), P("TG", "LOMÉ")) == 0  # casse et accents sans effet ; même ville : 0 (« moins de 5 km »)
    assert approx_distance_km(P("TG", "Village inconnu"), P("TG", "Lomé")) is None
    # La position partagée reste prioritaire sur la ville.
    assert approx_distance_km(P("TG", "Lomé", 6.1, 1.2), P("TG", "Kara", 6.2, 1.2)) == 10
    # Toutes les villes proposées à l'inscription ont des coordonnées.
    assert [(c, v) for c, vs in POPULAR_CITIES.items() for v in vs if city_coords(c, v) is None] == []

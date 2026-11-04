async def test_health(http):
    r = await http.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


async def test_unknown_route_uses_error_format(http):
    r = await http.get("/api/nope")
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"


def test_dates_are_iso_with_z():
    import datetime

    from fastapi.encoders import jsonable_encoder

    import app.main  # noqa: F401  (installe l'encodeur)

    assert jsonable_encoder({"d": datetime.datetime(2026, 11, 4, 10, 0, 0, 123000)}) == {"d": "2026-11-04T10:00:00.123Z"}


def test_reserved_test_domains_are_valid_emails():
    """Les comptes de démonstration (…@duo.test) doivent pouvoir se connecter, comme avec zod `.email()`."""
    from app.schemas.auth import LoginIn

    assert LoginIn(email="Admin@duo.test", password="x").email == "admin@duo.test"

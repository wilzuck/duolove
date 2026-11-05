"""Connexion Google : le jeton est vérifié auprès de Google (simulé ici, aucun appel réseau) — audience, émetteur, expiration, e-mail confirmé,
majorité à l'inscription, liaison à un compte existant, pré-détournement d'un compte jamais confirmé."""
import datetime
import time
import types

import pytest
from sqlalchemy import select, update

from app.core import authsvc
from app.core.config import get_settings
from app.core.ids import utcnow
from app.core.security import hash_password
from app.db.session import session_maker
from app.models.models import Account, Profile, Session, User
from tests.helpers import new_agent, uid

CLIENT = "test-client.apps.googleusercontent.com"
ORIGIN = {"Origin": "http://localhost:3000"}


class FakeResp:
    def __init__(self, status: int, payload: dict):
        self.status_code, self._p = status, payload

    def json(self):
        return self._p


@pytest.fixture
def google(monkeypatch):
    """Configure un client Google factice et expose `claims` (ce que « Google » répondrait au jeton)."""
    monkeypatch.setattr(get_settings(), "google_client_id", CLIENT)
    state = {"status": 200, "claims": {}}

    class FakeClient:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, url, params=None):
            assert url == "https://oauth2.googleapis.com/tokeninfo" and params and params["id_token"]
            return FakeResp(state["status"], state["claims"])

    monkeypatch.setattr(authsvc, "httpx", types.SimpleNamespace(AsyncClient=FakeClient))  # seulement dans authsvc : le client de test garde le vrai httpx
    return state


def claims(email: str, **over) -> dict:
    return {"aud": CLIENT, "iss": "https://accounts.google.com", "sub": f"sub-{uid()}", "email": email, "email_verified": "true", "name": "Awa Kone",
            "exp": str(int(time.time()) + 3600), **over}


def signup_body(**over) -> dict:
    return {"idToken": "x" * 20, "birthDate": "1995-05-05", "gender": "WOMAN", "country": "CI", "city": "Abidjan", "acceptTerms": True, **over}


async def post(path_body: dict):
    return await new_agent_app.post("/api/auth/google", json=path_body, headers=ORIGIN)


@pytest.fixture(autouse=True)
def _agent(app):
    global new_agent_app
    new_agent_app = new_agent(app)


def code(r):
    return (r.json().get("error") or {}).get("code")


async def test_not_configured_and_invalid_tokens(app, monkeypatch, google):
    monkeypatch.setattr(get_settings(), "google_client_id", None)
    assert code(await post(signup_body())) == "OAUTH_NOT_CONFIGURED"
    monkeypatch.setattr(get_settings(), "google_client_id", CLIENT)
    google["status"] = 400
    assert code(await post(signup_body())) == "INVALID_OAUTH_TOKEN"  # Google refuse le jeton
    google["status"] = 200
    email = f"g-{uid()}@example.com"
    for bad in ({"aud": "autre-client"}, {"iss": "https://evil.example"}, {"email_verified": "false"}, {"exp": str(int(time.time()) - 10)}, {"sub": ""}):
        google["claims"] = claims(email, **bad)
        assert code(await post(signup_body())) == "INVALID_OAUTH_TOKEN", bad


async def test_new_account_needs_details_adult_and_terms(app, google):
    email = f"g-{uid()}@example.com"
    google["claims"] = claims(email)
    assert code(await post({"idToken": "x" * 20})) == "PROFILE_DETAILS_REQUIRED"  # nouveau : il faut compléter le profil
    adult_limit = (utcnow() - datetime.timedelta(days=365 * 17)).date().isoformat()
    assert (await new_agent_app.post("/api/auth/google", json=signup_body(birthDate=adult_limit), headers=ORIGIN)).status_code == 400  # mineur refusé
    assert (await new_agent_app.post("/api/auth/google", json=signup_body(acceptTerms=False), headers=ORIGIN)).status_code == 400
    async with session_maker()() as s:
        assert (await s.execute(select(User.id).where(User.email == email))).first() is None  # rien n'a été créé
    r = await post(signup_body())
    assert r.status_code == 200 and r.json()["emailVerified"] is True and "duomatch_sid" in r.cookies
    async with session_maker()() as s:
        u = (await s.execute(select(User).where(User.email == email))).scalar_one()
        assert u.emailVerifiedAt and u.passwordHash is None
        assert (await s.execute(select(Account.provider).where(Account.userId == u.id))).scalar_one() == "google"
        assert (await s.execute(select(Profile.displayName).where(Profile.userId == u.id))).scalar_one() == "Awa Kone"
    me = await new_agent_app.get("/api/users/me")  # session valide, pas de confirmation de l'e-mail à refaire
    assert me.status_code == 200 and me.json()["emailVerified"] is True


async def test_existing_google_user_logs_in_again_without_details(app, google):
    email = f"g-{uid()}@example.com"
    google["claims"] = claims(email, sub=f"same-{uid()}")
    assert (await post(signup_body())).status_code == 200
    again = await new_agent(app).post("/api/auth/google", json={"idToken": "y" * 20, "remember": False}, headers=ORIGIN)
    assert again.status_code == 200
    assert "expires" not in again.headers.get("set-cookie", "").lower()  # sans « Restez connecté » : cookie de session


async def test_links_existing_verified_account_by_email(app, db, google):
    from tests.helpers import seed_member
    m = await seed_member(db, gender="MAN", seeking="WOMEN", city=f"G-{uid()}")
    sub_link = f"link-{uid()}"
    google["claims"] = claims(m["email"], sub=sub_link)
    assert (await post({"idToken": "z" * 20})).status_code == 200
    async with session_maker()() as s:
        assert (await s.execute(select(Account.providerAccountId).where(Account.userId == m["id"], Account.provider == "google"))).scalar_one() == sub_link


async def test_unconfirmed_account_is_not_hijackable(app, google):
    """Quelqu'un a créé un compte avec l'adresse d'autrui (jamais confirmée) et choisi un mot de passe : la vraie personne se connecte avec Google."""
    email = f"victim-{uid()}@example.com"
    old_hash = f"h{uid()}".ljust(64, "0")
    async with session_maker()() as s:
        u = User(email=email, passwordHash=await hash_password("Attaquant-2026!aa"), acceptedTermsAt=utcnow())
        s.add(u)
        await s.flush()
        s.add(Session(userId=u.id, tokenHash=old_hash, expiresAt=utcnow() + datetime.timedelta(days=1)))
        uid_ = u.id
        await s.commit()
    google["claims"] = claims(email, sub=f"victim-{uid()}")
    r = await post({"idToken": "v" * 20})
    assert r.status_code == 200
    async with session_maker()() as s:
        u = await s.get(User, uid_)
        assert u.emailVerifiedAt and u.passwordHash is None  # l'ancien mot de passe de l'attaquant ne marche plus
        assert (await s.execute(select(Session.id).where(Session.userId == uid_, Session.tokenHash == old_hash))).first() is None  # ses sessions sont révoquées
    assert (await new_agent_app.post("/api/auth/login", json={"email": email, "password": "Attaquant-2026!aa"}, headers=ORIGIN)).status_code == 401

"""Confirmation d'e-mail par code à 6 chiffres : garde de toute l'application, essais limités, expiration, renvoi, suppression des comptes non confirmés."""
import datetime
import re

import pytest
from sqlalchemy import delete, select, update

from app.core import appsettings, authsvc
from app.core.ids import utcnow
from app.db.session import session_maker
from app.models.models import EmailCode, Profile, SystemSetting, User
from tests.helpers import PASSWORD, login, new_agent, seed_member, uid
from tests.support_c import admin


@pytest.fixture(autouse=True)
async def _clean(app):
    async def wipe():
        async with session_maker()() as s:
            await s.execute(delete(SystemSetting).where(SystemSetting.key.in_(appsettings.KEYS)))
            await s.commit()
        appsettings.invalidate()

    await wipe()
    yield
    await wipe()


def code(r):
    return (r.json().get("error") or {}).get("code")


async def register(app):
    """Inscription par l'API : retourne (agent connecté non confirmé, e-mail, code reçu)."""
    c = new_agent(app)
    email = f"cd-{uid()}-{uid()}@test.duomatch"
    r = await c.post("/api/auth/register", json={"displayName": "Nouveau", "email": email, "password": PASSWORD, "birthDate": "1990-05-05", "gender": "MAN",
                                                 "country": "TG", "city": f"R-{uid()}", "acceptTerms": True})
    assert r.status_code == 201, r.text
    return c, email, await last_code(c, email)


async def last_code(c, email: str) -> str:
    box = (await c.get("/api/dev/outbox")).json()
    mail = [m for m in box if m["to"] == email][-1]
    return re.search(r"code de confirmation : (\d{6})", mail["text"]).group(1)


async def user_id(email: str) -> str:
    async with session_maker()() as s:
        return (await s.execute(select(User.id).where(User.email == email))).scalar_one()


# ───────── garde : rien n'est possible avant la confirmation ─────────
async def test_register_sends_a_six_digit_code_and_blocks_everything_else(app, db):
    c, email, cd = await register(app)
    assert re.fullmatch(r"\d{6}", cd)
    me = (await c.get("/api/users/me")).json()
    assert me["emailVerified"] is False  # l'état reste lisible : c'est ce qui permet d'afficher l'écran de confirmation
    for method, path in (("get", "/api/discovery"), ("get", "/api/profiles/me"), ("patch", "/api/profiles/me"), ("post", "/api/profiles/me/onboarding/complete"),
                         ("get", "/api/conversations"), ("get", "/api/discovery/daily"), ("get", "/api/engagement/config"), ("get", "/api/notifications"),
                         ("post", "/api/swipes"), ("get", "/api/subscriptions/me")):
        r = await getattr(c, method)(path, **({"json": {}} if method in ("post", "patch") else {}))
        assert r.status_code == 403 and code(r) == "EMAIL_NOT_VERIFIED", (method, path, r.status_code, r.text[:80])
    state = (await c.get("/api/auth/verification")).json()
    assert state["verified"] is False and state["email"].endswith("@test.duomatch") and "•" in state["email"] and state["codeMinutes"] == 15 and state["deleteAfterHours"] == 72
    assert (await new_agent(app).post("/api/auth/verify-code", json={"code": cd})).status_code == 401
    assert (await c.post("/api/auth/logout")).status_code == 200  # on peut toujours se déconnecter


async def test_correct_code_confirms_and_unlocks_the_app(app, db):
    c, email, cd = await register(app)
    assert (await c.post("/api/auth/verify-code", json={"code": cd})).status_code == 200
    assert (await c.get("/api/users/me")).json()["emailVerified"] is True
    assert (await c.get("/api/profiles/me")).status_code == 200
    assert (await c.post("/api/auth/verify-code", json={"code": "000000"})).status_code == 200  # déjà confirmé : sans effet
    async with session_maker()() as s:
        assert (await s.execute(select(User.emailVerifiedAt).where(User.email == email))).scalar_one() is not None


async def test_wrong_codes_are_limited_then_a_new_code_is_required(app, db):
    c, email, cd = await register(app)
    bad = "000000" if cd != "000000" else "111111"
    for left in (4, 3, 2, 1):
        r = await c.post("/api/auth/verify-code", json={"code": bad})
        assert code(r) == "INVALID_CODE" and r.json()["error"]["details"]["remaining"] == left
    r = await c.post("/api/auth/verify-code", json={"code": bad})
    assert code(r) == "INVALID_CODE" and r.json()["error"]["details"]["remaining"] == 0
    assert code(await c.post("/api/auth/verify-code", json={"code": cd})) == "CODE_EXPIRED"  # même le bon code ne passe plus : il faut un nouveau code
    assert (await c.get("/api/discovery")).status_code == 403
    uid_ = await user_id(email)
    async with session_maker()() as s:  # le délai de 30 s est écoulé
        await s.execute(update(EmailCode).where(EmailCode.userId == uid_).values(createdAt=utcnow() - datetime.timedelta(minutes=2)))
        await s.commit()
    assert (await c.post("/api/auth/resend-verification")).status_code == 200
    fresh = await last_code(c, email)
    assert (await c.post("/api/auth/verify-code", json={"code": fresh})).status_code == 200


async def test_format_expiry_and_hash_storage(app, db):
    c, email, cd = await register(app)
    for bad in ("12345", "1234567", "abcdef", "12 456", ""):
        assert (await c.post("/api/auth/verify-code", json={"code": bad})).status_code == 400
    uid_ = await user_id(email)
    async with session_maker()() as s:
        row = (await s.execute(select(EmailCode).where(EmailCode.userId == uid_))).scalar_one()
        assert cd not in row.codeHash and len(row.codeHash) == 64  # jamais le code en clair
        row.expiresAt = utcnow() - datetime.timedelta(seconds=1)
        await s.commit()
    assert code(await c.post("/api/auth/verify-code", json={"code": cd})) == "CODE_EXPIRED"


async def test_resend_cooldown_and_old_code_invalidation(app, db):
    c, email, first = await register(app)
    r = await c.post("/api/auth/resend-verification")
    assert r.status_code == 429 and code(r) == "RESEND_TOO_SOON" and r.json()["error"]["details"]["retryAfter"] >= 1  # juste après l'inscription : trop tôt
    uid_ = await user_id(email)
    async with session_maker()() as s:
        await s.execute(update(EmailCode).where(EmailCode.userId == uid_).values(createdAt=utcnow() - datetime.timedelta(minutes=1)))
        await s.commit()
    ok = await c.post("/api/auth/resend-verification")
    assert ok.status_code == 200 and ok.json()["resendIn"] == 30
    second = await last_code(c, email)
    if second != first:  # l'ancien code est invalidé dès qu'un nouveau est émis
        assert code(await c.post("/api/auth/verify-code", json={"code": first})) == "INVALID_CODE"
    assert (await c.post("/api/auth/verify-code", json={"code": second})).status_code == 200


async def test_email_link_still_works_and_unblocks(app, db):
    c, email, _ = await register(app)
    box = (await c.get("/api/dev/outbox")).json()
    token = re.search(r"verify-email\?token=([\w-]+)", [m for m in box if m["to"] == email][-1]["text"]).group(1)
    assert (await new_agent(app).post("/api/auth/verify-email", json={"token": token})).status_code == 200
    assert (await c.get("/api/profiles/me")).status_code == 200


async def test_login_of_unverified_account_stays_gated_and_member_flows_untouched(app, db):
    c, email, cd = await register(app)
    again = await login(app, email)  # reconnexion : même garde
    assert (await again.get("/api/discovery")).status_code == 403
    await c.post("/api/auth/verify-code", json={"code": cd})
    ok = await seed_member(db, gender="MAN", seeking="WOMEN", city=f"G-{uid()}")  # un membre normal (déjà confirmé) n'est pas concerné
    assert (await (await login(app, ok["email"])).get("/api/discovery")).status_code == 200


# ───────── réglages admin et suppression des comptes non confirmés ─────────
async def test_admin_settings_for_code_and_deletion_delay(app, db):
    a = await admin(app, db)
    cur = (await a.agent.get("/api/admin/settings")).json()["values"]
    assert cur["signup.code_ttl_minutes"] == 15 and cur["signup.unverified_ttl_hours"] == 72  # valeurs par défaut
    assert code(await a.agent.patch("/api/admin/settings", json={"values": {"signup.unverified_ttl_hours": 0}})) == "INVALID_SETTING"
    assert code(await a.agent.patch("/api/admin/settings", json={"values": {"signup.code_ttl_minutes": 1}})) == "INVALID_SETTING"
    assert (await a.agent.patch("/api/admin/settings", json={"values": {"signup.code_ttl_minutes": 5, "signup.unverified_ttl_hours": 24}})).status_code == 200
    c, email, _ = await register(app)
    st = (await c.get("/api/auth/verification")).json()
    assert st["codeMinutes"] == 5 and st["deleteAfterHours"] == 24
    uid_ = await user_id(email)
    async with session_maker()() as s:
        row = (await s.execute(select(EmailCode).where(EmailCode.userId == uid_))).scalar_one()
        assert 4 * 60 < (row.expiresAt - row.createdAt).total_seconds() <= 5 * 60 + 1  # la durée du code suit le réglage


async def test_purge_deletes_only_old_unverified_member_accounts(app, db):
    a = await admin(app, db)
    old_unverified, _, _ = await register(app)
    old_email = (await old_unverified.get("/api/users/me")).json()["email"]
    recent, _, _ = await register(app)
    recent_email = (await recent.get("/api/users/me")).json()["email"]
    verified_old = await seed_member(db, gender="MAN", seeking="WOMEN", city=f"P-{uid()}")
    staff = await seed_member(db, gender="MAN", seeking="WOMEN", city=f"P-{uid()}")
    google_like = await seed_member(db, gender="MAN", seeking="WOMEN", city=f"P-{uid()}")
    long_ago = utcnow() - datetime.timedelta(days=10)
    async with session_maker()() as s:
        await s.execute(update(User).where(User.email.in_([old_email, verified_old["email"], staff["email"], google_like["email"]])).values(createdAt=long_ago))
        await s.execute(update(User).where(User.email == staff["email"]).values(emailVerifiedAt=None, role="MODERATOR"))
        await s.execute(update(User).where(User.email == google_like["email"]).values(emailVerifiedAt=None, passwordHash=None))
        await s.commit()
    before = (await a.agent.get("/api/admin/engagement/metrics")).json()["signup"]
    async with session_maker()() as s:
        removed = await authsvc.purge_unverified(s)
    assert removed >= 1
    async with session_maker()() as s:
        emails = set((await s.execute(select(User.email).where(User.email.in_([old_email, recent_email, verified_old["email"], staff["email"], google_like["email"]])))).scalars())
    assert emails == {recent_email, verified_old["email"], staff["email"], google_like["email"]}  # seul l'ancien compte non confirmé a disparu
    after = (await a.agent.get("/api/admin/engagement/metrics")).json()["signup"]
    assert after["unverifiedPurgedTotal"] == before["unverifiedPurgedTotal"] + removed
    # Le délai est réglé par l'administration : à 720 h, un compte de 10 jours n'est pas supprimé.
    await a.agent.patch("/api/admin/settings", json={"values": {"signup.unverified_ttl_hours": 720}})
    async with session_maker()() as s:
        await s.execute(update(User).where(User.email == recent_email).values(createdAt=long_ago))
        await s.commit()
    async with session_maker()() as s:
        assert await authsvc.purge_unverified(s) == 0
        assert (await s.execute(select(User.id).where(User.email == recent_email))).first() is not None
    await a.agent.patch("/api/admin/settings", json={"values": {"signup.unverified_ttl_hours": 72}})
    async with session_maker()() as s:
        assert await authsvc.purge_unverified(s) >= 1
        assert (await s.execute(select(User.id).where(User.email == recent_email))).first() is None
        assert (await s.execute(select(Profile.id).join(User, User.id == Profile.userId).where(User.email == recent_email))).first() is None  # profil supprimé en cascade


def test_fixed_dev_code_exists_only_in_local_development():
    """Le code fixe (000000) n'existe qu'en développement local : jamais en test, jamais en production (le serveur refuse de démarrer)."""
    from app.core.config import Settings

    make = lambda **kw: Settings(_env_file=None, **kw)  # noqa: E731
    assert make(NODE_ENV="development").fixed_email_code == "000000"  # défaut local
    assert make(NODE_ENV="development", DEV_EMAIL_CODE="123456").fixed_email_code == "123456"
    assert make(NODE_ENV="development", DEV_EMAIL_CODE="").fixed_email_code is None  # désactivable
    assert make(NODE_ENV="test").fixed_email_code is None and make(NODE_ENV="test", DEV_EMAIL_CODE="000000").fixed_email_code is None
    with pytest.raises(ValueError):
        make(NODE_ENV="development", DEV_EMAIL_CODE="12ab56")
    with pytest.raises(ValueError):
        make(NODE_ENV="production", DEV_EMAIL_CODE="000000", PAYMENT_WEBHOOK_SECRET="x" * 24, IP_HASH_SALT="y" * 24)


async def test_state_exposes_the_dev_code_only_when_it_is_active(app, db, monkeypatch):
    from types import SimpleNamespace

    c, _, _ = await register(app)
    assert (await c.get("/api/auth/verification")).json()["devCode"] is None  # test : jamais de code fixe
    real = authsvc.get_settings()
    monkeypatch.setattr(authsvc, "get_settings", lambda: SimpleNamespace(fixed_email_code="000000", ip_hash_salt=real.ip_hash_salt, app_url=real.app_url))
    assert (await c.get("/api/auth/verification")).json()["devCode"] == "000000"


async def test_email_html_charte_et_echappement(app, db):
    from app.core import mail
    mail.outbox.clear()
    await mail.send_verification("a@duo.test", "<b>Zoé</b>", "tok", "123456", 15)
    m = mail.outbox[-1]
    assert "123456" in m["text"] and m["html"] and "123456" in m["html"]
    assert "#C2185B" in m["html"] and "crushduo-logo-email.png" in m["html"] and "verify-email?token=tok" in m["html"]
    assert "<b>Zoé</b>" not in m["html"] and "&lt;b&gt;" in m["html"]  # le nom est échappé : aucune injection de HTML

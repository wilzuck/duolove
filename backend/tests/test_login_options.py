"""« Restez connecté » et connexion par lien magique."""
import datetime
import re

from sqlalchemy import select, update

from app.core import mail
from app.core.ids import utcnow
from app.db.session import session_maker
from app.models.models import Session, User, VerificationToken
from tests.helpers import PASSWORD, new_agent, seed_member


def last_link(email: str) -> tuple[str, str]:
    msg = [m for m in mail.outbox if m["to"] == email and "lien de connexion" in m["subject"]][-1]
    m = re.search(r"magic-link\?token=([\w-]+)&remember=(\d)", msg["text"])
    return m.group(1), m.group(2)


async def session_of(cookie_token: str) -> Session:
    from app.core.security import sha256

    async with session_maker()() as s:
        return (await s.execute(select(Session).where(Session.tokenHash == sha256(cookie_token)))).scalar_one()


async def test_remember_me_controls_session_length_and_cookie(app, db):
    m = await seed_member(db, gender="WOMAN", seeking="MEN", city="Lomé")
    on, off = new_agent(app), new_agent(app)
    r1 = await on.post("/api/auth/login", json={"email": m["email"], "password": PASSWORD, "remember": True})
    r2 = await off.post("/api/auth/login", json={"email": m["email"], "password": PASSWORD, "remember": False})
    c1, c2 = r1.headers["set-cookie"].lower(), r2.headers["set-cookie"].lower()
    assert "expires=" in c1 and "expires=" not in c2 and "max-age" not in c2  # cookie de session sans « Restez connecté »
    s1, s2 = await session_of(on.cookies["duomatch_sid"]), await session_of(off.cookies["duomatch_sid"])
    assert s1.expiresAt - utcnow() > datetime.timedelta(days=29)
    assert s2.expiresAt - utcnow() < datetime.timedelta(hours=25)
    assert (await off.get("/api/users/me")).status_code == 200
    # Par défaut (champ absent) : session longue, comme avant.
    d = new_agent(app)
    await d.post("/api/auth/login", json={"email": m["email"], "password": PASSWORD})
    assert (await session_of(d.cookies["duomatch_sid"])).expiresAt - utcnow() > datetime.timedelta(days=29)


async def test_magic_link_logs_in_once_and_verifies_email(app, db):
    m = await seed_member(db, gender="MAN", seeking="WOMEN", city="Cotonou")
    async with session_maker()() as s:  # compte dont l'e-mail n'est pas encore vérifié
        await s.execute(update(User).where(User.id == m["id"]).values(emailVerifiedAt=None))
        await s.commit()
    c = new_agent(app)
    assert (await c.post("/api/auth/magic-link", json={"email": m["email"], "remember": False})).status_code == 202
    token, remember = last_link(m["email"])
    assert remember == "0"
    r = await c.post("/api/auth/magic-link/verify", json={"token": token, "remember": False})
    assert r.status_code == 200 and r.json()["emailVerified"] is True
    assert "expires=" not in r.headers["set-cookie"].lower()
    me = (await c.get("/api/users/me")).json()
    assert me["id"] == m["id"] and me["emailVerified"] is True
    again = await new_agent(app).post("/api/auth/magic-link/verify", json={"token": token})
    assert again.status_code == 400 and again.json()["error"]["code"] == "INVALID_TOKEN"  # usage unique


async def test_magic_link_does_not_reveal_accounts_and_limits_resend(app, db):
    c = new_agent(app)
    before = len(mail.outbox)
    r = await c.post("/api/auth/magic-link", json={"email": "inconnu-xyz@test.duomatch"})
    assert r.status_code == 202 and r.json() == {"ok": True} and len(mail.outbox) == before  # même réponse, aucun e-mail

    m = await seed_member(db, gender="WOMAN", seeking="MEN", city="Lomé")
    await c.post("/api/auth/magic-link", json={"email": m["email"]})
    n = len(mail.outbox)
    await c.post("/api/auth/magic-link", json={"email": m["email"]})
    assert len(mail.outbox) == n  # pas de second e-mail dans la minute


async def test_magic_link_rejects_expired_foreign_and_banned(app, db):
    m = await seed_member(db, gender="WOMAN", seeking="MEN", city="Lomé")
    c = new_agent(app)
    await c.post("/api/auth/magic-link", json={"email": m["email"]})
    token, _ = last_link(m["email"])
    async with session_maker()() as s:
        await s.execute(update(VerificationToken).where(VerificationToken.userId == m["id"], VerificationToken.type == "MAGIC_LINK")
                        .values(expiresAt=utcnow() - datetime.timedelta(minutes=1)))
        await s.commit()
    assert (await c.post("/api/auth/magic-link/verify", json={"token": token})).status_code == 400
    # Un jeton d'un autre type (vérification d'e-mail) ne connecte pas.
    await c.post("/api/auth/login", json={"email": m["email"], "password": PASSWORD})
    await c.post("/api/auth/resend-verification")
    # Compte banni : aucun e-mail envoyé.
    b = await seed_member(db, gender="MAN", seeking="WOMEN", city="Lomé")
    async with session_maker()() as s:
        await s.execute(update(User).where(User.id == b["id"]).values(status="BANNED"))
        await s.commit()
    n = len(mail.outbox)
    await new_agent(app).post("/api/auth/magic-link", json={"email": b["email"]})
    assert len(mail.outbox) == n

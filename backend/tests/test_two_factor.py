"""Double authentification : activation confirmée, connexion en deux étapes, codes de secours, verrouillage, lien magique, désactivation, alerte de pays, réinitialisation admin."""
import re

import pytest
from sqlalchemy import select, update

from app.core import mail, totp
from app.core.config import get_settings
from app.core.storage_config import decrypt
from app.db.session import session_maker
from app.models.models import Notification, User
from tests.helpers import PASSWORD, new_agent, seed_member
from tests.support_c import admin


@pytest.fixture(autouse=True)
def _key(monkeypatch):
    monkeypatch.setattr(get_settings(), "settings_encryption_key", "cle-de-test-2fa")


def code_now(secret: str, shift: int = 0) -> str:
    return totp.code_at(secret, totp.current_step() + shift)


async def enrolled(app, db, *, city="Cotonou"):
    """Membre avec double authentification active : (membre, agent connecté, secret en clair, codes de secours)."""
    m = await seed_member(db, gender="WOMAN", seeking="MEN", city=city)
    a = new_agent(app)
    assert (await a.post("/api/auth/login", json={"email": m["email"], "password": PASSWORD})).status_code == 200
    setup = (await a.post("/api/auth/2fa/setup")).json()
    secret = setup["secret"].replace(" ", "")
    assert setup["uri"].startswith("otpauth://totp/") and secret in setup["uri"]
    r = await a.post("/api/auth/2fa/enable", json={"code": code_now(secret)})
    assert r.status_code == 200, r.text
    return m, a, secret, r.json()["recoveryCodes"]


async def test_activation_demande_un_premier_code_valide_et_chiffre_le_secret(app, db):
    m = await seed_member(db, gender="WOMAN", seeking="MEN", city="Lomé")
    a = new_agent(app)
    await a.post("/api/auth/login", json={"email": m["email"], "password": PASSWORD})
    assert (await a.get("/api/auth/2fa")).json() == {"enabled": False, "pending": False, "recoveryLeft": 0, "hasPassword": True}
    secret = (await a.post("/api/auth/2fa/setup")).json()["secret"].replace(" ", "")
    assert (await a.get("/api/auth/2fa")).json()["pending"] is True and (await a.get("/api/auth/2fa")).json()["enabled"] is False
    bad = await a.post("/api/auth/2fa/enable", json={"code": "000000" if code_now(secret) != "000000" else "111111"})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "INVALID_2FA_CODE"
    ok = await a.post("/api/auth/2fa/enable", json={"code": code_now(secret)})
    assert ok.status_code == 200 and len(ok.json()["recoveryCodes"]) == 10
    st = (await a.get("/api/auth/2fa")).json()
    assert st["enabled"] is True and st["recoveryLeft"] == 10
    async with session_maker()() as s:
        u = await s.get(User, m["id"])
        assert u.totpSecretEnc and secret not in u.totpSecretEnc and decrypt(u.totpSecretEnc) == secret  # chiffré au repos
        assert all(len(h) == 64 for h in u.totpRecovery) and not any(c in str(u.totpRecovery) for c in ok.json()["recoveryCodes"])  # empreintes seulement
    assert (await a.post("/api/auth/2fa/setup")).status_code == 409  # déjà activée


async def test_connexion_en_deux_etapes_un_code_ne_sert_qu_une_fois(app, db):
    m, _, secret, _ = await enrolled(app, db)
    c = new_agent(app)
    r = await c.post("/api/auth/login", json={"email": m["email"], "password": PASSWORD})
    assert r.status_code == 200 and r.json()["twoFactor"] is True and "set-cookie" not in r.headers  # pas de session avant le code
    assert (await c.get("/api/users/me")).status_code == 401
    challenge = r.json()["challenge"]
    wrong = await c.post("/api/auth/2fa/login", json={"challenge": challenge, "code": "123456" if code_now(secret) != "123456" else "654321"})
    assert wrong.status_code == 401 and wrong.json()["error"]["code"] == "INVALID_2FA_CODE"
    good = await c.post("/api/auth/2fa/login", json={"challenge": challenge, "code": code_now(secret, 1)})
    assert good.status_code == 200 and good.json()["id"] == m["id"]
    assert (await c.get("/api/users/me")).status_code == 200
    # Le défi est à usage unique, et le même code ne rouvre pas une session (le pas est déjà consommé).
    again = await new_agent(app).post("/api/auth/2fa/login", json={"challenge": challenge, "code": code_now(secret, 1)})
    assert again.status_code == 400 and again.json()["error"]["code"] == "INVALID_TOKEN"
    c2 = new_agent(app)
    ch2 = (await c2.post("/api/auth/login", json={"email": m["email"], "password": PASSWORD})).json()["challenge"]
    replay = await c2.post("/api/auth/2fa/login", json={"challenge": ch2, "code": code_now(secret, 1)})
    assert replay.status_code == 401  # même pas déjà utilisé : refusé


async def test_code_de_secours_ne_sert_qu_une_fois_et_mauvais_mot_de_passe_ne_donne_pas_de_defi(app, db):
    m, a, secret, recovery = await enrolled(app, db)
    c = new_agent(app)
    assert (await c.post("/api/auth/login", json={"email": m["email"], "password": "Mauvais-mot-de-passe-1"})).status_code == 401
    ch = (await c.post("/api/auth/login", json={"email": m["email"], "password": PASSWORD})).json()["challenge"]
    r = await c.post("/api/auth/2fa/login", json={"challenge": ch, "code": recovery[0].lower()})
    assert r.status_code == 200
    assert (await a.get("/api/auth/2fa")).json()["recoveryLeft"] == 9
    c2 = new_agent(app)
    ch2 = (await c2.post("/api/auth/login", json={"email": m["email"], "password": PASSWORD})).json()["challenge"]
    assert (await c2.post("/api/auth/2fa/login", json={"challenge": ch2, "code": recovery[0]})).status_code == 401  # déjà consommé


async def test_trop_de_mauvais_codes_verrouillent_le_compte(app, db):
    m, _, secret, _ = await enrolled(app, db)
    c = new_agent(app)
    ch = (await c.post("/api/auth/login", json={"email": m["email"], "password": PASSWORD})).json()["challenge"]
    bad = "999999" if code_now(secret) != "999999" else "888888"
    codes = []
    for _ in range(6):
        codes.append((await c.post("/api/auth/2fa/login", json={"challenge": ch, "code": bad})).status_code)
    assert codes[:4] == [401, 401, 401, 401] and codes[-1] in (400, 429)  # défi brûlé ou compte verrouillé : jamais d'essai illimité
    locked = await new_agent(app).post("/api/auth/login", json={"email": m["email"], "password": PASSWORD})
    assert locked.status_code == 429 and locked.json()["error"]["code"] == "ACCOUNT_LOCKED"


async def test_lien_magique_demande_aussi_le_code(app, db):
    m, _, secret, _ = await enrolled(app, db)
    c = new_agent(app)
    assert (await c.post("/api/auth/magic-link", json={"email": m["email"]})).status_code == 202
    msg = [x for x in mail.outbox if x["to"] == m["email"] and "lien de connexion" in x["subject"]][-1]
    token = re.search(r"magic-link\?token=([\w-]+)", msg["text"]).group(1)
    r = await c.post("/api/auth/magic-link/verify", json={"token": token})
    assert r.status_code == 200 and r.json()["twoFactor"] is True and (await c.get("/api/users/me")).status_code == 401
    ok = await c.post("/api/auth/2fa/login", json={"challenge": r.json()["challenge"], "code": code_now(secret, 1)})  # pas +1 : le pas courant a servi à l'activation
    assert ok.status_code == 200 and (await c.get("/api/users/me")).status_code == 200


async def test_desactivation_exige_mot_de_passe_et_code_et_nouveaux_codes_de_secours(app, db):
    m, a, secret, old = await enrolled(app, db)
    step = totp.current_step()
    assert (await a.post("/api/auth/2fa/disable", json={"code": code_now(secret, 1), "password": "Mauvais-mot-de-passe-1"})).status_code == 401
    assert (await a.post("/api/auth/2fa/disable", json={"code": "000000", "password": PASSWORD})).status_code == 400
    new = await a.post("/api/auth/2fa/recovery", json={"code": code_now(secret, 1)})  # régénération : exige un code valide
    assert new.status_code == 200 and set(new.json()["recoveryCodes"]).isdisjoint(old)
    c = new_agent(app)
    ch = (await c.post("/api/auth/login", json={"email": m["email"], "password": PASSWORD})).json()["challenge"]
    assert (await c.post("/api/auth/2fa/login", json={"challenge": ch, "code": old[0]})).status_code == 401  # anciens codes inutilisables
    async with session_maker()() as s:
        await s.execute(update(User).where(User.id == m["id"]).values(totpLastStep=step - 5))  # autorise un nouveau code pour la suite du test
        await s.commit()
    off = await a.post("/api/auth/2fa/disable", json={"code": new.json()["recoveryCodes"][0], "password": PASSWORD})
    assert off.status_code == 200
    assert (await a.get("/api/auth/2fa")).json()["enabled"] is False
    plain = await new_agent(app).post("/api/auth/login", json={"email": m["email"], "password": PASSWORD})
    assert plain.status_code == 200 and "twoFactor" not in plain.json()  # retour à la connexion simple


async def test_alerte_de_connexion_depuis_un_autre_pays(app, db):
    m = await seed_member(db, gender="WOMAN", seeking="MEN", city="Cotonou")
    h = lambda c: {"CF-IPCountry": c}  # noqa: E731
    async def notes():
        async with session_maker()() as s:
            return [n.data for n in (await s.execute(select(Notification).where(Notification.userId == m["id"], Notification.type == "SECURITY_ALERT"))).scalars()]
    await new_agent(app).post("/api/auth/login", json={"email": m["email"], "password": PASSWORD}, headers=h("BJ"))  # première connexion connue : pas d'alerte
    await new_agent(app).post("/api/auth/login", json={"email": m["email"], "password": PASSWORD}, headers=h("BJ"))
    assert not [d for d in await notes() if d.get("event") == "new_country"]
    sent_before = len([x for x in mail.outbox if x["to"] == m["email"] and "Nouvelle connexion" in x["subject"]])
    await new_agent(app).post("/api/auth/login", json={"email": m["email"], "password": PASSWORD}, headers=h("FR"))
    alerts = [d for d in await notes() if d.get("event") == "new_country"]
    assert len(alerts) == 1 and alerts[0]["country"] == "FR"
    assert len([x for x in mail.outbox if x["to"] == m["email"] and "Nouvelle connexion" in x["subject"]]) == sent_before + 1
    await new_agent(app).post("/api/auth/login", json={"email": m["email"], "password": PASSWORD}, headers=h("FR"))  # même pays : rien de plus
    assert len([d for d in await notes() if d.get("event") == "new_country"]) == 1


async def test_reinitialisation_par_l_admin_deconnecte_et_est_tracee(app, db):
    m, a, secret, _ = await enrolled(app, db)
    ad = await admin(app, db)
    assert (await a.post("/api/auth/2fa/recovery", json={"code": code_now(secret, 1)})).status_code == 200
    assert (await a.post(f"/api/admin/users/{m['id']}/two-factor/reset", json={"reason": "x"})).status_code in (400, 403)  # pas pour un membre, raison trop courte
    r = await ad.agent.post(f"/api/admin/users/{m['id']}/two-factor/reset", json={"reason": "Identité vérifiée par appel vidéo"})
    assert r.status_code == 200 and r.json()["wasEnabled"] is True
    assert (await a.get("/api/users/me")).status_code == 401  # tous les appareils déconnectés
    plain = await new_agent(app).post("/api/auth/login", json={"email": m["email"], "password": PASSWORD})
    assert plain.status_code == 200 and "twoFactor" not in plain.json()
    async with session_maker()() as s:
        from app.models.models import AuditLog
        assert (await s.execute(select(AuditLog).where(AuditLog.action == "user.two_factor.reset", AuditLog.targetId == m["id"]))).scalars().first()

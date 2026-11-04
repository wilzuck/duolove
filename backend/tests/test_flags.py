"""Catalogue des feature flags et application côté serveur (port de flags.spec.ts).
Les flags boosts / live_match / super_likes / chat_images / referral_program sont appliqués par les modules correspondants
et testés avec eux ; ici : catalogue, audit, registration_open, payments_enabled, promo_codes."""
import pytest
from sqlalchemy import delete, select

from app.core import flags as flagsvc
from app.core.constants import FEATURE_FLAGS
from app.db.session import session_maker
from app.models.models import AuditLog, FeatureFlag
from tests.helpers import PASSWORD, uid
from tests.support_c import admin, balances, member


async def _clear():
    async with session_maker()() as s:
        await s.execute(delete(FeatureFlag))
        await s.commit()
    flagsvc.invalidate()


@pytest.fixture(autouse=True)
async def clean_flags(app):
    await _clear()  # état de départ propre : lignes laissées par d'autres fichiers effacées
    yield
    await _clear()  # ne laisse aucun interrupteur coupé aux autres fichiers de test


def set_flag(a, key, enabled):
    return a.agent.put(f"/api/admin/feature-flags/{key}", json={"enabled": enabled})


async def register(http):
    email = f"fl-{uid()}-{uid()}@test.duomatch"
    r = await http.post("/api/auth/register", json={"displayName": "Nouveau", "email": email, "password": PASSWORD, "birthDate": "1995-05-05",
                                                      "gender": "MAN", "country": "TG", "city": f"R-{uid()}", "acceptTerms": True})
    return r


code_of = lambda r: (r.json().get("error") or {}).get("code")  # noqa: E731


async def test_catalogue_liste_etat_acces_admin_et_cles_inconnues(app, http, db):
    a = await admin(app, db)
    lst = (await a.agent.get("/api/admin/feature-flags")).json()
    assert [f["key"] for f in lst] == [f.key for f in FEATURE_FLAGS]
    assert all(f["enabled"] and not f["overridden"] for f in lst)  # tout est actif par défaut, aucune ligne en base
    pub = (await http.get("/api/feature-flags")).json()
    assert sorted(pub) == sorted(f.key for f in FEATURE_FLAGS)
    u = await member(app, db)
    assert (await u.agent.get("/api/admin/feature-flags")).status_code == 403
    assert (await set_flag(u, "live_match", False)).status_code == 403
    assert code_of(await a.agent.put("/api/admin/feature-flags/inconnu", json={"enabled": False})) == "UNKNOWN_FLAG"
    assert (await a.agent.put("/api/admin/feature-flags/live_match", json={"enabled": "non"})).status_code == 400


async def test_chaque_changement_est_audite_et_visible_tout_de_suite(app, http, db):
    a = await admin(app, db)
    assert (await set_flag(a, "boosts", False)).status_code == 200
    row = next(f for f in (await a.agent.get("/api/admin/feature-flags")).json() if f["key"] == "boosts")
    assert row["enabled"] is False and row["overridden"] is True
    assert (await http.get("/api/feature-flags")).json()["boosts"] is False
    async with session_maker()() as s:
        log = (await s.execute(select(AuditLog).where(AuditLog.action == "flag.set", AuditLog.targetId == "boosts", AuditLog.actorId == a.id))).scalars().first()
        assert log.metadata_["before"] is True and log.metadata_["enabled"] is False
    await set_flag(a, "boosts", True)


async def test_registration_open_plus_d_inscription_mais_les_membres_se_connectent(app, http, db):
    a = await admin(app, db)
    await set_flag(a, "registration_open", False)
    r = await register(http)
    assert r.status_code == 503 and code_of(r) == "FEATURE_DISABLED"
    u = await member(app, db)
    assert (await u.agent.get("/api/users/me")).status_code == 200
    await set_flag(a, "registration_open", True)
    assert (await register(http)).status_code == 201


async def test_payments_enabled_un_paiement_deja_lance_peut_se_terminer(app, db):
    a, u = await admin(app, db), await member(app, db)
    pending = await u.agent.post("/api/checkout", json={"type": "product", "code": "TOKENS_5"})
    assert pending.status_code == 201
    await set_flag(a, "payments_enabled", False)
    r = await u.agent.post("/api/checkout", json={"type": "product", "code": "TOKENS_5"})
    assert (r.status_code, code_of(r)) == (503, "FEATURE_DISABLED")
    assert (await u.agent.post("/api/checkout", json={"type": "subscription", "plan": "PREMIUM", "months": 1})).status_code == 503
    assert (await u.agent.post(f"/api/payments/mock/{pending.json()['providerRef']}/complete", json={"outcome": "success"})).status_code == 200
    assert (await balances(u.id))["MATCH_TOKEN"] == 5
    await set_flag(a, "payments_enabled", True)
    assert (await u.agent.post("/api/checkout", json={"type": "product", "code": "TOKENS_5"})).status_code == 201


async def test_promo_codes_refuses_mais_paiements_sans_code_continuent(app, db):
    a = await admin(app, db)
    p = (await a.agent.post("/api/admin/promos", json={"code": f"FLG{uid()}".upper(), "kind": "PERCENT", "percent": 10})).json()
    u = await member(app, db)
    await set_flag(a, "promo_codes", False)
    assert (await u.agent.post("/api/promo/lookup", json={"code": p["code"]})).status_code == 503
    assert (await u.agent.post("/api/promo/redeem", json={"code": p["code"]})).status_code == 503
    assert (await u.agent.post("/api/checkout", json={"type": "product", "code": "TOKENS_5", "promoCode": p["code"]})).status_code == 503
    assert (await u.agent.post("/api/checkout", json={"type": "product", "code": "TOKENS_5"})).status_code == 201
    await set_flag(a, "promo_codes", True)
    assert (await u.agent.post("/api/promo/lookup", json={"code": p["code"]})).status_code == 200

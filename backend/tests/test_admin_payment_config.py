"""Configuration du paiement depuis l'administration : droits, chiffrement, mot de passe, test sans argent, priorité sur l'environnement."""
import pytest
from sqlalchemy import delete, select

from app.core import kkiapay, payment_config
from app.core.config import get_settings
from app.db.session import session_maker
from app.models.models import SystemSetting
from tests.support_c import admin, member

PK, SK, WH = "pk_test_abcdef123456", "private_abcdef123456", "hash-secret-abcdef"


@pytest.fixture(autouse=True)
async def clean(app, monkeypatch):
    monkeypatch.setattr(get_settings(), "settings_encryption_key", "cle-de-test-paiement")

    async def wipe():
        async with session_maker()() as s:
            await s.execute(delete(SystemSetting).where(SystemSetting.key == payment_config.KEY))
            await s.commit()
        payment_config.invalidate()

    await wipe()
    yield
    await wipe()


def body(**kw):
    return {"provider": "kkiapay", "publicKey": PK, "privateKey": SK, "webhookSecret": WH, "sandbox": True, **kw}


async def test_parcours_complet_super_admin(app, db, monkeypatch):
    from tests.helpers import PASSWORD
    from tests.support_c import set_role

    state = {"status": 404, "calls": []}

    async def post_json(url, key, b, t):
        state["calls"].append((url, key))
        return state["status"], {}

    monkeypatch.setattr(kkiapay, "post_json", post_json)
    u, ad = await member(app, db), await admin(app, db)
    assert (await u.agent.get("/api/admin/payment-config")).status_code == 403
    assert (await ad.agent.get("/api/admin/payment-config")).status_code == 403  # admin simple : refusé
    await set_role(ad.id, "SUPER_ADMIN")
    v = (await ad.agent.get("/api/admin/payment-config")).json()
    assert v["provider"] in ("mock", "kkiapay") and "privateKey" not in v
    state["status"] = 401  # clé refusée par KKiaPay
    assert (await ad.agent.post("/api/admin/payment-config/test", json=body())).status_code == 400
    state["status"] = 404  # clé acceptée (transaction inconnue)
    ok = await ad.agent.post("/api/admin/payment-config/test", json=body())
    assert ok.status_code == 200 and state["calls"][-1] == ("https://api-sandbox.kkiapay.me/api/v1/transactions/status", SK)
    assert (await ad.agent.put("/api/admin/payment-config", json=body(password="mauvais"))).status_code == 401  # mot de passe redemandé
    saved = await ad.agent.put("/api/admin/payment-config", json=body(password=PASSWORD))
    assert saved.status_code == 200
    j = saved.json()
    assert j["provider"] == "kkiapay" and j["source"] == "db" and j["hasPrivateKey"] and j["sandbox"] is True and j["live"] is False
    assert SK not in saved.text and WH not in saved.text
    live = (await ad.agent.put("/api/admin/payment-config", json={"provider": "kkiapay", "sandbox": False, "password": PASSWORD})).json()
    assert live["live"] is True and live["hasPrivateKey"]  # secrets conservés quand ils sont laissés vides
    cfg = await payment_config.effective()
    assert cfg.private_key == SK and cfg.sandbox is False


def test_build_conserve_les_secrets_vides_et_refuse_les_valeurs_invalides():
    old = payment_config.Effective(provider="kkiapay", public_key=PK, private_key=SK, webhook_secret=WH, sandbox=True)
    kept = payment_config.build({"provider": "kkiapay", "sandbox": False}, old)
    assert kept.private_key == SK and kept.webhook_secret == WH and kept.sandbox is False
    with pytest.raises(Exception):
        payment_config.build({"provider": "kkiapay", "publicKey": "x"}, payment_config.Effective())
    with pytest.raises(Exception):
        payment_config.build({"provider": "paypal"}, old)
    assert payment_config.build({"provider": "mock"}, old).provider == "mock"


async def test_les_cles_sont_chiffrees_en_base_et_relues(app, db, monkeypatch):
    cand = payment_config.build(body(), payment_config.Effective())
    row = payment_config.to_row(cand)
    assert SK not in str(row) and WH not in str(row)
    async with session_maker()() as s:
        s.add(SystemSetting(key=payment_config.KEY, value=row))
        await s.commit()
    payment_config.invalidate()
    eff = await payment_config.effective()
    assert eff.source == "db" and eff.provider == "kkiapay" and eff.private_key == SK and eff.webhook_secret == WH and eff.public_key == PK
    view = payment_config.public_view(eff, "https://api.exemple/webhook")
    assert SK not in str(view) and WH not in str(view) and view["hasPrivateKey"] and view["hasWebhookSecret"]
    async with session_maker()() as s:
        assert (await s.execute(select(SystemSetting.value).where(SystemSetting.key == payment_config.KEY))).scalar_one()["provider"] == "kkiapay"

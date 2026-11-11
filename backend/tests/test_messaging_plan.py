"""Idées de messagerie, appels et rendez-vous : réservés aux formules qui les incluent (Premium, VIP) ; la formule gratuite est refusée côté serveur."""
import pytest

from tests.helpers import make_premium, set_plan_feature
from tests.support_c import matched
from tests.test_dates import when as date_payload


@pytest.fixture(autouse=True)
async def _appels_actifs(app):
    """Les appels sont coupés par défaut pour toutes les formules : ces tests les activent pour Premium, puis rétablissent."""
    old = await set_plan_feature("PREMIUM", "calls_enabled", True)
    yield
    await set_plan_feature("PREMIUM", "calls_enabled", bool(old))


def code(r):
    return (r.json().get("error") or {}).get("code")


async def test_formule_gratuite_refusee_puis_premium_accepte(app, db):
    w, m, conv = await matched(app, db)  # deux comptes gratuits
    assert code(await w.agent.get(f"/api/conversations/{conv}/icebreakers")) == "PLAN_REQUIRED"
    assert code(await w.agent.post(f"/api/conversations/{conv}/calls", json={"kind": "AUDIO"})) == "PLAN_REQUIRED"
    assert code(await w.agent.post(f"/api/conversations/{conv}/dates", json=date_payload())) == "PLAN_REQUIRED"
    await make_premium(w.id)
    assert (await w.agent.get(f"/api/conversations/{conv}/icebreakers")).status_code == 200
    # Lancer est réservé ; répondre reste possible : le membre gratuit peut recevoir un appel.
    r = await w.agent.post(f"/api/conversations/{conv}/calls", json={"kind": "AUDIO"})
    assert r.status_code == 201, r.text
    limits = (await m.agent.get("/api/users/me")).json()["entitlement"]["limits"]
    assert limits["calls"] is False and limits["dates"] is False and limits["chatSuggestions"] is False

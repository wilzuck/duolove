"""Notifications push : abonnement validé (hôtes connus seulement), texte générique, respect de la pause et de la présence, nettoyage des abonnements expirés."""
import base64
import datetime
import json

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select, update

from app.core import notifications, push, realtime
from app.core.config import get_settings
from app.db.session import session_maker
from app.models.models import Profile, PushSubscription
from tests.helpers import seed_member
from tests.support_c import member

FCM = "https://fcm.googleapis.com/fcm/send/abc123"
KEYS = {"p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", "auth": "tBHItJI5svbpez7KI4CCXg"}


def b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


@pytest.fixture
def vapid(monkeypatch):
    key = ec.generate_private_key(ec.SECP256R1())  # paire de test jetable (aucun secret réel)
    monkeypatch.setattr(get_settings(), "vapid_private_key", b64(key.private_numbers().private_value.to_bytes(32, "big")))
    monkeypatch.setattr(get_settings(), "vapid_public_key", b64(key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)))


@pytest.fixture
def sent(monkeypatch):
    """Remplace l'envoi réseau : enregistre (endpoint, charge) et répond avec le code configuré."""
    box = {"calls": [], "status": 201}

    async def fake(sub, payload):
        box["calls"].append((sub["endpoint"], json.loads(payload)))
        return box["status"]

    monkeypatch.setattr(push, "_post", fake)
    return box


async def subscribe(m, endpoint=FCM, lang="fr"):
    return await m.agent.post("/api/push/subscribe", json={"endpoint": endpoint, "keys": KEYS}, headers={"Accept-Language": lang})


async def test_sans_cles_vapid_rien_n_est_propose_ni_envoye(app, db, monkeypatch):
    monkeypatch.setattr(get_settings(), "vapid_public_key", None)
    monkeypatch.setattr(get_settings(), "vapid_private_key", None)
    m = await member(app, db)
    assert (await m.agent.get("/api/push/config")).json() == {"enabled": False, "publicKey": None, "devices": 0}
    r = await subscribe(m)
    assert r.status_code == 409 and r.json()["error"]["code"] == "PUSH_NOT_CONFIGURED"


async def test_abonnement_n_accepte_que_les_services_push_connus(app, db, vapid):
    m = await member(app, db)
    cfg = (await m.agent.get("/api/push/config")).json()
    assert cfg["enabled"] is True and len(cfg["publicKey"]) > 60
    for bad in ("http://fcm.googleapis.com/x", "https://evil.example.com/hook", "https://fcm.googleapis.com.evil.com/x", "https://127.0.0.1/x", "https://user@fcm.googleapis.com/x"):
        r = await subscribe(m, bad)
        assert r.status_code == 400 and r.json()["error"]["code"] == "PUSH_ENDPOINT_INVALID", bad  # pas de SSRF
    for good in (FCM, "https://updates.push.services.mozilla.com/wpush/v2/xyz", "https://wns2-par02p.notify.windows.com/w/?token=1", "https://web.push.apple.com/Qabc"):
        assert (await subscribe(m, good)).status_code == 201, good
    assert (await m.agent.get("/api/push/config")).json()["devices"] == 4


async def test_texte_generique_langue_et_un_appareil_par_endpoint(app, db, vapid, sent):
    m = await member(app, db)
    assert (await subscribe(m, lang="en")).status_code == 201
    assert (await subscribe(m, lang="en")).status_code == 201  # même appareil : pas de doublon
    assert (await m.agent.get("/api/push/config")).json()["devices"] == 1
    async with session_maker()() as s:
        await notifications.create(s, m.id, "MESSAGE", {"conversationId": "conv1", "fromUserId": "u2"})
    (endpoint, payload), = sent["calls"]
    assert endpoint == FCM and payload["title"] == "New message" and payload["url"] == "/messages/conv1"
    assert "u2" not in json.dumps(payload)  # jamais le nom ni l'identifiant de l'expéditeur
    async with session_maker()() as s:
        await notifications.create(s, m.id, "ANNOUNCEMENT", {"subject": "Promo admin"})  # annonce ordinaire : pas de push
        await notifications.create(s, m.id, "PROFILE_VERIFIED", {})  # type sans push
        await notifications.create(s, m.id, "ANNOUNCEMENT", {"kind": "PROMO_ENDING", "code": "X"})
    assert [p["tag"] for _, p in sent["calls"]] == ["message-conv1", "promo-ending"]


async def test_pause_repos_presence_et_reglages_coupent_le_push_sauf_securite(app, db, vapid, sent, monkeypatch):
    m = await member(app, db)
    await subscribe(m)
    async with session_maker()() as s:
        await s.execute(update(Profile).where(Profile.userId == m.id).values(pausedAt=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), pauseEndsAt=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(days=2)))
        await s.commit()
    async with session_maker()() as s:
        await notifications.create(s, m.id, "MATCH", {})
        await notifications.create(s, m.id, "SECURITY_ALERT", {"event": "new_country"})
    assert [p["tag"] for _, p in sent["calls"]] == ["security_alert-"]  # en pause : seule l'alerte de sécurité passe
    async with session_maker()() as s:
        await s.execute(update(Profile).where(Profile.userId == m.id).values(pausedAt=None, pauseEndsAt=None))
        await s.commit()
    sent["calls"].clear()
    monkeypatch.setattr(realtime, "online_ids", lambda: {m.id})  # déjà connecté dans l'application
    async with session_maker()() as s:
        await notifications.create(s, m.id, "MATCH", {})
    assert sent["calls"] == []


async def test_abonnement_expire_supprime_et_desabonnement_et_test_cible(app, db, vapid, sent):
    m, other = await member(app, db), await member(app, db)
    await subscribe(m)
    await subscribe(m, "https://updates.push.services.mozilla.com/wpush/v2/second")
    sent["status"] = 410  # service push : abonnement expiré
    async with session_maker()() as s:
        await notifications.create(s, m.id, "MATCH", {})
    assert (await m.agent.get("/api/push/config")).json()["devices"] == 0  # nettoyé
    sent["status"] = 201
    await subscribe(m)
    await subscribe(other, FCM)  # même appareil, autre compte : l'abonnement change de propriétaire
    assert (await m.agent.get("/api/push/config")).json()["devices"] == 0 and (await other.agent.get("/api/push/config")).json()["devices"] == 1
    await subscribe(m)
    sent["calls"].clear()
    r = await m.agent.post("/api/push/test", json={"endpoint": FCM})
    assert r.json() == {"sent": 1} and sent["calls"][0][1]["tag"] == "push-test"
    assert (await m.agent.post("/api/push/unsubscribe", json={"endpoint": FCM})).status_code == 200
    assert (await m.agent.get("/api/push/config")).json()["devices"] == 0

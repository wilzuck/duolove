"""Retours d'Amazon SES via SNS : signature vérifiée pour de vrai (clé et certificat générés ici), blocage des adresses en rebond/plainte, liste d'administration."""
import base64
import datetime
import json

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID
from sqlalchemy import select

from app.api import ses_webhook
from app.core import mail
from app.core.config import get_settings
from app.models.models import EmailLog, EmailSuppression, NewsletterSubscriber
from tests.helpers import uid
from tests.support_c import admin, member

TOPIC = "arn:aws:sns:eu-north-1:123456789012:crushduo-ses-feedback"
CERT_URL = "https://sns.eu-north-1.amazonaws.com/SimpleNotificationService-test.pem"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "sns.amazonaws.com")])
CERT = (x509.CertificateBuilder().subject_name(_name).issuer_name(_name).public_key(KEY.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime(2020, 1, 1)).not_valid_after(datetime.datetime(2040, 1, 1)).sign(KEY, hashes.SHA256()))


@pytest.fixture(autouse=True)
def _sns(monkeypatch):
    monkeypatch.setattr(get_settings(), "ses_sns_topic_arn", TOPIC)

    async def fake_cert(url):  # pas de réseau : le « certificat Amazon » est celui généré plus haut
        return CERT
    monkeypatch.setattr(ses_webhook, "_certificate", fake_cert)


def sns(message: dict, kind: str = "Notification", **over) -> str:
    m = {"Type": kind, "MessageId": uid(), "TopicArn": TOPIC, "Message": json.dumps(message), "Timestamp": "2026-11-10T00:00:00.000Z", "SignatureVersion": "2", "SigningCertURL": CERT_URL, **over}
    to_sign = "".join(f"{k}\n{m[k]}\n" for k in ses_webhook._SIGNED[kind] if k in m).encode()
    m["Signature"] = base64.b64encode(KEY.sign(to_sign, padding.PKCS1v15(), hashes.SHA256())).decode()
    return json.dumps(m)


def bounce(email: str, kind: str = "Permanent") -> dict:
    return {"notificationType": "Bounce", "bounce": {"bounceType": kind, "bounceSubType": "General", "bouncedRecipients": [{"emailAddress": email, "diagnosticCode": "smtp; 550 user unknown"}]}}


async def post(http, body: str):
    return await http.post("/api/webhooks/ses", content=body, headers={"content-type": "text/plain; charset=UTF-8"})


async def test_desactive_sans_sujet_configure(http, monkeypatch):
    monkeypatch.setattr(get_settings(), "ses_sns_topic_arn", None)
    assert (await post(http, sns(bounce("x@duo.test")))).status_code == 404


async def test_rebond_definitif_bloque_tous_les_envois(http, db):
    email = f"Rebond-{uid()}@Duo.test"
    db.add(NewsletterSubscriber(email=email.lower(), token=uid() + uid(), status="ACTIVE"))
    await db.commit()
    r = await post(http, sns(bounce(email)))
    assert r.status_code == 200 and r.json()["blocked"] == 1
    row = (await db.execute(select(EmailSuppression).where(EmailSuppression.email == email.lower()))).scalar_one()
    assert row.reason == "BOUNCE" and "user unknown" in row.detail
    assert (await db.execute(select(NewsletterSubscriber.status).where(NewsletterSubscriber.email == email.lower()))).scalar_one() == "UNSUBSCRIBED"
    mail.outbox.clear()
    assert await mail.send(email, "Salut", "texte", kind="newsletter") is False
    assert await mail.send(email, "Code", "texte", kind="verification") is False  # un rebond bloque même les e-mails de sécurité : l'adresse n'existe pas
    assert mail.outbox == []
    log = (await db.execute(select(EmailLog).where(EmailLog.toEmail == email).order_by(EmailLog.createdAt))).scalars().all()
    assert [x.status for x in log] == ["SKIPPED", "SKIPPED"] and "rebond" in log[0].error


async def test_rebond_temporaire_ignore(http, db):
    email = f"plein-{uid()}@duo.test"
    assert (await post(http, sns(bounce(email, "Transient")))).json()["blocked"] == 0
    assert (await db.execute(select(EmailSuppression).where(EmailSuppression.email == email))).scalar_one_or_none() is None


async def test_plainte_bloque_le_facultatif_mais_pas_la_securite(http, db):
    email = f"spam-{uid()}@duo.test"
    note = {"eventType": "Complaint", "complaint": {"complainedRecipients": [{"emailAddress": email}], "complaintFeedbackType": "abuse"}}
    assert (await post(http, sns(note))).json()["blocked"] == 1
    mail.outbox.clear()
    assert await mail.send(email, "Nouveautés", "texte", kind="newsletter") is False
    assert await mail.send(email, "Un message", "texte", kind="notification") is False
    assert await mail.send(email, "Votre code", "texte", kind="verification") is True  # demandé par la personne elle-même
    assert [m["subject"] for m in mail.outbox] == ["Votre code"]


async def test_un_rebond_prime_sur_une_plainte(http, db):
    email = f"mix-{uid()}@duo.test"
    await post(http, sns({"notificationType": "Complaint", "complaint": {"complainedRecipients": [{"emailAddress": email}]}}))
    await post(http, sns(bounce(email)))
    await post(http, sns({"notificationType": "Complaint", "complaint": {"complainedRecipients": [{"emailAddress": email}]}}))
    assert (await db.execute(select(EmailSuppression.reason).where(EmailSuppression.email == email))).scalar_one() == "BOUNCE"


async def test_signature_et_origine_controlees(http, db):
    email = f"faux-{uid()}@duo.test"
    good = json.loads(sns(bounce(email)))
    bad = {**good, "Message": json.dumps(bounce(f"autre-{uid()}@duo.test"))}  # contenu modifié après signature
    assert (await post(http, json.dumps(bad))).status_code == 403
    assert (await post(http, sns(bounce(email), TopicArn="arn:aws:sns:eu-north-1:999999999999:autre"))).status_code == 403  # sujet d'un autre compte AWS
    assert (await post(http, sns(bounce(email), SigningCertURL="https://evil.example.com/cert.pem"))).status_code == 403
    assert (await post(http, sns(bounce(email), SigningCertURL="http://sns.eu-north-1.amazonaws.com/cert.pem"))).status_code == 403  # pas en https
    assert (await post(http, "pas du json")).status_code == 400
    assert (await db.execute(select(EmailSuppression).where(EmailSuppression.email == email))).scalar_one_or_none() is None


async def test_confirmation_d_abonnement(http, monkeypatch):
    visited = []

    class FakeClient:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): ...
        async def get(self, url): visited.append(url)
    monkeypatch.setattr(ses_webhook.httpx, "AsyncClient", FakeClient)
    url = "https://sns.eu-north-1.amazonaws.com/?Action=ConfirmSubscription&Token=abc"
    r = await post(http, sns({}, "SubscriptionConfirmation", SubscribeURL=url, Token="abc"))
    assert r.status_code == 200 and r.json()["confirmed"] is True and visited == [url]
    visited.clear()
    assert (await post(http, sns({}, "SubscriptionConfirmation", SubscribeURL="https://evil.example.com/x", Token="abc"))).status_code == 400 and visited == []


async def test_liste_admin_et_deblocage(app, db, http):
    ad, u = await admin(app, db), await member(app, db)
    email = f"liste-{uid()}@duo.test"
    await post(http, sns(bounce(email)))
    assert (await u.agent.get("/api/admin/emails/suppressions")).status_code == 403
    res = (await ad.agent.get("/api/admin/emails/suppressions", params={"q": email})).json()
    assert [i["email"] for i in res["items"]] == [email] and res["totals"]["BOUNCE"] >= 1
    assert (await u.agent.delete(f"/api/admin/emails/suppressions/{res['items'][0]['id']}")).status_code == 403
    assert (await ad.agent.delete(f"/api/admin/emails/suppressions/{res['items'][0]['id']}")).status_code == 200
    assert (await ad.agent.get("/api/admin/emails/suppressions", params={"q": email})).json()["items"] == []
    assert (await ad.agent.delete("/api/admin/emails/suppressions/inconnu")).status_code == 404

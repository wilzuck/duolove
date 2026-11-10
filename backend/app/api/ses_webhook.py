"""Retours d'Amazon SES (rebonds définitifs, plaintes) reçus par Amazon SNS.

Sécurité : le point d'entrée est public, donc on n'agit que si (1) le message vient du sujet SNS autorisé (SES_SNS_TOPIC_ARN : sinon n'importe quel compte AWS
pourrait nous envoyer des messages valablement signés) et (2) sa signature est valide, vérifiée avec le certificat publié par Amazon (adresse contrôlée).
Sans SES_SNS_TOPIC_ARN, tout est refusé.
"""
from __future__ import annotations

import base64
import json
import logging
import re
from urllib.parse import urlsplit

import httpx
from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import suppression
from app.core.config import get_settings
from app.core.errors import bad_request, forbidden, not_found
from app.core.ratelimit import limit
from app.db.session import get_db

log = logging.getLogger("ses_webhook")
router = APIRouter(tags=["webhooks"])

_SNS_HOST = re.compile(r"^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$")
_MAX_BODY = 256 * 1024
# Champs signés par SNS, dans l'ordre imposé par Amazon (un champ absent, comme « Subject », est simplement omis).
_SIGNED = {
    "Notification": ("Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"),
    "SubscriptionConfirmation": ("Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"),
    "UnsubscribeConfirmation": ("Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"),
}
_certs: dict[str, x509.Certificate] = {}


def _is_sns_url(url: object) -> bool:
    if not isinstance(url, str):
        return False
    u = urlsplit(url)
    return u.scheme == "https" and bool(_SNS_HOST.match(u.hostname or ""))


async def _certificate(url: str) -> x509.Certificate:
    if url not in _certs:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(url)
        r.raise_for_status()
        _certs[url] = x509.load_pem_x509_certificate(r.content)
    return _certs[url]


async def verify(m: dict) -> None:
    """Lève une erreur si la signature SNS n'est pas valide."""
    if not _is_sns_url(m.get("SigningCertURL")) or not str(m["SigningCertURL"]).endswith(".pem"):
        raise forbidden("BAD_SIGNING_CERT", "Certificat de signature non reconnu.")
    algo = {"1": hashes.SHA1(), "2": hashes.SHA256()}.get(str(m.get("SignatureVersion")))
    if algo is None or "Signature" not in m:
        raise forbidden("BAD_SIGNATURE", "Signature absente ou version inconnue.")
    to_sign = "".join(f"{k}\n{m[k]}\n" for k in _SIGNED[m["Type"]] if k in m).encode()
    try:
        cert = await _certificate(m["SigningCertURL"])
        cert.public_key().verify(base64.b64decode(m["Signature"]), to_sign, padding.PKCS1v15(), algo)  # type: ignore[union-attr]
    except (InvalidSignature, ValueError, TypeError, httpx.HTTPError):
        raise forbidden("BAD_SIGNATURE", "Signature invalide.")


async def _handle(db: AsyncSession, note: dict) -> int:
    """Traite une notification SES (identité : « notificationType » ; jeu de configuration : « eventType »). Retourne le nombre d'adresses bloquées."""
    kind = note.get("notificationType") or note.get("eventType")
    n = 0
    if kind == "Bounce":
        b = note.get("bounce") or {}
        if b.get("bounceType") == "Permanent":  # « Transient » (boîte pleine, panne) ou « Undetermined » : l'adresse peut redevenir valide
            for r in b.get("bouncedRecipients") or []:
                if r.get("emailAddress"):
                    await suppression.suppress(db, r["emailAddress"], "BOUNCE", " — ".join(x for x in (b.get("bounceSubType"), r.get("diagnosticCode")) if x))
                    n += 1
    elif kind == "Complaint":
        c = note.get("complaint") or {}
        for r in c.get("complainedRecipients") or []:
            if r.get("emailAddress"):
                await suppression.suppress(db, r["emailAddress"], "COMPLAINT", c.get("complaintFeedbackType"))
                n += 1
    return n


@router.post("/webhooks/ses", dependencies=[limit(120, 60)])
async def ses_feedback(request: Request, db: AsyncSession = Depends(get_db)):
    topic = get_settings().ses_sns_topic_arn
    if not topic:
        raise not_found("WEBHOOK_DISABLED", "Retours SES non configurés.")
    raw = await request.body()
    if len(raw) > _MAX_BODY:
        raise bad_request("TOO_LARGE", "Message trop volumineux.")
    try:
        m = json.loads(raw)
        assert isinstance(m, dict) and m.get("Type") in _SIGNED
    except Exception:
        raise bad_request("BAD_MESSAGE", "Message SNS illisible.")
    if m.get("TopicArn") != topic:
        raise forbidden("WRONG_TOPIC", "Sujet SNS non autorisé.")
    await verify(m)
    if m["Type"] == "SubscriptionConfirmation":  # première étape : confirmer l'abonnement en visitant l'adresse fournie par Amazon
        if not _is_sns_url(m.get("SubscribeURL")):
            raise bad_request("BAD_SUBSCRIBE_URL", "Adresse de confirmation non reconnue.")
        async with httpx.AsyncClient(timeout=10) as c:
            await c.get(m["SubscribeURL"])
        log.info("Abonnement SNS confirmé pour %s", topic)
        return {"ok": True, "confirmed": True}
    if m["Type"] == "Notification":
        try:
            note = json.loads(m.get("Message", ""))
        except ValueError:
            return {"ok": True, "blocked": 0}  # message de test ou texte libre : rien à faire
        return {"ok": True, "blocked": await _handle(db, note) if isinstance(note, dict) else 0}
    return {"ok": True}

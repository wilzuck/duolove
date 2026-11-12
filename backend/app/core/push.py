"""Notifications push (Web Push + VAPID) : l'appareil du membre reçoit une alerte même quand Crushduo est fermé.

Principes :
- **Consentement par appareil** : un abonnement n'existe que si le membre a accepté la demande du navigateur ET activé l'option dans ses réglages.
- **Aucun contenu privé** : le texte est générique (« Nouveau message », « C'est un duo ! »), jamais le message ni le nom de la personne (un écran verrouillé ne doit rien révéler).
- **Respect du rythme du membre** : rien pendant la pause ou la période de repos (sauf alertes de sécurité), rien s'il est déjà connecté dans l'application, rien si ses réglages de notification coupent ce type.
- **Sécurité** : le serveur n'appelle QUE les services push connus (Google, Mozilla, Microsoft, Apple) : l'adresse d'abonnement vient du navigateur et ne doit pas servir à faire appeler une adresse quelconque (SSRF).
- **Désactivé sans clés** : sans VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, rien n'est envoyé et l'interface affiche « bientôt »."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from urllib.parse import urlsplit

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.ids import utcnow
from app.models.models import PushSubscription

log = logging.getLogger("push")

# Services push des navigateurs. Tout autre hôte est refusé à l'abonnement.
ALLOWED_HOSTS = re.compile(r"^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)?notify\.windows\.com|([a-z0-9-]+\.)?push\.apple\.com)$")
MAX_PER_USER = 8  # appareils par membre (les plus anciens sont remplacés)

# (titre, texte, lien) par langue : génériques, sans contenu privé.
COPY = {
    "MATCH": {"fr": ("C’est un duo !", "Vous avez un nouveau duo. Dites-lui bonjour.", "/messages"), "en": ("It’s a duo!", "You have a new duo. Say hi.", "/messages")},
    "MESSAGE": {"fr": ("Nouveau message", "Vous avez reçu un nouveau message.", "/messages"), "en": ("New message", "You received a new message.", "/messages")},
    "LIKE": {"fr": ("Quelqu’un vous a liké", "Une personne s’intéresse à vous.", "/likes"), "en": ("Someone liked you", "Someone is interested in you.", "/likes")},
    "DATE_REMINDER": {"fr": ("Rappel de rendez-vous", "Vous avez un rendez-vous bientôt.", "/messages"), "en": ("Date reminder", "You have a date coming up.", "/messages")},
    "SUBSCRIPTION_EXPIRING": {"fr": ("Votre abonnement se termine bientôt", "Prolongez-le en un clic.", "/premium"), "en": ("Your plan ends soon", "Extend it in one click.", "/premium")},
    "SECURITY_ALERT": {"fr": ("Alerte de sécurité", "Une activité inhabituelle a été détectée sur votre compte.", "/settings?tab=security"), "en": ("Security alert", "Unusual activity was detected on your account.", "/settings?tab=security")},
}
LIVE_EVENT = {"reminder": {"fr": "commence dans une heure.", "en": "starts in one hour."}, "start": {"fr": "vient de commencer !", "en": "just started!"}}
PROMO_ENDING = {"fr": ("Votre offre de bienvenue se termine bientôt", "Appliquez-la en un clic.", "/premium"), "en": ("Your welcome offer ends soon", "Apply it in one click.", "/premium")}

_tasks: set[asyncio.Task] = set()  # références fortes : une tâche sans référence peut être ramassée avant la fin


def configured() -> bool:
    s = get_settings()
    return bool(s.vapid_public_key and s.vapid_private_key)


def public_key() -> str | None:
    return get_settings().vapid_public_key if configured() else None


def valid_endpoint(url: str) -> bool:
    try:
        u = urlsplit(url)
    except ValueError:
        return False
    return u.scheme == "https" and bool(u.hostname) and bool(ALLOWED_HOSTS.match(u.hostname.lower())) and not u.username and len(url) <= 1024


def payload_for(type_: str, data: dict, lang: str) -> dict | None:
    """Texte générique du type de notification, ou None s'il n'y a pas de push pour ce type."""
    lg = "en" if lang == "en" else "fr"
    if type_ == "LIVE_EVENT":
        title = str(data.get("title") or "Soirée Duo")[:80]
        return {"title": "Soirée Duo" if lg == "fr" else "Duo Night", "body": f"{title} {LIVE_EVENT.get(data.get('stage'), LIVE_EVENT['reminder'])[lg]}", "url": "/match", "tag": f"live-{data.get('eventId', '')}"}
    if type_ == "ANNOUNCEMENT":
        if data.get("kind") != "PROMO_ENDING":
            return None  # les annonces de l'administration passent par l'application et l'e-mail, pas par le push
        t, b, u = PROMO_ENDING[lg]
        return {"title": t, "body": b, "url": u, "tag": "promo-ending"}
    c = COPY.get(type_)
    if not c:
        return None
    t, b, u = c[lg]
    if type_ in ("MESSAGE", "DATE_REMINDER") and data.get("conversationId"):
        u = f"/messages/{data['conversationId']}"
    return {"title": t, "body": b, "url": u, "tag": f"{type_.lower()}-{data.get('conversationId') or ''}"}


async def subscribe(db: AsyncSession, user_id: str, endpoint: str, p256dh: str, auth: str, user_agent: str | None, lang: str) -> None:
    if not configured():
        raise AppError(409, "PUSH_NOT_CONFIGURED", "Les notifications push ne sont pas encore disponibles")
    if not valid_endpoint(endpoint):
        raise AppError(400, "PUSH_ENDPOINT_INVALID", "Service de notification non reconnu")
    stmt = pg_insert(PushSubscription).values(userId=user_id, endpoint=endpoint, p256dh=p256dh, auth=auth, userAgent=(user_agent or "")[:255] or None, lang="en" if lang == "en" else "fr")
    # Même appareil, autre compte (déconnexion puis connexion d'un autre membre) : l'abonnement change de propriétaire.
    await db.execute(stmt.on_conflict_do_update(index_elements=["endpoint"], set_={"userId": user_id, "p256dh": p256dh, "auth": auth, "lang": stmt.excluded.lang}))
    old = (await db.execute(select(PushSubscription.id).where(PushSubscription.userId == user_id).order_by(PushSubscription.createdAt.desc()).offset(MAX_PER_USER))).scalars().all()
    if old:
        await db.execute(delete(PushSubscription).where(PushSubscription.id.in_(old)))
    await db.commit()


async def unsubscribe(db: AsyncSession, user_id: str, endpoint: str) -> None:
    await db.execute(delete(PushSubscription).where(PushSubscription.userId == user_id, PushSubscription.endpoint == endpoint))
    await db.commit()


async def devices(db: AsyncSession, user_id: str) -> int:
    from sqlalchemy import func
    return (await db.execute(select(func.count()).select_from(PushSubscription).where(PushSubscription.userId == user_id))).scalar_one()


def _post_sync(sub: dict, payload: str) -> int:
    from pywebpush import WebPushException, webpush

    s = get_settings()
    try:
        r = webpush(subscription_info=sub, data=payload, vapid_private_key=s.vapid_private_key, vapid_claims={"sub": s.vapid_subject}, ttl=3600, timeout=10)
        return int(getattr(r, "status_code", 201))
    except WebPushException as e:
        resp = getattr(e, "response", None)
        return int(getattr(resp, "status_code", 0) or 0)


async def _post(sub: dict, payload: str) -> int:
    """Un envoi (point d'extension des tests : aucun appel réseau réel). Renvoie le code HTTP du service push, 0 si injoignable."""
    try:
        return await asyncio.to_thread(_post_sync, sub, payload)
    except Exception:  # noqa: BLE001 — un service push en panne ne doit jamais casser l'application
        log.exception("envoi push")
        return 0


async def send_to_user(db: AsyncSession, user_id: str, payload: dict, only_endpoint: str | None = None) -> int:
    """Envoie à tous les appareils du membre ; supprime les abonnements expirés (404 / 410). Renvoie le nombre d'appareils atteints."""
    if not configured():
        return 0
    q = select(PushSubscription).where(PushSubscription.userId == user_id)
    if only_endpoint:
        q = q.where(PushSubscription.endpoint == only_endpoint)
    subs = (await db.execute(q)).scalars().all()
    ok, dead = 0, []
    body = json.dumps(payload, ensure_ascii=False)
    for s in subs:
        status = await _post({"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}}, body)
        if 200 <= status < 300:
            ok += 1
        elif status in (404, 410):
            dead.append(s.id)
    if ok:
        await db.execute(update(PushSubscription).where(PushSubscription.userId == user_id).values(lastSentAt=utcnow()))
    if dead:
        await db.execute(delete(PushSubscription).where(PushSubscription.id.in_(dead)))
    await db.commit()
    return ok


async def _deliver(user_id: str, payload: dict) -> None:
    from app.db.session import session_maker

    try:
        async with session_maker()() as db:
            await send_to_user(db, user_id, payload)
    except Exception:  # noqa: BLE001
        log.exception("livraison push")


async def notify(db: AsyncSession, user_id: str, type_: str, data: dict) -> None:
    """Appelé à la création d'une notification : envoie le push si le membre a au moins un appareil abonné. N'attend pas le service push (tâche de fond), sauf en test."""
    if not configured():
        return
    lang = (await db.execute(select(PushSubscription.lang).where(PushSubscription.userId == user_id).limit(1))).scalar_one_or_none()
    if lang is None:
        return  # aucun appareil abonné
    payload = payload_for(type_, data, lang)
    if not payload:
        return
    if get_settings().node_env == "test":
        await _deliver(user_id, payload)
        return
    task = asyncio.create_task(_deliver(user_id, payload))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)

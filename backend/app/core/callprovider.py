"""Fournisseur d'appels audio/vidéo (service tiers). Le serveur ne fait que SIGNER un jeton d'accès à une salle ; le média passe par le fournisseur.
Aucun enregistrement n'est jamais demandé (jeton sans droit d'enregistrement, aucune sortie « egress »). Mode « mock » : simulation sans média, jamais en production."""
import base64
import hashlib
import hmac
import json
import time

from app.core.config import get_settings


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def sign_jwt(payload: dict, secret: str) -> str:
    """JWT HS256 minimal (format imposé par LiveKit pour ses jetons d'accès)."""
    head = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
    return f"{head}.{body}.{_b64(sig)}"


def livekit_token(*, api_key: str, api_secret: str, room: str, identity: str, name: str, ttl_seconds: int, kind: str, now: float | None = None) -> str:
    t = int(now if now is not None else time.time())
    sources = ["microphone"] if kind == "AUDIO" else ["microphone", "camera"]
    grant = {"room": room, "roomJoin": True, "canPublish": True, "canSubscribe": True, "canPublishData": False, "canPublishSources": sources}  # pas de recorder, pas de roomAdmin
    return sign_jwt({"iss": api_key, "sub": identity, "name": name, "nbf": t - 10, "exp": t + ttl_seconds, "jti": f"{identity}:{room}", "video": grant}, api_secret)


def issue(*, room: str, identity: str, name: str, ttl_seconds: int, kind: str) -> dict:
    s = get_settings()
    if s.call_provider == "livekit":
        return {"provider": "livekit", "url": s.livekit_url, "token": livekit_token(api_key=s.livekit_api_key, api_secret=s.livekit_api_secret, room=room, identity=identity,
                                                                                    name=name, ttl_seconds=ttl_seconds, kind=kind)}
    return {"provider": "mock", "url": "", "token": "simulated"}

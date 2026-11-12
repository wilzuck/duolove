"""Notifications push : clé publique, abonnement / désabonnement d'un appareil, envoi d'un test."""
from fastapi import APIRouter, Depends, Request
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import push
from app.core.auth import AuthUser, current_user
from app.core.ratelimit import limit
from app.db.session import get_db
from app.schemas.common import Body

router = APIRouter(prefix="/push", tags=["push"])


class Keys(Body):
    p256dh: str = Field(min_length=10, max_length=200)
    auth: str = Field(min_length=10, max_length=100)


class SubscribeIn(Body):
    endpoint: str = Field(min_length=10, max_length=1024)
    keys: Keys


class EndpointIn(Body):
    endpoint: str = Field(min_length=10, max_length=1024)


@router.get("/config")
async def config(u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Le serveur sait-il envoyer des push, et ce membre a-t-il au moins un appareil abonné ? `publicKey` sert à l'abonnement du navigateur."""
    return {"enabled": push.configured(), "publicKey": push.public_key(), "devices": await push.devices(db, u.id)}


@router.post("/subscribe", status_code=201, dependencies=[limit(20, 600)])
async def subscribe(body: SubscribeIn, req: Request, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    lang = (req.headers.get("accept-language") or "fr")[:2].lower()
    await push.subscribe(db, u.id, body.endpoint, body.keys.p256dh, body.keys.auth, req.headers.get("user-agent"), lang)
    return {"ok": True}


@router.post("/unsubscribe", dependencies=[limit(20, 600)])
async def unsubscribe(body: EndpointIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await push.unsubscribe(db, u.id, body.endpoint)
    return {"ok": True}


@router.post("/test", dependencies=[limit(5, 600)])
async def test(body: EndpointIn, u: AuthUser = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Envoie une notification d'essai À CET APPAREIL seulement (pour vérifier que tout fonctionne)."""
    payload = {"title": "Crushduo", "body": "Les notifications fonctionnent sur cet appareil.", "url": "/settings?tab=notifications", "tag": "push-test"}
    return {"sent": await push.send_to_user(db, u.id, payload, only_endpoint=body.endpoint)}

"""Boîte de contact : envoi public depuis la page Contact, lecture et traitement par l'administration (ADMIN minimum : e-mails de visiteurs)."""
from __future__ import annotations

import re
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import ADM, after_cursor, audit, iso, page, paged
from app.core.auth import AuthUser
from app.core.errors import not_found
from app.core.ids import utcnow
from app.core.ratelimit import limit
from app.db.session import get_db
from app.models.models import ContactMessage

router = APIRouter(tags=["contact"])

TOPICS = ("account", "billing", "safety", "privacy", "idea", "other")
STATUSES = ("NEW", "READ", "ANSWERED", "ARCHIVED")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ContactIn(BaseModel):
    name: str
    email: str
    topic: Literal["account", "billing", "safety", "privacy", "idea", "other"] = "other"
    message: str
    locale: Literal["fr", "en"] = "fr"
    website: str | None = None  # champ piège : un humain ne le remplit pas

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 80:
            raise ValueError("name_invalid")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if len(v) > 254 or not _EMAIL.match(v):
            raise ValueError("email_invalid")
        return v

    @field_validator("message")
    @classmethod
    def _message(cls, v: str) -> str:
        v = v.strip()
        if not 10 <= len(v) <= 3000:
            raise ValueError("message_invalid")
        return v


class StatusIn(BaseModel):
    status: Literal["NEW", "READ", "ANSWERED", "ARCHIVED"]


@router.post("/contact", status_code=201, dependencies=[limit(5, 3600)])
async def send_contact(body: ContactIn, db: AsyncSession = Depends(get_db)):
    if body.website:  # robot : on répond comme si c'était accepté, sans rien enregistrer
        return {"ok": True}
    db.add(ContactMessage(name=body.name, email=body.email, topic=body.topic, message=body.message, locale=body.locale))
    await db.commit()
    return {"ok": True}


def _item(m: ContactMessage) -> dict:
    return {"id": m.id, "name": m.name, "email": m.email, "topic": m.topic, "message": m.message, "locale": m.locale, "status": m.status,
            "createdAt": iso(m.createdAt), "handledAt": iso(m.handledAt)}


@router.get("/admin/contact-messages")
async def list_messages(status: str = "NEW", cursor: str | None = None, limit: str | None = None, _: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    take = page(limit)
    status = status if status in STATUSES else "NEW"
    stmt = await after_cursor(db, select(ContactMessage).where(ContactMessage.status == status).order_by(ContactMessage.createdAt.desc(), ContactMessage.id.desc()), ContactMessage, cursor)
    rows = (await db.execute(stmt.limit(take + 1))).scalars().all()
    counts = dict((await db.execute(select(ContactMessage.status, func.count()).group_by(ContactMessage.status))).all())
    out = paged(rows, take, [_item(m) for m in rows[:take]])
    out["counts"] = {s: counts.get(s, 0) for s in STATUSES}
    return out


@router.patch("/admin/contact-messages/{message_id}")
async def set_status(message_id: str, body: StatusIn, a: AuthUser = ADM, db: AsyncSession = Depends(get_db)):
    res = await db.execute(update(ContactMessage).where(ContactMessage.id == message_id).values(status=body.status, handledById=a.id, handledAt=utcnow()))
    if res.rowcount == 0:
        raise not_found("CONTACT_MESSAGE_NOT_FOUND")
    await db.commit()
    await audit(db, a.id, "contact.status", "ContactMessage", message_id, {"status": body.status})
    return {"ok": True}

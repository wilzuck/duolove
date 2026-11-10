"""Adresses bloquées (rebond définitif, plainte) : on n'écrit plus à une adresse qui n'existe pas ou qui nous a signalés comme spam,
sous peine de voir le compte Amazon SES suspendu. Une plainte laisse passer les e-mails de sécurité que la personne a demandés elle-même."""
import logging

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import new_id, utcnow
from app.models.models import EmailSuppression, NewsletterSubscriber

log = logging.getLogger("suppression")

# E-mails demandés par la personne pour accéder à son compte : on les envoie même après une plainte (jamais après un rebond : l'adresse n'existe plus).
ESSENTIAL_KINDS = {"verification", "password_reset", "magic_link"}


def norm(email: str) -> str:
    return email.strip().lower()


async def blocked_reason(db: AsyncSession, email: str, kind: str) -> str | None:
    """« BOUNCE » ou « COMPLAINT » si l'envoi doit être refusé, sinon None."""
    reason = (await db.execute(select(EmailSuppression.reason).where(EmailSuppression.email == norm(email)))).scalar_one_or_none()
    if reason == "COMPLAINT" and kind in ESSENTIAL_KINDS:
        return None
    return reason


async def suppress(db: AsyncSession, email: str, reason: str, detail: str | None = None) -> None:
    """Bloque l'adresse (une seule ligne par adresse ; un rebond prime sur une plainte) et la désabonne de la newsletter."""
    e = norm(email)
    stmt = pg_insert(EmailSuppression).values(id=new_id(), email=e, reason=reason, detail=(detail or None) and detail[:500])
    stmt = stmt.on_conflict_do_update(index_elements=["email"], set_={"reason": reason, "detail": stmt.excluded.detail}, where=(EmailSuppression.reason != "BOUNCE"))
    await db.execute(stmt)
    await db.execute(update(NewsletterSubscriber).where(NewsletterSubscriber.email == e, NewsletterSubscriber.status != "UNSUBSCRIBED").values(status="UNSUBSCRIBED", unsubscribedAt=utcnow()))
    await db.commit()
    log.warning("Adresse bloquée (%s) : %s", reason, e)

"""Mode rendez-vous : proposer, accepter, refuser, proposer un autre horaire, annuler, terminer, rappels, partage volontaire.
Sécurité : lieux publics uniquement (catégorie fermée + nom du lieu), aucune localisation précise de membre, partage avec un proche seulement sur action
explicite du membre (lien secret expirant et révocable), rien n'est communiqué sans consentement. Règles (préavis, horizon, plafonds) pilotées par l'admin."""
import asyncio
import datetime
import hashlib
import logging
import re
import secrets

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import appsettings, chat_service, flags, notifications, realtime
from app.core.config import get_settings
from app.core.constants import DATE_REMINDER_MINUTES
from app.core.errors import AppError, bad_request, forbidden, not_found
from app.core.ids import utcnow
from app.core.jsonfmt import iso as _iso
from app.models.models import Conversation, DateProposal, DateReminder, DateShare, Match, Profile

log = logging.getLogger(__name__)
OPEN = ("PROPOSED", "ACCEPTED")
MIN_MINUTES, MAX_MINUTES = 30, 480
_DIGITS = re.compile(r"\d")


def iso(d: datetime.datetime | None) -> str | None:
    return _iso(d) if d else None


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _check_place(name: str) -> None:
    """Un nom de lieu public ne contient ni numéro de téléphone ni coordonnées : 7 chiffres ou plus sont refusés."""
    if len(_DIGITS.findall(name)) >= 7 or "@" in name:
        raise bad_request("INVALID_PLACE", "Indiquez le nom d'un lieu public, sans numéro ni coordonnées")


async def _window_ok(db: AsyncSession, starts: datetime.datetime, ends: datetime.datetime, now: datetime.datetime) -> None:
    cfg = await appsettings.all_values(db)
    if not MIN_MINUTES <= (ends - starts).total_seconds() / 60 <= MAX_MINUTES:
        raise bad_request("INVALID_WINDOW", f"La plage horaire doit durer de {MIN_MINUTES} minutes à {MAX_MINUTES // 60} heures")
    if starts < now + datetime.timedelta(hours=cfg["dates.min_notice_hours"]):
        raise bad_request("TOO_SOON", f"Prévoyez au moins {cfg['dates.min_notice_hours']} h de préavis", {"hours": cfg["dates.min_notice_hours"]})
    if starts > now + datetime.timedelta(days=cfg["dates.max_days_ahead"]):
        raise bad_request("TOO_FAR", f"Le rendez-vous doit avoir lieu dans les {cfg['dates.max_days_ahead']} prochains jours", {"days": cfg["dates.max_days_ahead"]})


async def _serialize(db: AsyncSession, d: DateProposal, viewer_id: str) -> dict:
    rem = (await db.execute(select(DateReminder.minutesBefore).where(DateReminder.dateId == d.id, DateReminder.userId == viewer_id))).scalar_one_or_none()
    shared = (await db.execute(select(DateShare.id).where(DateShare.dateId == d.id, DateShare.userId == viewer_id, DateShare.revokedAt.is_(None), DateShare.expiresAt > utcnow()).limit(1))).first()
    mine = d.proposerId == viewer_id
    return {
        "id": d.id, "conversationId": d.conversationId, "status": d.status, "startsAt": iso(d.startsAt), "endsAt": iso(d.endsAt),
        "placeKind": d.placeKind, "placeName": d.placeName, "note": d.note, "proposedByMe": mine, "previousId": d.previousId,
        "createdAt": iso(d.createdAt), "respondedAt": iso(d.respondedAt), "reminderMinutes": rem, "shared": bool(shared),
        "myFeedback": d.proposerFeedback if mine else d.inviteeFeedback,  # seul son propre retour est renvoyé
    }


async def _locked(db: AsyncSession, user_id: str, date_id: str):
    """Charge et verrouille le rendez-vous ; 404 pour un non-membre (ne révèle pas l'existence)."""
    d = (await db.execute(select(DateProposal).where(DateProposal.id == date_id).with_for_update())).scalar_one_or_none()
    if not d:
        raise not_found("DATE_NOT_FOUND")
    conv, other_id, active = await chat_service.membership(db, user_id, d.conversationId)
    return d, conv, other_id, active


async def _notify(db: AsyncSession, d: DateProposal, actor_id: str, other_id: str) -> None:
    await notifications.create(db, other_id, "DATE_UPDATE", {"conversationId": d.conversationId, "dateId": d.id, "status": d.status, "fromUserId": actor_id})
    await realtime.emit_to_user(other_id, "date:update", {"conversationId": d.conversationId, "dateId": d.id, "status": d.status})


async def list_for(db: AsyncSession, user_id: str, conversation_id: str) -> dict:
    conv, _, _ = await chat_service.membership(db, user_id, conversation_id)
    rows = (await db.execute(select(DateProposal).where(DateProposal.conversationId == conv.id).order_by(DateProposal.createdAt.desc()).limit(30))).scalars().all()
    return {"items": [await _serialize(db, d, user_id) for d in rows]}


async def _create(db: AsyncSession, user_id: str, conv, other_id: str, data: dict, previous: DateProposal | None) -> DateProposal:
    now = utcnow()
    _check_place(data["placeName"])
    await _window_ok(db, data["startsAt"], data["endsAt"], now)
    cfg = await appsettings.all_values(db)
    open_n = (await db.execute(select(func.count()).select_from(DateProposal).where(
        DateProposal.conversationId == conv.id, DateProposal.status.in_(OPEN), DateProposal.endsAt > now, DateProposal.id != (previous.id if previous else "")))).scalar_one()
    if open_n >= cfg["dates.max_open"]:
        raise AppError(409, "TOO_MANY_OPEN_DATES", "Trop de rendez-vous en cours dans cette conversation", {"max": cfg["dates.max_open"]})
    today_n = (await db.execute(select(func.count()).select_from(DateProposal).where(DateProposal.proposerId == user_id, DateProposal.createdAt > now - datetime.timedelta(days=1)))).scalar_one()
    if today_n >= cfg["dates.max_per_day"]:
        raise AppError(429, "DATE_LIMIT", "Limite quotidienne de propositions atteinte", {"max": cfg["dates.max_per_day"]})
    d = DateProposal(conversationId=conv.id, proposerId=user_id, inviteeId=other_id, startsAt=data["startsAt"], endsAt=data["endsAt"], placeKind=data["placeKind"],
                     placeName=data["placeName"].strip(), note=(data.get("note") or None), previousId=previous.id if previous else None)
    db.add(d)
    return d


async def propose(db: AsyncSession, user_id: str, conversation_id: str, data: dict) -> dict:
    await flags.assert_on(db, "date_proposals")
    conv, other_id, active = await chat_service.membership(db, user_id, conversation_id)
    await chat_service._assert_can_send(db, user_id, other_id, active)
    d = await _create(db, user_id, conv, other_id, data, None)
    await db.commit()
    await _notify(db, d, user_id, other_id)
    return await _serialize(db, d, user_id)


async def respond(db: AsyncSession, user_id: str, date_id: str, accept: bool) -> dict:
    await flags.assert_on(db, "date_proposals")
    d, _, other_id, active = await _locked(db, user_id, date_id)
    await chat_service._assert_can_send(db, user_id, other_id, active)
    if d.inviteeId != user_id:
        raise forbidden("NOT_INVITEE", "Seule la personne invitée peut répondre")
    if d.status != "PROPOSED":
        raise AppError(409, "DATE_NOT_PENDING", "Ce rendez-vous n'attend plus de réponse")
    if d.startsAt <= utcnow():
        raise AppError(409, "DATE_PAST", "Ce rendez-vous est passé")
    d.status, d.respondedAt = ("ACCEPTED" if accept else "DECLINED"), utcnow()
    await db.commit()
    await _notify(db, d, user_id, other_id)
    return await _serialize(db, d, user_id)


async def reschedule(db: AsyncSession, user_id: str, date_id: str, data: dict) -> dict:
    """Proposer un autre horaire : l'ancien rendez-vous passe à REPORTÉ, un nouveau est proposé à l'autre personne."""
    await flags.assert_on(db, "date_proposals")
    d, conv, other_id, active = await _locked(db, user_id, date_id)
    await chat_service._assert_can_send(db, user_id, other_id, active)
    allowed = (d.status == "PROPOSED" and d.inviteeId == user_id) or d.status == "ACCEPTED"
    if not allowed:
        raise AppError(409, "DATE_NOT_RESCHEDULABLE", "Ce rendez-vous ne peut pas être reporté")
    new = await _create(db, user_id, conv, other_id, data, d)
    d.status, d.respondedAt = "RESCHEDULED", utcnow()
    await db.commit()
    await _notify(db, new, user_id, other_id)
    return await _serialize(db, new, user_id)


async def cancel(db: AsyncSession, user_id: str, date_id: str) -> dict:
    """Toujours possible tant que le rendez-vous est ouvert, même si la fonction est coupée (on ne piège jamais un membre dans un rendez-vous)."""
    d, _, other_id, _ = await _locked(db, user_id, date_id)
    if d.status not in OPEN:
        raise AppError(409, "DATE_NOT_CANCELABLE", "Ce rendez-vous ne peut plus être annulé")
    if d.status == "PROPOSED" and d.proposerId != user_id:
        raise forbidden("USE_DECLINE", "Pour une proposition reçue, utilisez « Refuser »")
    d.status, d.respondedAt = "CANCELED", utcnow()
    await db.commit()
    await _notify(db, d, user_id, other_id)
    return await _serialize(db, d, user_id)


async def complete(db: AsyncSession, user_id: str, date_id: str) -> dict:
    """Marque le rendez-vous comme terminé (déclaration volontaire d'un des deux membres, une fois l'heure de début passée)."""
    d, _, other_id, _ = await _locked(db, user_id, date_id)
    if d.status == "COMPLETED":
        return await _serialize(db, d, user_id)
    if d.status != "ACCEPTED":
        raise AppError(409, "DATE_NOT_ACCEPTED", "Seul un rendez-vous accepté peut être terminé")
    if d.startsAt > utcnow():
        raise AppError(409, "DATE_NOT_STARTED", "Le rendez-vous n'a pas encore commencé")
    d.status, d.respondedAt = "COMPLETED", utcnow()
    await db.commit()
    await _notify(db, d, user_id, other_id)
    return await _serialize(db, d, user_id)


async def feedback(db: AsyncSession, user_id: str, date_id: str, rating: int) -> dict:
    """Retour facultatif et privé (1 à 5) : seule matière des indicateurs de satisfaction ; jamais déduit."""
    d, _, _, _ = await _locked(db, user_id, date_id)
    if d.status != "COMPLETED":
        raise AppError(409, "DATE_NOT_COMPLETED", "Le retour se donne après un rendez-vous terminé")
    if d.proposerId == user_id:
        d.proposerFeedback = rating
    else:
        d.inviteeFeedback = rating
    await db.commit()
    return await _serialize(db, d, user_id)


async def set_reminder(db: AsyncSession, user_id: str, date_id: str, minutes: int) -> dict:
    d, _, _, _ = await _locked(db, user_id, date_id)
    if minutes and minutes not in DATE_REMINDER_MINUTES:
        raise bad_request("INVALID_REMINDER", "Rappel : 1 h ou 24 h avant", {"allowed": list(DATE_REMINDER_MINUTES)})
    if d.status not in OPEN or d.startsAt <= utcnow():
        raise AppError(409, "DATE_NOT_OPEN", "Ce rendez-vous n'est plus à venir")
    row = (await db.execute(select(DateReminder).where(DateReminder.dateId == d.id, DateReminder.userId == user_id))).scalar_one_or_none()
    if not minutes:
        if row:
            await db.delete(row)
    elif row:
        row.minutesBefore, row.sentAt = minutes, None
    else:
        db.add(DateReminder(dateId=d.id, userId=user_id, minutesBefore=minutes))
    await db.commit()
    return await _serialize(db, d, user_id)


async def create_share(db: AsyncSession, user_id: str, date_id: str) -> dict:
    """Crée un lien secret à envoyer SOI-MÊME à une personne de confiance. Un seul lien actif par membre et par rendez-vous (l'ancien est révoqué)."""
    d, _, _, _ = await _locked(db, user_id, date_id)
    if d.status != "ACCEPTED":
        raise AppError(409, "DATE_NOT_ACCEPTED", "Le partage se fait pour un rendez-vous accepté")
    cfg = await appsettings.all_values(db)
    now = utcnow()
    await db.execute(update(DateShare).where(DateShare.dateId == d.id, DateShare.userId == user_id, DateShare.revokedAt.is_(None)).values(revokedAt=now))
    token = secrets.token_urlsafe(24)
    expires = d.endsAt + datetime.timedelta(hours=cfg["dates.share_hours_after"])
    db.add(DateShare(dateId=d.id, userId=user_id, tokenHash=_hash(token), expiresAt=expires))
    await db.commit()
    return {"token": token, "url": f"{get_settings().app_url}/share/{token}", "expiresAt": iso(expires)}


async def revoke_share(db: AsyncSession, user_id: str, date_id: str) -> dict:
    d, _, _, _ = await _locked(db, user_id, date_id)
    await db.execute(update(DateShare).where(DateShare.dateId == d.id, DateShare.userId == user_id, DateShare.revokedAt.is_(None)).values(revokedAt=utcnow()))
    await db.commit()
    return await _serialize(db, d, user_id)


async def shared_view(db: AsyncSession, token: str) -> dict:
    """Lecture PUBLIQUE par la personne de confiance : prénoms, horaire, lieu public et statut. Ni photo, ni contact, ni position."""
    sh = (await db.execute(select(DateShare).where(DateShare.tokenHash == _hash(token)))).scalar_one_or_none()
    if not sh or sh.revokedAt or sh.expiresAt <= utcnow():
        raise not_found("SHARE_NOT_FOUND")
    d = await db.get(DateProposal, sh.dateId)
    names = dict((await db.execute(select(Profile.userId, Profile.displayName).where(Profile.userId.in_([d.proposerId, d.inviteeId])))).all())
    other = d.inviteeId if sh.userId == d.proposerId else d.proposerId
    return {"status": d.status, "startsAt": iso(d.startsAt), "endsAt": iso(d.endsAt), "placeKind": d.placeKind, "placeName": d.placeName,
            "sharedBy": names.get(sh.userId, ""), "meeting": names.get(other, ""), "expiresAt": iso(sh.expiresAt)}


async def run_reminders(db: AsyncSession, now: datetime.datetime | None = None) -> dict:
    """Rappels dus (une seule fois par membre) et expiration des propositions restées sans réponse après l'heure de début."""
    now = now or utcnow()
    due = (await db.execute(
        select(DateReminder, DateProposal).join(DateProposal, DateProposal.id == DateReminder.dateId)
        .where(DateReminder.sentAt.is_(None), DateProposal.status == "ACCEPTED", DateProposal.startsAt > now,
               DateProposal.startsAt - func.make_interval(0, 0, 0, 0, 0, DateReminder.minutesBefore) <= now)
    )).all()
    for r, d in due:
        r.sentAt = now
        await db.commit()
        await notifications.create(db, r.userId, "DATE_REMINDER", {"conversationId": d.conversationId, "dateId": d.id, "startsAt": iso(d.startsAt), "minutes": r.minutesBefore})
    stale = await db.execute(update(DateProposal).where(DateProposal.status == "PROPOSED", DateProposal.startsAt < now).values(status="CANCELED", respondedAt=now))
    await db.commit()
    return {"reminded": len(due), "expired": stale.rowcount}


async def reminder_loop(maker, every: int = 300) -> None:
    """Boucle de rappels (instance unique) ; multi-instances → cron avec verrou. Lancée au démarrage hors test."""
    while True:
        await asyncio.sleep(every)
        try:
            async with maker() as db:
                await run_reminders(db)
        except Exception:
            log.exception("date reminders")

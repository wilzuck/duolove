"""Speed dating en texte : sessions publiées par l'admin, inscription volontaire avec contrôle d'éligibilité, binômes compatibles par tour,
échange de messages chronométré, décision privée de chaque personne ; match uniquement si l'intérêt est réciproque (jamais de rejet révélé).
Le déroulé est piloté par l'horloge : tours de `roundSeconds`, pause entre les tours, puis fenêtre de décision (réglages admin).
Sécurité : coordonnées refusées dans les messages, signalement et blocage (exclus des binômes), possibilité de quitter à tout moment."""
import datetime
import hashlib
import random
import re

from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import appsettings, flags, notifications, realtime, rhythm
from app.core.constants import age_from_birth_date
from app.core.discoverysvc import GENDERS_FOR, SEEKING_THAT_ACCEPT
from app.core.errors import AppError, bad_request, conflict, forbidden, not_found
from app.core.ids import utcnow
from app.core.jsonfmt import iso as _iso
from app.core.profile_card import load_cards, photo_url, thumb_key
from app.models.models import Block, Conversation, Match, Preference, Profile, SpeedEvent, SpeedMessage, SpeedPair, SpeedRegistration, User

_DIGITS = re.compile(r"\d")
INTENTS = ("SERIOUS", "MARRIAGE", "DATING", "FRIENDSHIP", "UNSURE")


def iso(d: datetime.datetime | None) -> str | None:
    return _iso(d) if d else None


def _v(x):
    return x.value if hasattr(x, "value") else x


def contact_info(body: str) -> bool:
    """Pas de numéro, d'adresse ni de lien avant d'avoir matché : 7 chiffres ou plus, « @ » ou « http » sont refusés."""
    low = body.lower()
    return len(_DIGITS.findall(body)) >= 7 or "@" in body or "http" in low or "www." in low


# ───────── horloge ─────────
def phase(ev: SpeedEvent, cfg: dict, now: datetime.datetime) -> dict:
    """État dérivé de l'horloge : UPCOMING, ROUND (tour n), BREAK (avant le tour n+1), DECISION, ENDED."""
    if ev.status == "CANCELED":
        return {"phase": "CANCELED", "round": 0, "secondsLeft": 0}
    gap, dec = cfg["speed.gap_seconds"], cfg["speed.decision_seconds"]
    if now < ev.startsAt:
        return {"phase": "UPCOMING", "round": 0, "secondsLeft": int((ev.startsAt - now).total_seconds())}
    t = (now - ev.startsAt).total_seconds()
    slot = ev.roundSeconds + gap
    for i in range(ev.rounds):
        start = i * slot
        if t < start + ev.roundSeconds:
            return {"phase": "ROUND", "round": i + 1, "secondsLeft": int(start + ev.roundSeconds - t)}
        if i < ev.rounds - 1 and t < start + slot:
            return {"phase": "BREAK", "round": i + 1, "secondsLeft": int(start + slot - t)}
    end_rounds = (ev.rounds - 1) * slot + ev.roundSeconds
    if t < end_rounds + dec:
        return {"phase": "DECISION", "round": ev.rounds, "secondsLeft": int(end_rounds + dec - t)}
    return {"phase": "ENDED", "round": ev.rounds, "secondsLeft": 0}


# ───────── éligibilité ─────────
async def _eligibility(db: AsyncSession, ev: SpeedEvent, user_id: str, now: datetime.datetime) -> str | None:
    """Retourne None si éligible, sinon le code de la raison (jamais de détail sur d'autres membres)."""
    p = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one_or_none()
    if not p or p.onboardedAt is None:
        return "PROFILE_INCOMPLETE"
    if rhythm.is_paused(p, now):
        return "PAUSED"
    age = age_from_birth_date(p.birthDate, now)
    if not ev.ageMin <= age <= ev.ageMax:
        return "AGE_OUT_OF_RANGE"
    if ev.intent and _v(p.intent) != ev.intent:
        return "INTENT_MISMATCH"
    if ev.city and p.city.strip().lower() != ev.city.strip().lower():
        return "CITY_MISMATCH"
    return None


def _compatible(a: tuple[Profile, Preference], b: tuple[Profile, Preference]) -> bool:
    (pa, fa), (pb, fb) = a, b
    return (_v(pb.gender) in GENDERS_FOR[_v(fa.seeking)] and _v(pa.gender) in GENDERS_FOR[_v(fb.seeking)])


def build_rounds(users: list[str], compatible, rounds: int, seed: str) -> list[list[tuple[str, str]]]:
    """Binômes de chaque tour : jamais deux fois la même paire, une seule personne par binôme et par tour, uniquement des paires compatibles.
    Fonction pure (testable) : `compatible(a, b)` décide si deux personnes peuvent se rencontrer ; qui n'a pas de binôme se repose."""
    rnd = random.Random(int(hashlib.sha256(seed.encode()).hexdigest()[:12], 16))
    met: set[frozenset[str]] = set()
    out: list[list[tuple[str, str]]] = []
    rest_count: dict[str, int] = {u: 0 for u in users}
    for _ in range(rounds):
        order = sorted(users, key=lambda u: (-rest_count[u], rnd.random()))  # ceux qui se sont le plus reposés passent d'abord
        free, pairs = set(order), []
        for u in order:
            if u not in free:
                continue
            for w in order:
                if w != u and w in free and frozenset((u, w)) not in met and compatible(u, w):
                    free -= {u, w}
                    met.add(frozenset((u, w)))
                    pairs.append((u, w))
                    break
        for u in free:
            rest_count[u] += 1
        out.append(pairs)
    return out


async def _blocked_pairs(db: AsyncSession, ids: list[str]) -> set[frozenset[str]]:
    rows = (await db.execute(select(Block.blockerId, Block.blockedId).where(Block.blockerId.in_(ids), Block.blockedId.in_(ids)))).all()
    return {frozenset(r) for r in rows}


# ───────── cycle de vie de la session ─────────
async def _lock(db: AsyncSession, ev_id: str) -> None:
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"speed:{ev_id}"})


async def _start_if_due(db: AsyncSession, ev: SpeedEvent, now: datetime.datetime) -> SpeedEvent:
    """Au premier accès après l'heure de début : génère les binômes (une seule fois) ou annule faute de participants."""
    if ev.status != "SCHEDULED" or now < ev.startsAt:
        return ev
    await db.commit()
    await _lock(db, ev.id)
    ev = (await db.execute(select(SpeedEvent).where(SpeedEvent.id == ev.id).with_for_update())).scalar_one()
    if ev.status != "SCHEDULED":
        return ev
    cfg = await appsettings.all_values(db)
    uids = (await db.execute(select(SpeedRegistration.userId).where(SpeedRegistration.eventId == ev.id, SpeedRegistration.status == "REGISTERED")
                             .order_by(SpeedRegistration.createdAt))).scalars().all()
    active = (await db.execute(select(User.id).where(User.id.in_(uids), User.status == "ACTIVE"))).scalars().all() if uids else []
    profiles = {p.userId: p for p in (await db.execute(select(Profile).where(Profile.userId.in_(active)))).scalars().all()} if active else {}
    prefs = {p.userId: p for p in (await db.execute(select(Preference).where(Preference.userId.in_(active)))).scalars().all()} if active else {}
    users = [u for u in active if u in profiles and u in prefs]
    if len(users) < cfg["speed.min_participants"]:
        ev.status, ev.cancelReason = "CANCELED", "NOT_ENOUGH_PARTICIPANTS"
        await db.commit()
        return ev
    blocked = await _blocked_pairs(db, users)
    compat = lambda a, b: frozenset((a, b)) not in blocked and _compatible((profiles[a], prefs[a]), (profiles[b], prefs[b]))  # noqa: E731
    for n, pairs in enumerate(build_rounds(users, compat, ev.rounds, ev.id), start=1):
        for a, b in pairs:
            db.add(SpeedPair(eventId=ev.id, round=n, userAId=a, userBId=b))
    ev.status = "RUNNING"
    await db.commit()
    return ev


async def _make_match(db: AsyncSession, a: str, b: str) -> tuple[str, str] | None:
    """Crée (ou retrouve) le match et sa conversation ; respecte un blocage ou une rupture existants. Retourne l'id de conversation."""
    x, y = sorted((a, b))
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"{x}:{y}"})
    if (await db.execute(select(Block.id).where(or_(and_(Block.blockerId == a, Block.blockedId == b), and_(Block.blockerId == b, Block.blockedId == a))).limit(1))).first():
        return None
    m = (await db.execute(select(Match).where(Match.userAId == x, Match.userBId == y))).scalar_one_or_none()
    if m and _v(m.status) != "ACTIVE":
        return None
    if not m:
        m = Match(userAId=x, userBId=y)
        db.add(m)
        await db.flush()
    conv = (await db.execute(select(Conversation).where(Conversation.matchId == m.id))).scalar_one_or_none()
    if not conv:
        conv = Conversation(matchId=m.id)
        db.add(conv)
        await db.flush()
    return conv.id, m.id


async def _finish_if_due(db: AsyncSession, ev: SpeedEvent, now: datetime.datetime) -> SpeedEvent:
    """Fin de la fenêtre de décision : les intérêts réciproques deviennent des matchs (une seule fois, sous verrou)."""
    if ev.status != "RUNNING" or phase(ev, await appsettings.all_values(db), now)["phase"] != "ENDED":
        return ev
    await db.commit()
    await _lock(db, ev.id)
    ev = (await db.execute(select(SpeedEvent).where(SpeedEvent.id == ev.id).with_for_update())).scalar_one()
    if ev.status != "RUNNING":
        return ev
    pairs = (await db.execute(select(SpeedPair).where(SpeedPair.eventId == ev.id, SpeedPair.decisionA == "INTEREST", SpeedPair.decisionB == "INTEREST"))).scalars().all()
    created = []
    for p in pairs:
        res = await _make_match(db, p.userAId, p.userBId)
        if res:
            created.append((p.userAId, p.userBId, res[0], res[1]))
    ev.status = "CLOSED"
    await db.commit()
    for a, b, conv_id, match_id in created:
        for me, other in ((a, b), (b, a)):
            md = {"matchId": match_id, "conversationId": conv_id, "userId": other, "source": "SPEED_DATING"}
            await notifications.create(db, me, "MATCH", md)
            await realtime.emit_to_user(me, "match:new", {"matchId": match_id, "conversationId": conv_id, "userId": other})
    return ev


async def advance(db: AsyncSession, ev: SpeedEvent) -> SpeedEvent:
    now = utcnow()
    ev = await _start_if_due(db, ev, now)
    return await _finish_if_due(db, ev, now)


async def sweep(db: AsyncSession) -> int:
    """Balayage de fond : démarre les sessions arrivées à l'heure et clôture celles dont la décision est terminée."""
    now = utcnow()
    rows = (await db.execute(select(SpeedEvent).where(SpeedEvent.status.in_(["SCHEDULED", "RUNNING"]), SpeedEvent.startsAt <= now))).scalars().all()
    for ev in rows:
        await advance(db, ev)
    return len(rows)


# ───────── présentation ─────────
async def _counts(db: AsyncSession, ids: list[str]) -> dict[str, int]:
    if not ids:
        return {}
    return dict((await db.execute(select(SpeedRegistration.eventId, func.count()).where(SpeedRegistration.eventId.in_(ids), SpeedRegistration.status == "REGISTERED")
                                   .group_by(SpeedRegistration.eventId))).all())


def _event_dict(ev: SpeedEvent, ph: dict, registered: int, mine: str | None) -> dict:
    return {"id": ev.id, "title": ev.title, "description": ev.description, "city": ev.city, "ageMin": ev.ageMin, "ageMax": ev.ageMax, "intent": ev.intent,
            "capacity": ev.capacity, "registered": registered, "spotsLeft": max(ev.capacity - registered, 0), "roundSeconds": ev.roundSeconds, "rounds": ev.rounds,
            "startsAt": iso(ev.startsAt), "status": ev.status, "cancelReason": ev.cancelReason, "phase": ph["phase"], "round": ph["round"], "secondsLeft": ph["secondsLeft"], "myStatus": mine}


async def list_events(db: AsyncSession, user_id: str) -> list[dict]:
    await flags.assert_on(db, "speed_dating")
    now = utcnow()
    cfg = await appsettings.all_values(db)
    evs = (await db.execute(select(SpeedEvent).where(SpeedEvent.status != "CANCELED", SpeedEvent.startsAt > now - datetime.timedelta(hours=6))
                            .order_by(SpeedEvent.startsAt).limit(50))).scalars().all()
    evs = [await advance(db, e) for e in evs]
    counts = await _counts(db, [e.id for e in evs])
    mine = dict((await db.execute(select(SpeedRegistration.eventId, SpeedRegistration.status).where(SpeedRegistration.userId == user_id, SpeedRegistration.eventId.in_([e.id for e in evs])))).all()) if evs else {}
    out = []
    for e in evs:
        d = _event_dict(e, phase(e, cfg, now), counts.get(e.id, 0), mine.get(e.id))
        d["eligible"] = (await _eligibility(db, e, user_id, now)) if d["phase"] == "UPCOMING" and mine.get(e.id) != "REGISTERED" else None
        out.append(d)
    return [d for d in out if d["phase"] != "ENDED" or d["myStatus"] == "REGISTERED"]


async def _event(db: AsyncSession, ev_id: str) -> SpeedEvent:
    ev = (await db.execute(select(SpeedEvent).where(SpeedEvent.id == ev_id))).scalar_one_or_none()
    if not ev:
        raise not_found("SPEED_EVENT_NOT_FOUND")
    return ev


async def register(db: AsyncSession, user_id: str, ev_id: str) -> dict:
    await flags.assert_on(db, "speed_dating")
    now = utcnow()
    await _lock(db, ev_id)
    ev = await _event(db, ev_id)
    if ev.status != "SCHEDULED" or now >= ev.startsAt:
        raise conflict("REGISTRATION_CLOSED", "Les inscriptions sont closes.")
    reason = await _eligibility(db, ev, user_id, now)
    if reason:
        raise AppError(403, "NOT_ELIGIBLE", "Cette session ne correspond pas à votre profil.", {"reason": reason})
    reg = (await db.execute(select(SpeedRegistration).where(SpeedRegistration.eventId == ev_id, SpeedRegistration.userId == user_id))).scalar_one_or_none()
    n = (await _counts(db, [ev_id])).get(ev_id, 0)
    if not reg or reg.status != "REGISTERED":
        if n >= ev.capacity:
            raise conflict("EVENT_FULL", "Cette session est complète.")
        if reg:
            reg.status = "REGISTERED"
        else:
            db.add(SpeedRegistration(eventId=ev_id, userId=user_id))
        await db.commit()
    return await detail(db, user_id, ev_id)


async def unregister(db: AsyncSession, user_id: str, ev_id: str) -> dict:
    """Se désinscrire avant le début ; une fois la session lancée, quitter (le binôme en est informé sans détail)."""
    ev = await advance(db, await _event(db, ev_id))
    reg = (await db.execute(select(SpeedRegistration).where(SpeedRegistration.eventId == ev_id, SpeedRegistration.userId == user_id))).scalar_one_or_none()
    if reg and reg.status == "REGISTERED":
        reg.status = "CANCELED" if ev.status == "SCHEDULED" else "LEFT"
        await db.commit()
    return await detail(db, user_id, ev_id)


def _other(p: SpeedPair, user_id: str) -> str:
    return p.userBId if p.userAId == user_id else p.userAId


async def _partner_card(db: AsyncSession, user_id: str) -> dict | None:
    p = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one_or_none()
    if not p:
        return None
    c = (await load_cards(db, [p]))[0]
    ph = c.photos[0] if c.photos else None
    return {"id": user_id, "displayName": p.displayName, "age": age_from_birth_date(p.birthDate), "city": p.city, "bio": p.bio, "intent": _v(p.intent),
            "interests": c.interests[:6], "thumbUrl": photo_url(thumb_key(ph.key)) if ph else None}


def _my_decision(p: SpeedPair, user_id: str) -> str | None:
    return p.decisionA if p.userAId == user_id else p.decisionB


async def detail(db: AsyncSession, user_id: str, ev_id: str) -> dict:
    """Salle d'une session pour un membre : phase, binôme du tour avec ses messages, liste des rencontres à départager, résultats."""
    await flags.assert_on(db, "speed_dating")
    ev = await advance(db, await _event(db, ev_id))
    now = utcnow()
    cfg = await appsettings.all_values(db)
    ph = phase(ev, cfg, now)
    reg = (await db.execute(select(SpeedRegistration).where(SpeedRegistration.eventId == ev_id, SpeedRegistration.userId == user_id))).scalar_one_or_none()
    mine = reg.status if reg else None
    counts = await _counts(db, [ev_id])
    out = {"event": _event_dict(ev, ph, counts.get(ev_id, 0), mine), "rest": False, "partner": None, "pairId": None, "messages": [], "meetings": [], "results": [],
           "messageMax": cfg["speed.message_max"], "eligible": None}
    if mine is None or ev.status == "SCHEDULED":
        if ev.status == "SCHEDULED" and mine != "REGISTERED":
            out["eligible"] = await _eligibility(db, ev, user_id, now)
        return out
    pairs = (await db.execute(select(SpeedPair).where(SpeedPair.eventId == ev_id, or_(SpeedPair.userAId == user_id, SpeedPair.userBId == user_id)).order_by(SpeedPair.round))).scalars().all()
    if ph["phase"] in ("ROUND", "BREAK"):
        cur = next((p for p in pairs if p.round == ph["round"]), None)
        if ph["phase"] == "ROUND":
            out["rest"] = cur is None
            if cur:
                other = _other(cur, user_id)
                left = (await db.execute(select(SpeedRegistration.status).where(SpeedRegistration.eventId == ev_id, SpeedRegistration.userId == other))).scalar_one_or_none() == "LEFT"
                out["partner"] = {**(await _partner_card(db, other)), "left": left}
                out["pairId"] = cur.id
                out["myDecision"] = _my_decision(cur, user_id)
                out["messages"] = await _messages(db, cur.id, user_id)
    if ph["phase"] in ("DECISION", "ENDED", "BREAK", "ROUND") and pairs:
        met = [p for p in pairs if p.round < ph["round"] or ph["phase"] in ("DECISION", "ENDED") or (ph["phase"] == "BREAK" and p.round <= ph["round"])]
        for p in met:
            other = _other(p, user_id)
            out["meetings"].append({"pairId": p.id, "round": p.round, "user": await _partner_card(db, other), "myDecision": _my_decision(p, user_id)})
    if ev.status == "CLOSED":
        for p in pairs:
            if p.decisionA == "INTEREST" and p.decisionB == "INTEREST":
                other = _other(p, user_id)
                x, y = sorted((user_id, other))
                m = (await db.execute(select(Match).where(Match.userAId == x, Match.userBId == y))).scalar_one_or_none()
                conv = (await db.execute(select(Conversation.id).where(Conversation.matchId == m.id))).scalar_one_or_none() if m else None
                if conv:
                    out["results"].append({"user": await _partner_card(db, other), "conversationId": conv})
    return out


async def _messages(db: AsyncSession, pair_id: str, user_id: str) -> list[dict]:
    rows = (await db.execute(select(SpeedMessage).where(SpeedMessage.pairId == pair_id).order_by(SpeedMessage.createdAt).limit(200))).scalars().all()
    return [{"id": m.id, "mine": m.senderId == user_id, "body": m.body, "createdAt": iso(m.createdAt)} for m in rows]


async def _current_pair(db: AsyncSession, user_id: str, ev_id: str, ev: SpeedEvent, cfg: dict, now: datetime.datetime) -> tuple[SpeedPair, dict]:
    ph = phase(ev, cfg, now)
    reg = (await db.execute(select(SpeedRegistration.status).where(SpeedRegistration.eventId == ev_id, SpeedRegistration.userId == user_id))).scalar_one_or_none()
    if reg != "REGISTERED" or ev.status != "RUNNING" or ph["phase"] != "ROUND":
        raise conflict("NOT_IN_ROUND", "Aucun échange n'est en cours.")
    p = (await db.execute(select(SpeedPair).where(SpeedPair.eventId == ev_id, SpeedPair.round == ph["round"], or_(SpeedPair.userAId == user_id, SpeedPair.userBId == user_id)))).scalar_one_or_none()
    if not p:
        raise conflict("RESTING", "Vous vous reposez pendant ce tour.")
    return p, ph


async def send_message(db: AsyncSession, user_id: str, ev_id: str, body: str) -> dict:
    await flags.assert_on(db, "speed_dating")
    ev = await advance(db, await _event(db, ev_id))
    cfg = await appsettings.all_values(db)
    body = body.strip()
    if not body or len(body) > cfg["speed.message_max"]:
        raise bad_request("INVALID_MESSAGE", "Message vide ou trop long", {"max": cfg["speed.message_max"]})
    if contact_info(body):
        raise bad_request("CONTACT_INFO", "Pour votre sécurité, gardez vos coordonnées pour après le match.")
    pair, _ = await _current_pair(db, user_id, ev_id, ev, cfg, utcnow())
    other = _other(pair, user_id)
    if (await db.execute(select(SpeedRegistration.status).where(SpeedRegistration.eventId == ev_id, SpeedRegistration.userId == other))).scalar_one_or_none() != "REGISTERED":
        raise conflict("PARTNER_LEFT", "Votre binôme a quitté la session.")
    if (await db.execute(select(Block.id).where(or_(and_(Block.blockerId == user_id, Block.blockedId == other), and_(Block.blockerId == other, Block.blockedId == user_id))).limit(1))).first():
        raise forbidden("CONVERSATION_CLOSED", "Cet échange est fermé")
    m = SpeedMessage(pairId=pair.id, senderId=user_id, body=body)
    db.add(m)
    await db.commit()
    msg = {"id": m.id, "body": m.body, "createdAt": iso(m.createdAt)}
    await realtime.emit_to_user(other, "speed:message", {"eventId": ev_id, "pairId": pair.id, **msg, "mine": False})
    return {**msg, "mine": True}


async def decide(db: AsyncSession, user_id: str, ev_id: str, pair_id: str, decision: str) -> dict:
    """Intérêt ou non, en privé. Modifiable jusqu'à la fin de la fenêtre de décision ; l'autre personne ne le sait jamais."""
    await flags.assert_on(db, "speed_dating")
    if decision not in ("INTEREST", "PASS"):
        raise bad_request("INVALID_DECISION", "Décision invalide")
    ev = await advance(db, await _event(db, ev_id))
    ph = phase(ev, await appsettings.all_values(db), utcnow())
    p = (await db.execute(select(SpeedPair).where(SpeedPair.id == pair_id, SpeedPair.eventId == ev_id).with_for_update())).scalar_one_or_none()
    if not p or user_id not in (p.userAId, p.userBId):
        raise not_found("PAIR_NOT_FOUND")
    if ev.status != "RUNNING" or ph["phase"] == "ENDED" or p.round > ph["round"]:
        raise conflict("DECISION_CLOSED", "Les choix sont clos.")
    if p.userAId == user_id:
        p.decisionA = decision
    else:
        p.decisionB = decision
    await db.commit()
    return {"pairId": p.id, "myDecision": decision}


async def stats(db: AsyncSession) -> dict:
    ev = (await db.execute(select(func.count()).select_from(SpeedEvent).where(SpeedEvent.status != "CANCELED"))).scalar_one()
    regs = (await db.execute(select(func.count()).select_from(SpeedRegistration).where(SpeedRegistration.status != "CANCELED"))).scalar_one()
    mutual = (await db.execute(select(func.count()).select_from(SpeedPair).where(SpeedPair.decisionA == "INTEREST", SpeedPair.decisionB == "INTEREST"))).scalar_one()
    pairs = (await db.execute(select(func.count()).select_from(SpeedPair))).scalar_one()
    return {"events": ev, "registrations": regs, "pairs": pairs, "mutualInterests": mutual, "mutualRate": round(mutual / pairs, 3) if pairs else 0.0}


async def sweep_loop(maker, every: int = 20) -> None:
    import asyncio
    import logging
    while True:
        await asyncio.sleep(every)
        try:
            async with maker() as db:
                await sweep(db)
        except Exception:
            logging.getLogger(__name__).exception("balayage du speed dating")

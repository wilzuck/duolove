"""Menu « Match » : recherche en direct, invitations, ouverture de conversation avec jetons. Miroir de live/live.service.ts."""
import datetime
import logging

from sqlalchemy import and_, exists, func, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import credits, entitlements, notifications, realtime, rhythm
from app.core.constants import LIVE
from app.core.errors import AppError, bad_request, conflict, forbidden, not_found
from app.core.gift import gift_tokens_if_eligible
from app.core.ids import new_id, utcnow
from app.core.jsonfmt import iso
from app.core.live_criteria import accepts_seeker, matches_criteria, parse_criteria
from app.core.profile_card import load_cards, to_card
from app.models.models import (
    Block, Conversation, LiveInvite, LiveSearch, Match, Preference, Profile, ProfilePhoto, Swipe, User,
)

log = logging.getLogger("live")
MIN = datetime.timedelta(minutes=1)


def order_pair(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


async def _cards(db: AsyncSession, user_ids: list[str]) -> dict[str, dict]:
    """Fiches publiques (toCard) : ni position précise ni donnée privée."""
    if not user_ids:
        return {}
    profiles = list((await db.execute(select(Profile).where(Profile.userId.in_(user_ids)))).scalars())
    return {c.profile.userId: to_card(c) for c in await load_cards(db, profiles)}


async def expire_stale(db: AsyncSession) -> None:
    """Nettoyage paresseux : invitations sans réponse et recherches arrivées à échéance."""
    now = utcnow()
    await db.execute(update(LiveInvite).where(LiveInvite.status.in_(["PENDING", "ACCEPTED"]), LiveInvite.expiresAt < now).values(status="EXPIRED"))
    await db.execute(update(LiveSearch).where(LiveSearch.status == "ACTIVE", LiveSearch.expiresAt < now).values(status="EXPIRED"))
    await db.commit()


async def _access(db: AsyncSession, user_id: str) -> dict:
    limits = (await entitlements.get(db, user_id))["limits"]
    used = (await db.execute(select(func.count()).select_from(LiveSearch).where(LiveSearch.userId == user_id))).scalar_one()
    unlimited = limits["liveMatch"]
    trials_left = None if unlimited else max(0, limits["liveMatchTrials"] - used)
    return {"unlimited": unlimited, "trialsLeft": trials_left, "canStart": unlimited or (trials_left or 0) > 0}


async def state(db: AsyncSession, user_id: str) -> dict:
    await expire_stale(db)
    await gift_tokens_if_eligible(db, user_id)
    access = await _access(db, user_id)
    balances = await credits.balances(db, user_id)
    me = (await db.execute(
        select(Profile.liveOptIn, Profile.completeness, User.emailVerifiedAt).join(User, User.id == Profile.userId).where(Profile.userId == user_id)
    )).first()
    pref = (await db.execute(select(Preference).where(Preference.userId == user_id))).scalar_one_or_none()
    search = (await db.execute(select(LiveSearch).where(LiveSearch.userId == user_id, LiveSearch.status == "ACTIVE")
                               .order_by(LiveSearch.createdAt.desc()).limit(1))).scalar_one_or_none()
    incoming_count = (await db.execute(select(func.count()).select_from(LiveInvite).where(
        LiveInvite.inviteeId == user_id, LiveInvite.status == "PENDING", LiveInvite.expiresAt > utcnow()))).scalar_one()
    last_created = (await db.execute(select(LiveSearch.createdAt).where(LiveSearch.userId == user_id)
                                     .order_by(LiveSearch.createdAt.desc()).limit(1))).scalar_one_or_none()
    if not me:
        raise forbidden("PROFILE_INCOMPLETE")

    accepted: list[dict] = []
    pending = 0
    if search:
        invites = (await db.execute(select(LiveInvite).where(LiveInvite.searchId == search.id).order_by(LiveInvite.respondedAt.asc().nulls_last()))).scalars().all()
        pending = sum(1 for i in invites if i.status.value == "PENDING")
        shown = [i for i in invites if i.status.value in ("ACCEPTED", "CHOSEN")]
        cards = await _cards(db, [i.inviteeId for i in shown])
        conv_of: dict[str, str | None] = {}
        if shown:
            pairs = [order_pair(user_id, i.inviteeId) for i in shown]
            rows = (await db.execute(
                select(Match.userAId, Match.userBId, Conversation.id).outerjoin(Conversation, Conversation.matchId == Match.id)
                .where(Match.status == "ACTIVE", or_(*[and_(Match.userAId == a, Match.userBId == b) for a, b in pairs]))
            )).all()
            conv_of = {(r.userBId if r.userAId == user_id else r.userAId): r[2] for r in rows}
        liked_ids = set()
        if shown:
            liked_ids = set((await db.execute(select(Swipe.targetId).where(
                Swipe.giverId == user_id, Swipe.targetId.in_([i.inviteeId for i in shown]), Swipe.action.in_(["LIKE", "SUPER_LIKE"])))).scalars())
        for i in shown:
            card = cards.get(i.inviteeId)
            if card:
                # Une conversation existe aussi quand un like réciproque a créé le match (sans jeton) : elle est alors ouvrable gratuitement.
                accepted.append({**card, "inviteId": i.id, "status": i.status.value, "conversationId": conv_of.get(i.inviteeId),
                                 "liked": i.inviteeId in liked_ids, "expiresAt": iso(i.expiresAt)})
    chosen = sum(1 for a in accepted if a["status"] == "CHOSEN")
    return {
        "access": access, "tokens": balances["MATCH_TOKEN"], "optIn": me.liveOptIn,
        "gift": {"tokens": LIVE.PROFILE_GIFT_TOKENS, "completeness": me.completeness, "emailVerified": bool(me.emailVerifiedAt)},
        "rules": {"tokensPerChat": LIVE.TOKENS_PER_CHAT, "maxChoices": LIVE.MAX_CHOICES, "cooldownMinutes": LIVE.COOLDOWN_MINUTES, "searchHours": LIVE.SEARCH_HOURS},
        "defaults": {"seeking": pref.seeking.value if pref else "EVERYONE", "ageMin": pref.ageMin if pref else 18,
                     "ageMax": pref.ageMax if pref else 60, "country": pref.country if pref else None},
        "nextLaunchAt": iso(last_created + LIVE.COOLDOWN_MINUTES * MIN) if last_created else None,
        "incomingCount": incoming_count,
        "search": {"id": search.id, "criteria": search.criteria, "createdAt": iso(search.createdAt), "expiresAt": iso(search.expiresAt),
                   "pending": pending, "chosen": chosen, "choicesLeft": max(0, LIVE.MAX_CHOICES - chosen)} if search else None,
        "accepted": accepted,
    }


def _online_clause():
    since = utcnow() - LIVE.ONLINE_MINUTES * MIN
    sockets = realtime.online_ids()
    return or_(User.lastActiveAt >= since, User.id.in_(sockets)) if sockets else User.lastActiveAt >= since


def _no_relation(candidate_id, other_id):
    """Ni blocage (dans un sens ou l'autre) ni relation existante (même ancienne) entre les deux membres."""
    no_block = ~exists().where(or_(and_(Block.blockerId == candidate_id, Block.blockedId == other_id),
                                    and_(Block.blockerId == other_id, Block.blockedId == candidate_id)))
    no_match = ~exists().where(or_(and_(Match.userAId == candidate_id, Match.userBId == other_id),
                                    and_(Match.userBId == candidate_id, Match.userAId == other_id)))
    return and_(no_block, no_match)


async def start(db: AsyncSession, user_id: str, raw: object) -> dict:
    await rhythm.assert_not_paused(db, user_id)
    """Lance une recherche : valide les critères, verrouille l'accès (formule ou essais) et le délai, invite les personnes en ligne."""
    criteria, errors = parse_criteria(raw)
    if criteria is None:
        raise bad_request("VALIDATION_ERROR", "Critères invalides", errors)
    await expire_stale(db)
    me = (await db.execute(select(Profile.userId, Profile.gender, Profile.birthDate, Profile.onboardedAt).where(Profile.userId == user_id))).first()
    if not me or not me.onboardedAt:
        raise forbidden("PROFILE_INCOMPLETE", "Complétez votre profil")

    try:
        # Un lancement à la fois par membre : le contrôle du délai et la création forment une seule opération.
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"live:{user_id}"})
        limits = (await entitlements.get(db, user_id))["limits"]
        if not limits["liveMatch"]:
            used = (await db.execute(select(func.count()).select_from(LiveSearch).where(LiveSearch.userId == user_id))).scalar_one()
            if used >= limits["liveMatchTrials"]:
                raise AppError(403, "PLAN_REQUIRED", "Essais gratuits épuisés : passez Premium pour continuer", {"trials": limits["liveMatchTrials"]})
        last = (await db.execute(select(LiveSearch.createdAt).where(LiveSearch.userId == user_id).order_by(LiveSearch.createdAt.desc()).limit(1))).scalar_one_or_none()
        if last:
            retry_at = last + LIVE.COOLDOWN_MINUTES * MIN
            if retry_at > utcnow():
                raise AppError(429, "LIVE_COOLDOWN", "Patientez avant de relancer une recherche", {"retryAt": iso(retry_at)})
        active = list((await db.execute(select(LiveSearch.id).where(LiveSearch.userId == user_id, LiveSearch.status == "ACTIVE"))).scalars())
        if active:
            await db.execute(update(LiveInvite).where(LiveInvite.searchId.in_(active), LiveInvite.status == "PENDING").values(status="EXPIRED"))
            await db.execute(update(LiveSearch).where(LiveSearch.id.in_(active)).values(status="CLOSED"))
        s = LiveSearch(userId=user_id, criteria=criteria, expiresAt=utcnow() + LIVE.SEARCH_HOURS * 60 * MIN)
        db.add(s)
        await db.flush()
        search_id = s.id
        await db.commit()
    except BaseException:
        await db.rollback()
        raise

    invited = await _invite_pool(db, search_id, user_id, me, criteria)
    return {**(await state(db, user_id)), "invited": invited}


async def _invite_pool(db: AsyncSession, search_id: str, seeker_id: str, seeker, criteria: dict) -> int:
    """Invite, parmi les personnes en ligne, celles qui répondent aux critères ET qui acceptent la personne qui cherche."""
    q = (
        select(Profile, Preference).join(User, User.id == Profile.userId).outerjoin(Preference, Preference.userId == Profile.userId)
        .where(
            Profile.userId != seeker_id, Profile.onboardedAt.is_not(None), Profile.visibility == "VISIBLE", Profile.incognito.is_(False),
            Profile.liveOptIn.is_(True), ~rhythm.paused_expr(utcnow()),
            exists().where(ProfilePhoto.profileId == Profile.id, ProfilePhoto.moderationStatus != "REJECTED"),
            User.status == "ACTIVE", User.emailVerifiedAt.is_not(None), _online_clause(), _no_relation(Profile.userId, seeker_id),
        )
        .order_by(User.lastActiveAt.desc()).limit(300)
    )
    pool = (await db.execute(q)).all()
    invited = 0
    for profile, pref in pool:
        if not (matches_criteria(criteria, profile) and accepts_seeker(pref, seeker)):
            continue
        if invited >= LIVE.MAX_INVITES:
            break
        if await _send_invite(db, search_id, seeker_id, profile.userId):
            invited += 1
    return invited


async def _send_invite(db: AsyncSession, search_id: str, seeker_id: str, invitee_id: str) -> bool:
    """Crée UNE invitation (jamais deux pour la même recherche) en respectant le plafond d'invitations en attente par personne."""
    pending = (await db.execute(select(func.count()).select_from(LiveInvite).where(
        LiveInvite.inviteeId == invitee_id, LiveInvite.status == "PENDING", LiveInvite.expiresAt > utcnow()))).scalar_one()
    if pending >= LIVE.MAX_PENDING_PER_INVITEE:
        return False
    r = await db.execute(
        insert(LiveInvite).values(id=new_id(), searchId=search_id, seekerId=seeker_id, inviteeId=invitee_id, createdAt=utcnow(),
                                  expiresAt=utcnow() + LIVE.INVITE_MINUTES * MIN)
        .on_conflict_do_nothing(index_elements=["searchId", "inviteeId"]).returning(LiveInvite.id)
    )
    created = r.first() is not None
    await db.commit()
    if not created:
        return False
    await notifications.create(db, invitee_id, "LIVE_INVITE", {})
    await realtime.emit_to_user(invitee_id, "live:invite", {})
    return True


async def on_presence(user_id: str) -> None:
    """Appelé quand quelqu'un se connecte : les recherches encore actives qui lui correspondent lui sont proposées.
    Les erreurs sont journalisées sans jamais faire échouer la connexion."""
    from app.db.session import session_maker

    try:
        async with session_maker()() as db:
            row = (await db.execute(
                select(Profile, Preference).join(User, User.id == Profile.userId).outerjoin(Preference, Preference.userId == Profile.userId)
                .where(Profile.userId == user_id, Profile.onboardedAt.is_not(None), Profile.visibility == "VISIBLE", Profile.incognito.is_(False),
                       Profile.liveOptIn.is_(True), User.status == "ACTIVE", User.emailVerifiedAt.is_not(None), ~rhythm.paused_expr(utcnow()),
                       exists().where(ProfilePhoto.profileId == Profile.id, ProfilePhoto.moderationStatus != "REJECTED"))
            )).first()
            if not row:
                return
            me, my_pref = row
            searches = (await db.execute(
                select(LiveSearch, Profile, func.count(LiveInvite.id)).join(Profile, Profile.userId == LiveSearch.userId)
                .outerjoin(LiveInvite, LiveInvite.searchId == LiveSearch.id)
                .where(LiveSearch.status == "ACTIVE", LiveSearch.expiresAt > utcnow(), LiveSearch.userId != user_id,
                       _no_relation(LiveSearch.userId, user_id))
                .group_by(LiveSearch.id, Profile.id).order_by(LiveSearch.createdAt.desc()).limit(200)
            )).all()
            for s, seeker_profile, n_invites in searches:
                if n_invites >= LIVE.MAX_INVITES:
                    continue
                criteria, _ = parse_criteria(s.criteria)
                if criteria is None or not matches_criteria(criteria, me) or not accepts_seeker(my_pref, seeker_profile):
                    continue
                await _send_invite(db, s.id, s.userId, user_id)
    except Exception as e:  # Silence assumé : un échec du menu Match ne doit jamais faire échouer la connexion.
        log.warning("onPresence: %s", e)


async def incoming(db: AsyncSession, user_id: str) -> dict:
    """Invitations que JE dois traiter (avec le profil de la personne qui cherche)."""
    await expire_stale(db)
    invites = (await db.execute(
        select(LiveInvite).join(LiveSearch, LiveSearch.id == LiveInvite.searchId).join(User, User.id == LiveInvite.seekerId)
        .where(LiveInvite.inviteeId == user_id, LiveInvite.status == "PENDING", LiveInvite.expiresAt > utcnow(), LiveSearch.status == "ACTIVE",
               User.status == "ACTIVE", ~exists().where(or_(and_(Block.blockerId == LiveInvite.seekerId, Block.blockedId == user_id),
                                                              and_(Block.blockerId == user_id, Block.blockedId == LiveInvite.seekerId))))
        .order_by(LiveInvite.createdAt.desc()).limit(20)
    )).scalars().all()
    cards = await _cards(db, [i.seekerId for i in invites])
    return {"items": [{**cards[i.seekerId], "inviteId": i.id, "expiresAt": iso(i.expiresAt)} for i in invites if i.seekerId in cards]}


async def respond(db: AsyncSession, user_id: str, invite_id: str, accept: bool) -> dict:
    """Accepter ou refuser. Une seule réponse possible (la réponse est « réclamée » atomiquement)."""
    row = (await db.execute(select(LiveInvite, LiveSearch).join(LiveSearch, LiveSearch.id == LiveInvite.searchId).where(LiveInvite.id == invite_id))).first()
    if not row or row[0].inviteeId != user_id:
        raise not_found("INVITE_NOT_FOUND")
    inv, search = row
    closed = conflict("INVITE_CLOSED", "Cette invitation n’est plus disponible")
    if inv.status.value != "PENDING" or inv.expiresAt < utcnow() or search.status.value != "ACTIVE":
        raise closed
    now = utcnow()
    # Accepté : reste choisissable jusqu'à 2 h (ou la fin de la recherche).
    expires_at = min(search.expiresAt, now + 120 * MIN) if accept else inv.expiresAt
    claimed = await db.execute(update(LiveInvite).where(LiveInvite.id == invite_id, LiveInvite.status == "PENDING")
                               .values(status="ACCEPTED" if accept else "DECLINED", respondedAt=now, expiresAt=expires_at))
    await db.commit()
    if claimed.rowcount == 0:
        raise closed
    if accept:
        await notifications.create(db, inv.seekerId, "LIVE_ACCEPTED", {})
        await realtime.emit_to_user(inv.seekerId, "live:accepted", {"inviteId": invite_id})
    return {"status": "ACCEPTED" if accept else "DECLINED"}


async def choose(db: AsyncSession, user_id: str, invite_id: str) -> dict:
    """Ouvre la conversation avec une personne qui a accepté : consomme les jetons DANS la même transaction.
    Si le solde est insuffisant ou si quoi que ce soit échoue, rien n'est débité et l'invitation reste « acceptée »."""
    inv = (await db.execute(select(LiveInvite).where(LiveInvite.id == invite_id))).scalar_one_or_none()
    if not inv or inv.seekerId != user_id:
        raise not_found("INVITE_NOT_FOUND")
    invitee_id, search_id = inv.inviteeId, inv.searchId
    a, b = order_pair(user_id, invitee_id)
    try:
        # Deux verrous, toujours dans cet ordre : la recherche (plafond de choix) puis la paire (un seul match).
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"live-search:{search_id}"})
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"{a}:{b}"})
        fresh = (await db.execute(select(LiveInvite.status, LiveInvite.expiresAt, LiveInvite.searchId).where(LiveInvite.id == invite_id)
                                  .execution_options(populate_existing=True))).first()
        gone = conflict("INVITE_CLOSED", "Cette personne n’est plus disponible")
        if not fresh or fresh.status.value != "ACCEPTED" or fresh.expiresAt < utcnow():
            raise gone
        chosen = (await db.execute(select(func.count()).select_from(LiveInvite).where(LiveInvite.searchId == fresh.searchId, LiveInvite.status == "CHOSEN"))).scalar_one()
        if chosen >= LIVE.MAX_CHOICES:
            raise conflict("CHOICES_EXHAUSTED", f"Vous pouvez parler à {LIVE.MAX_CHOICES} personnes au plus")
        blocked = (await db.execute(select(Block.id).where(or_(and_(Block.blockerId == user_id, Block.blockedId == invitee_id),
                                                               and_(Block.blockerId == invitee_id, Block.blockedId == user_id))).limit(1))).first()
        if blocked:
            raise gone
        existing = (await db.execute(select(Match).where(Match.userAId == a, Match.userBId == b))).scalar_one_or_none()
        # Une relation rompue n'est jamais rouverte par ce biais (la décision de l'autre personne prime).
        if existing and existing.status.value != "ACTIVE":
            raise conflict("MATCH_CLOSED", "Cette personne n’est plus joignable")
        claimed = await db.execute(update(LiveInvite).where(LiveInvite.id == invite_id, LiveInvite.status == "ACCEPTED").values(status="CHOSEN"))
        if claimed.rowcount == 0:
            raise gone
        if existing:
            match, created = existing, False  # déjà en conversation : aucun jeton consommé
        else:
            await credits.consume(db, user_id, "MATCH_TOKEN", LIVE.TOKENS_PER_CHAT, invite_id)
            match = Match(userAId=a, userBId=b)
            db.add(match)
            await db.flush()
            db.add(Conversation(matchId=match.id))
            created = True
        await db.flush()
        conv_id = (await db.execute(select(Conversation.id).where(Conversation.matchId == match.id))).scalar_one_or_none()
        if conv_id is None:
            conv = Conversation(matchId=match.id)
            db.add(conv)
            await db.flush()
            conv_id = conv.id
        match_id = match.id
        await db.commit()
    except AppError as e:
        await db.rollback()
        if e.code == "NO_CREDITS":
            raise forbidden("NO_TOKENS", "Jetons insuffisants : achetez un pack pour continuer") from None
        raise
    except BaseException:
        await db.rollback()
        raise

    if created:
        data = {"matchId": match_id, "conversationId": conv_id}
        await notifications.create(db, user_id, "MATCH", {**data, "userId": invitee_id})
        await notifications.create(db, invitee_id, "MATCH", {**data, "userId": user_id})
        await realtime.emit_to_user(user_id, "match:new", {**data, "userId": invitee_id})
        await realtime.emit_to_user(invitee_id, "match:new", {**data, "userId": user_id})
    return {"conversationId": conv_id, "matchId": match_id, "charged": LIVE.TOKENS_PER_CHAT if created else 0,
            "tokens": (await credits.balances(db, user_id))["MATCH_TOKEN"]}


async def cancel(db: AsyncSession, user_id: str) -> dict:
    """Arrête la recherche en cours (les invitations en attente tombent)."""
    ids = list((await db.execute(select(LiveSearch.id).where(LiveSearch.userId == user_id, LiveSearch.status == "ACTIVE"))).scalars())
    if ids:
        await db.execute(update(LiveInvite).where(LiveInvite.searchId.in_(ids), LiveInvite.status == "PENDING").values(status="EXPIRED"))
        await db.execute(update(LiveSearch).where(LiveSearch.id.in_(ids)).values(status="CLOSED"))
    await db.commit()
    return {"ok": True}


async def set_opt_in(db: AsyncSession, user_id: str, enabled: bool) -> dict:
    await db.execute(update(Profile).where(Profile.userId == user_id).values(liveOptIn=enabled))
    if not enabled:
        await db.execute(update(LiveInvite).where(LiveInvite.inviteeId == user_id, LiveInvite.status == "PENDING").values(status="EXPIRED"))
    await db.commit()
    return {"optIn": enabled}


async def react(db: AsyncSession, user_id: str, invite_id: str, action: str) -> dict:
    """« J'aime » ou « Passer » sur une personne qui a accepté : un like/pass normal (mêmes quotas, même réciprocité que Découvrir),
    sans jeton. Un like réciproque crée le match et sa conversation gratuitement. « Passer » retire la personne de la liste."""
    from app.core import swipesvc

    inv = (await db.execute(select(LiveInvite).where(LiveInvite.id == invite_id))).scalar_one_or_none()
    if not inv or inv.seekerId != user_id:
        raise not_found("INVITE_NOT_FOUND")
    if inv.status.value != "ACCEPTED" or inv.expiresAt < utcnow():
        raise conflict("INVITE_CLOSED", "Cette personne n’est plus disponible")
    result = await swipesvc.swipe(db, user_id, inv.inviteeId, action)
    if action == "PASS":
        # Statut « expirée » : l'invitation sort de la liste des personnes proposées (le statut DECLINED est réservé au refus de l'invité).
        await db.execute(update(LiveInvite).where(LiveInvite.id == invite_id, LiveInvite.status == "ACCEPTED").values(status="EXPIRED"))
        await db.commit()
    match = result.get("match")
    return {"action": action, "matched": bool(result["matched"]), "conversationId": match["conversationId"] if match else None}

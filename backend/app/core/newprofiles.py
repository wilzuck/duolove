"""E-mail « De nouveaux profils pour vous » : 3 à 6 personnes arrivées depuis le dernier envoi, qui correspondent aux critères du membre.

Règles :
- **Consentement** : seulement les membres qui ont accepté les offres (`marketingConsent`) ET gardé la case « nouveaux profils » (`emailNewProfiles`, activée
  par défaut). Le lien de désabonnement en un clic coupe les deux. E-mail non essentiel : le mode « e-mails essentiels uniquement » le note « ignoré ».
- **Délivrabilité** : jamais par ZeptoMail (type `new_profiles`, rangé avec les envois groupés), rien aux membres inactifs depuis plus de 60 jours, ni à ceux
  en pause, et aucun e-mail s'il n'y a pas assez de nouvelles personnes.
- **Désactivé par défaut** : rien ne part tant que l'administration ne l'a pas activé (interrupteur dans Administration › E-mails).
- **Fréquence** réglée dans l'administration (une semaine par défaut) : tous les jours, tous les X jours (2–30) ou tous les X mois (1–12). Envoi entre 17 h et
  23 h UTC, jamais le dimanche (jour du résumé hebdomadaire), réservé par un UPDATE conditionnel (jamais deux fois, même avec deux instances).
- **Sélection** : profils visibles dans Découvrir (photo approuvée, actifs, ni en pause, ni cachés, ni en mode discret), dans le genre, la tranche d'âge et le
  pays recherchés, qui acceptent aussi le genre et l'âge du membre ; jamais un profil bloqué (dans les deux sens), déjà liké ou passé. Vérifiés d'abord."""
from __future__ import annotations

import asyncio
import calendar
import datetime
import logging
import time

from sqlalchemy import exists, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core import mail, rhythm
from app.core.constants import age_from_birth_date
from app.core.discoverysvc import GENDERS_FOR, SEEKING_THAT_ACCEPT, years_ago
from app.core.errors import bad_request
from app.core.ids import utcnow
from app.core.profile_card import photo_url, thumb_key
from app.models.models import Block, NotificationPreference, Preference, Profile, ProfilePhoto, Swipe, SystemSetting, User

log = logging.getLogger("newprofiles")

KEY = "email.newProfiles"
UNITS = ("day", "days", "months")
DEFAULT = {"enabled": False, "unit": "days", "every": 7}
LIMITS = {"days": (2, 30), "months": (1, 12)}
MIN_PROFILES, MAX_PROFILES = 3, 6
INACTIVE_AFTER = datetime.timedelta(days=60)
SLACK = datetime.timedelta(hours=12)  # la fenêtre d'envoi dure 6 h : « tous les jours » doit repasser le lendemain même si l'envoi d'hier était plus tardif
DIGEST_WEEKDAY, SEND_FROM_HOUR, SEND_TO_HOUR = 6, 17, 23  # dimanche réservé au résumé hebdomadaire ; 17 h inclus à 23 h exclu (UTC)
BATCH = 100
TTL = 30.0
_cache: dict = {"at": 0.0, "value": None}


# ── Fréquence (réglage global de l'administration, ligne `email.newProfiles` de SystemSetting) ─────────────────────────────

def validate(value) -> dict:
    """Réglage normalisé {enabled, unit, every}, ou 400 INVALID_SETTING. `enabled` absent = désactivé."""
    if not isinstance(value, dict) or value.get("unit") not in UNITS:
        raise bad_request("INVALID_SETTING", "Fréquence : « day », « days » ou « months »", {"key": KEY})
    enabled = value.get("enabled", False)
    if not isinstance(enabled, bool):
        raise bad_request("INVALID_SETTING", "« enabled » : vrai ou faux", {"key": KEY})
    unit = value["unit"]
    if unit == "day":
        return {"enabled": enabled, "unit": "day", "every": 1}
    every = value.get("every")
    lo, hi = LIMITS[unit]
    if not isinstance(every, int) or isinstance(every, bool) or not lo <= every <= hi:
        raise bad_request("INVALID_SETTING", f"Fréquence : entier entre {lo} et {hi}", {"key": KEY, "min": lo, "max": hi})
    return {"enabled": enabled, "unit": unit, "every": every}


def invalidate() -> None:
    _cache["value"] = None


async def frequency(db: AsyncSession) -> dict:
    """Réglage relu en base au plus toutes les 30 s ; valeur absente ou corrompue : une semaine."""
    if _cache["value"] is not None and time.monotonic() - _cache["at"] < TTL:
        return dict(_cache["value"])
    row = (await db.execute(select(SystemSetting.value).where(SystemSetting.key == KEY))).scalar_one_or_none()
    try:
        v = validate(row) if row is not None else dict(DEFAULT)
    except Exception:  # noqa: BLE001
        v = dict(DEFAULT)
    _cache["value"], _cache["at"] = v, time.monotonic()
    return dict(v)


async def set_frequency(db: AsyncSession, value) -> dict:
    v = validate(value)
    row = await db.get(SystemSetting, KEY)
    if row:
        row.value = v
    else:
        db.add(SystemSetting(key=KEY, value=v))
    await db.commit()
    invalidate()
    return v


def _sub_months(d: datetime.datetime, n: int) -> datetime.datetime:
    y, m = divmod(d.year * 12 + d.month - 1 - n, 12)
    return d.replace(year=y, month=m + 1, day=min(d.day, calendar.monthrange(y, m + 1)[1]))


def period_start(freq: dict, now: datetime.datetime) -> datetime.datetime:
    """Début de la période en cours : `now` moins un jour, X jours ou X mois (mois calendaires)."""
    if freq["unit"] == "months":
        return _sub_months(now, freq["every"])
    return now - datetime.timedelta(days=1 if freq["unit"] == "day" else freq["every"])


def due_before(freq: dict, now: datetime.datetime) -> datetime.datetime:
    """Un membre est à nouveau éligible si sa dernière échéance est antérieure à cette date (marge d'une demi-journée)."""
    return period_start(freq, now) + SLACK


def in_send_window(now: datetime.datetime) -> bool:
    return now.weekday() != DIGEST_WEEKDAY and SEND_FROM_HOUR <= now.hour < SEND_TO_HOUR


# ── Sélection des profils ─────────────────────────────────────────────────────────────────────────────────────────────

def _v(x):
    return getattr(x, "value", x)


async def pick(db: AsyncSession, user_id: str, since: datetime.datetime, now: datetime.datetime | None = None, limit: int = MAX_PROFILES) -> list[dict]:
    """Nouveaux profils (arrivés dans Découvrir depuis `since`) pour ce membre : [{userId, name, age, city, photo, verified}]. Vérifiés d'abord, puis les plus récents."""
    now = now or utcnow()
    me = (await db.execute(select(Profile).where(Profile.userId == user_id))).scalar_one_or_none()
    pref = (await db.execute(select(Preference).where(Preference.userId == user_id))).scalar_one_or_none()
    if not me or not pref or me.onboardedAt is None:
        return []
    my_age = age_from_birth_date(me.birthDate, now)
    OP = aliased(Preference)
    approved = exists().where(ProfilePhoto.profileId == Profile.id, ProfilePhoto.moderationStatus == "APPROVED")
    conds = [
        Profile.onboardedAt.is_not(None), Profile.onboardedAt >= since,
        Profile.visibility == "VISIBLE", Profile.incognito.is_(False), ~rhythm.paused_expr(now), approved,
        Profile.gender.in_(GENDERS_FOR[_v(pref.seeking)]),
        Profile.birthDate <= years_ago(pref.ageMin, now), Profile.birthDate > years_ago(pref.ageMax + 1, now),
        User.id != user_id, User.status == "ACTIVE",
        ~exists().where(Swipe.giverId == user_id, Swipe.targetId == Profile.userId),  # déjà liké ou passé
        ~exists().where(Block.blockerId == Profile.userId, Block.blockedId == user_id),
        ~exists().where(Block.blockerId == user_id, Block.blockedId == Profile.userId),
        # Réciprocité, comme dans Découvrir : la personne accepte aussi le genre et l'âge du membre.
        OP.seeking.in_(SEEKING_THAT_ACCEPT[_v(me.gender)]), OP.ageMin <= my_age, OP.ageMax >= my_age,
    ]
    if pref.country:
        conds.append(Profile.country == pref.country)
    rows = (await db.execute(
        select(Profile).join(User, User.id == Profile.userId).join(OP, OP.userId == Profile.userId).where(*conds)
        .order_by(Profile.verified.desc(), Profile.onboardedAt.desc(), Profile.id).limit(limit))).scalars().all()
    if not rows:
        return []
    photos: dict[str, str] = {}
    for pid, key in (await db.execute(
            select(ProfilePhoto.profileId, ProfilePhoto.key).where(ProfilePhoto.profileId.in_([r.id for r in rows]), ProfilePhoto.moderationStatus == "APPROVED")
            .order_by(ProfilePhoto.profileId, ProfilePhoto.isPrimary.desc(), ProfilePhoto.position))).all():
        photos.setdefault(pid, key)
    return [{"userId": r.userId, "name": r.displayName, "age": age_from_birth_date(r.birthDate, now), "city": r.city,
             "photo": photo_url(thumb_key(photos[r.id])), "verified": bool(r.verified)} for r in rows if r.id in photos]


# ── Envoi ───────────────────────────────────────────────────────────────────────────────────────────────────────────

async def _claim(db: AsyncSession, now: datetime.datetime, freq: dict) -> list[tuple[str, str, datetime.datetime | None]]:
    """Réserve un lot de membres éligibles (UPDATE conditionnel sur la dernière échéance) : (id, e-mail, dernier envoi réel).
    Deux instances ne réservent jamais le même membre pour la même échéance."""
    cutoff = due_before(freq, now)
    due = or_(NotificationPreference.lastNewProfilesAt.is_(None), NotificationPreference.lastNewProfilesAt < cutoff)
    eligible = (select(NotificationPreference.userId).join(User, User.id == NotificationPreference.userId)
                .where(User.status == "ACTIVE", User.emailVerifiedAt.is_not(None), User.marketingConsent.is_(True), NotificationPreference.emailNewProfiles.is_(True),
                       User.lastActiveAt >= now - INACTIVE_AFTER, User.email.is_not(None), due)
                .order_by(NotificationPreference.userId).limit(BATCH))
    # La condition d'échéance est répétée sur la ligne mise à jour : si une autre instance l'a réservée entre-temps, PostgreSQL la relit et l'écarte.
    rows = (await db.execute(update(NotificationPreference).where(NotificationPreference.userId.in_(eligible), due).values(lastNewProfilesAt=now)
                             .returning(NotificationPreference.userId, NotificationPreference.newProfilesSentAt))).all()
    await db.commit()
    if not rows:
        return []
    sent_at = {r[0]: r[1] for r in rows}
    emails = (await db.execute(select(User.id, User.email).where(User.id.in_(list(sent_at))))).all()
    return [(uid, email, sent_at[uid]) for uid, email in emails]


def since_for(freq: dict, now: datetime.datetime, last_sent: datetime.datetime | None) -> datetime.datetime:
    """Point de départ des « nouveaux » profils : le dernier envoi réel (pour ne rien perdre d'une échéance restée sans e-mail),
    sinon le début de la période ; jamais plus de deux périodes en arrière (sinon les profils ne sont plus vraiment nouveaux)."""
    start = period_start(freq, now)
    floor = period_start(freq, start)
    return max(last_sent, floor) if last_sent else start


async def run_once(db: AsyncSession, now: datetime.datetime | None = None, freq: dict | None = None) -> int:
    """Traite un lot ; renvoie le nombre d'e-mails envoyés, ou -1 quand plus personne n'est à traiter."""
    now = now or utcnow()
    freq = freq or await frequency(db)
    if not freq.get("enabled"):
        return -1  # pas activé par l'administration
    batch = await _claim(db, now, freq)
    if not batch:
        return -1
    paused = set((await db.execute(select(Profile.userId).where(Profile.userId.in_([b[0] for b in batch]), rhythm.paused_expr(now)))).scalars().all())
    names = dict((await db.execute(select(Profile.userId, Profile.displayName).where(Profile.userId.in_([b[0] for b in batch])))).all())
    sent = 0
    for uid, email, last_sent in batch:
        if uid in paused:  # en pause : Découvrir ne lui propose rien, l'e-mail non plus
            continue
        try:
            people = await pick(db, uid, since_for(freq, now, last_sent), now)
            if len(people) < MIN_PROFILES:
                continue  # pas assez de nouvelles personnes : aucun e-mail
            if await mail.send_new_profiles(email, names.get(uid) or "", uid, people, freq):
                sent += 1
                await db.execute(update(NotificationPreference).where(NotificationPreference.userId == uid).values(newProfilesSentAt=now))
                await db.commit()
        except Exception:  # noqa: BLE001 — un échec ne doit pas empêcher les autres membres
            await db.rollback()
            log.exception("Nouveaux profils pour %s", uid)
    return sent


async def run_all(db: AsyncSession, now: datetime.datetime | None = None) -> int:
    now = now or utcnow()
    freq = await frequency(db)
    if not freq.get("enabled"):
        return 0  # pas activé par l'administration : rien ne part
    total = 0
    while True:
        n = await run_once(db, now, freq)
        if n < 0:
            return total
        total += n


async def sweep_loop(maker, every: float = 600.0) -> None:
    while True:
        try:
            if in_send_window(utcnow()):
                async with maker() as db:
                    n = await run_all(db)
                    if n:
                        log.info("e-mails « nouveaux profils » envoyés : %s", n)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("Balayage des nouveaux profils")
        await asyncio.sleep(every)

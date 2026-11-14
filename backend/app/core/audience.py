"""Mesure d'audience maison, légère et sans cookie, des pages PUBLIQUES (accueil, tarifs, blog, aide…), jamais de l'espace membre.

Par page vue, le site envoie un petit appel (chemin, et à l'arrivée seulement : site de provenance ou `utm_source`). On ne garde que des
TOTAUX PAR JOUR (`AudienceDaily`) : pages vues et visiteurs uniques, par page, source, pays (Cloudflare), type d'appareil et langue.
Visiteur unique : empreinte SHA-256 de (sel du jour, adresse IP, navigateur). L'adresse IP n'est jamais enregistrée ; le sel change
chaque jour et l'ancien est jeté ; les empreintes (`AudienceSeen`) sont effacées le lendemain. Aucun suivi d'un jour à l'autre, ni entre
sites : c'est le cadre de la mesure d'audience exemptée de consentement (CNIL). Les robots connus sont ignorés.
"""
from __future__ import annotations

import asyncio
import datetime
import hashlib
import re
import secrets
from urllib.parse import urlsplit

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AudienceDaily, AudienceSeen, SystemSetting

SALT_KEY = "audience.salt"
KEEP_DAYS = 400
TOP = 20

# Pages mesurées : les mêmes que la mesure Google (`isAnalyticsPath` côté site), plus la connexion.
_PUBLIC = re.compile(r"^/(how-it-works|pricing|about|blog|contact|help|install|legal|newsletter|share|register|login)(/|$)")
_BOT = re.compile(r"bot|crawl|spider|slurp|scrape|headless|lighthouse|pagespeed|preview|facebookexternalhit|meta-externalagent|whatsapp|telegram|"
                  r"curl|wget|python|httpx|axios|node-fetch|go-http|java/|okhttp|monitor|uptime|pingdom|checkly", re.I)
_ID = re.compile(r"^[0-9a-f]{20,}$|^\d+$")
_UTM = re.compile(r"[^a-z0-9._-]")
_SOURCES = {"facebook.com": "facebook", "fb.com": "facebook", "fb.me": "facebook", "messenger.com": "facebook", "instagram.com": "instagram",
            "t.co": "x", "x.com": "x", "twitter.com": "x", "linkedin.com": "linkedin", "lnkd.in": "linkedin", "tiktok.com": "tiktok",
            "youtube.com": "youtube", "youtu.be": "youtube", "bing.com": "bing", "duckduckgo.com": "duckduckgo", "wa.me": "whatsapp", "whatsapp.com": "whatsapp"}

_salt: dict = {"day": None, "salt": None}
_purged: dict = {"day": None}
_lock = asyncio.Lock()


def is_bot(ua: str | None) -> bool:
    return not ua or len(ua) < 10 or bool(_BOT.search(ua))


def normalize_path(raw: str | None) -> tuple[str, str] | None:
    """(chemin sans langue, langue) d'une page publique mesurée ; None pour l'espace membre, l'administration ou un chemin invalide.
    Les segments qui ressemblent à un identifiant deviennent `:id` (une page de partage ne doit pas désigner une personne)."""
    if not raw or not raw.startswith("/") or raw.startswith("//"):
        return None
    path = urlsplit(raw[:300]).path or "/"
    lang = "fr"
    if path == "/en" or path.startswith("/en/"):
        lang, path = "en", path[3:] or "/"
    segs = [s.lower() for s in path.split("/") if s]
    if segs[:1] == ["share"] and len(segs) > 1:
        segs = ["share", ":id"]  # lien de partage d'un profil : jamais le jeton
    path = "/" + "/".join(":id" if _ID.match(seg) else seg for seg in segs)
    if path != "/" and not _PUBLIC.match(path):
        return None
    return path[:160], lang


def source_of(ref: str | None, utm: str | None, own_host: str) -> str:
    """Provenance d'une arrivée : `utm_source` s'il est donné (liens des campagnes), sinon le site d'où l'on vient, sinon « direct »."""
    if utm:
        u = _UTM.sub("", utm.strip().lower())[:40]
        if u:
            return u
    host = (urlsplit(ref).hostname or "") if ref and ref.startswith(("http://", "https://")) else ""
    host = re.sub(r"^(www|m|l|lm|mobile|mbasic|web)\.", "", host.lower())
    if not host or host == own_host or host.endswith("." + own_host):
        return "direct"
    if host in _SOURCES:
        return _SOURCES[host]
    if re.match(r"^(.+\.)?google\.[a-z.]+$", host):
        return "google"
    return host[:80]


def device_of(ua: str) -> str:
    if re.search(r"ipad|tablet|kindle|silk", ua, re.I):
        return "tablet"
    if re.search(r"mobi|android|iphone|ipod", ua, re.I):
        return "mobile"
    return "desktop"


def _h(*parts: str) -> str:
    return hashlib.sha256("\x1f".join(parts).encode()).hexdigest()[:32]


async def _daily_salt(db: AsyncSession, day: datetime.date) -> str:
    """Sel du jour, partagé par les redémarrages du même jour (gardé en base), remplacé et donc jeté dès le jour suivant."""
    if _salt["day"] == day:
        return _salt["salt"]
    async with _lock:
        if _salt["day"] == day:
            return _salt["salt"]
        row = (await db.execute(select(SystemSetting).where(SystemSetting.key == SALT_KEY))).scalar_one_or_none()
        v = row.value if row and isinstance(row.value, dict) else {}
        if v.get("day") == day.isoformat() and isinstance(v.get("salt"), str):
            salt = v["salt"]
        else:
            salt = secrets.token_hex(32)
            if row:
                row.value = {"day": day.isoformat(), "salt": salt}
            else:
                db.add(SystemSetting(key=SALT_KEY, value={"day": day.isoformat(), "salt": salt}))
            await db.flush()
        _salt.update(day=day, salt=salt)
        return salt


async def _purge(db: AsyncSession, day: datetime.date) -> None:
    if _purged["day"] == day:
        return
    await db.execute(delete(AudienceSeen).where(AudienceSeen.day < day))
    await db.execute(delete(AudienceDaily).where(AudienceDaily.day < day - datetime.timedelta(days=KEEP_DAYS)))
    _purged["day"] = day


async def record(db: AsyncSession, *, path: str, lang: str, source: str | None, ua: str, ip: str, country: str | None, now: datetime.datetime) -> None:
    """Compte une page vue. `source` seulement à l'arrivée sur le site (première page de la visite)."""
    day = now.date()
    await _purge(db, day)
    visitor = _h(await _daily_salt(db, day), ip, ua)
    dims = [("site", "*"), ("page", path), ("country", country or "??"), ("device", device_of(ua)), ("lang", lang)]
    if source:
        dims.append(("source", source))
    hashes = {_h(visitor, d, k): (d, k) for d, k in dims}
    new = set((await db.execute(insert(AudienceSeen).values([{"day": day, "hash": h} for h in hashes]).on_conflict_do_nothing()
                                .returning(AudienceSeen.hash))).scalars())
    stmt = insert(AudienceDaily).values([{"day": day, "dim": d, "key": k, "views": 1, "visitors": 1 if h in new else 0} for h, (d, k) in hashes.items()])
    await db.execute(stmt.on_conflict_do_update(index_elements=["day", "dim", "key"],
                                                set_={"views": AudienceDaily.views + stmt.excluded.views, "visitors": AudienceDaily.visitors + stmt.excluded.visitors}))
    await db.commit()


async def report(db: AsyncSession, days: int, start: datetime.date) -> dict:
    """Tableau de bord : séries par jour (visiteurs, pages vues), totaux comparés à la période précédente, classements."""
    end = start + datetime.timedelta(days=days)
    prev = start - datetime.timedelta(days=days)
    rows = (await db.execute(select(AudienceDaily.day, AudienceDaily.views, AudienceDaily.visitors)
                             .where(AudienceDaily.dim == "site", AudienceDaily.day >= start, AudienceDaily.day < end))).all()
    by_day = {r.day: r for r in rows}
    span = [start + datetime.timedelta(days=i) for i in range(days)]
    series = {"visitors": [{"day": d.isoformat(), "value": int(by_day[d].visitors) if d in by_day else 0} for d in span],
              "views": [{"day": d.isoformat(), "value": int(by_day[d].views) if d in by_day else 0} for d in span]}
    before = (await db.execute(select(func.coalesce(func.sum(AudienceDaily.views), 0), func.coalesce(func.sum(AudienceDaily.visitors), 0))
                               .where(AudienceDaily.dim == "site", AudienceDaily.day >= prev, AudienceDaily.day < start))).one()
    views, visitors = sum(p["value"] for p in series["views"]), sum(p["value"] for p in series["visitors"])

    async def top(dim: str, limit: int = TOP) -> list[dict]:
        q = (select(AudienceDaily.key, func.sum(AudienceDaily.views).label("v"), func.sum(AudienceDaily.visitors).label("u"))
             .where(AudienceDaily.dim == dim, AudienceDaily.day >= start, AudienceDaily.day < end)
             .group_by(AudienceDaily.key).order_by(func.sum(AudienceDaily.views).desc(), AudienceDaily.key).limit(limit))
        return [{"key": k, "views": int(v), "visitors": int(u)} for k, v, u in (await db.execute(q)).all()]

    return {"days": days, "from": start.isoformat(), "to": (end - datetime.timedelta(days=1)).isoformat(), "series": series,
            "flows": {"views": {"current": views, "previous": int(before[0])}, "visitors": {"current": visitors, "previous": int(before[1])}},
            "pages": await top("page"), "sources": await top("source"), "countries": await top("country"),
            "devices": await top("device", 5), "langs": await top("lang", 5)}

"""Réseaux sociaux du pied de page : configurés depuis l'administration (table SystemSetting), une adresse par langue et par réseau."""
from __future__ import annotations

import re
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request
from app.models.models import SystemSetting

KEY = "social_links"
NETWORKS = ("facebook", "instagram", "tiktok", "whatsapp", "youtube", "x")
LOCALES = ("fr", "en")
# Domaines acceptés par réseau : une adresse venant d'ailleurs (ou un schéma javascript:) n'est jamais enregistrée.
HOSTS = {"facebook": ("facebook.com", "fb.com", "fb.me"), "instagram": ("instagram.com",), "tiktok": ("tiktok.com",),
         "whatsapp": ("whatsapp.com", "wa.me"), "youtube": ("youtube.com", "youtu.be"), "x": ("x.com", "twitter.com")}
MAX_URL = 300


def _empty() -> dict:
    return {n: {"enabled": False, "urls": {lc: "" for lc in LOCALES}} for n in NETWORKS}


def clean_url(network: str, raw: str) -> str:
    """Adresse https d'un domaine du réseau (www. et sous-domaines acceptés), ou chaîne vide."""
    url = (raw or "").strip()
    if not url:
        return ""
    if len(url) > MAX_URL:
        raise bad_request("SOCIAL_URL_INVALID", "Adresse trop longue")
    if not re.match(r"^[a-z][a-z0-9+.-]*:", url, re.I):
        url = "https://" + url.lstrip("/")  # « facebook.com/crushduo » ou « www.facebook.com/crushduo » : https ajouté
    elif url.lower().startswith("http://"):
        url = "https://" + url[7:]
    p = urlparse(url)
    host = (p.hostname or "").lower()
    if p.scheme != "https" or not any(host == h or host.endswith("." + h) for h in HOSTS[network]):
        raise bad_request("SOCIAL_URL_INVALID", f"Adresse https {HOSTS[network][0]} attendue")
    return url


async def get(db: AsyncSession) -> dict:
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == KEY))).scalar_one_or_none()
    out = _empty()
    stored = row.value if row and isinstance(row.value, dict) else {}
    for n in NETWORKS:
        s = stored.get(n) if isinstance(stored.get(n), dict) else {}
        urls = s.get("urls") if isinstance(s.get("urls"), dict) else {}
        out[n] = {"enabled": bool(s.get("enabled")), "urls": {lc: str(urls.get(lc) or "") for lc in LOCALES}}
    return out


async def save(db: AsyncSession, data: dict) -> dict:
    value = {}
    for n in NETWORKS:
        d = data.get(n) or {}
        urls = {lc: clean_url(n, (d.get("urls") or {}).get(lc, "")) for lc in LOCALES}
        enabled = bool(d.get("enabled"))
        if enabled and not any(urls.values()):
            raise bad_request("SOCIAL_URL_REQUIRED", "Renseignez au moins une adresse pour afficher ce réseau")
        value[n] = {"enabled": enabled, "urls": urls}
    row = (await db.execute(select(SystemSetting).where(SystemSetting.key == KEY))).scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(SystemSetting(key=KEY, value=value))
    await db.commit()
    return await get(db)


def public_view(cfg: dict) -> dict:
    """Ce que voit le site : seulement les réseaux affichés, avec une adresse par langue (la langue sans adresse reprend celle de l'autre)."""
    out = {}
    for n in NETWORKS:
        c = cfg[n]
        if not c["enabled"]:
            continue
        fallback = next((u for u in c["urls"].values() if u), "")
        if not fallback:
            continue
        out[n] = {lc: c["urls"][lc] or fallback for lc in LOCALES}
    return out

"""Pays de connexion : code ISO fourni par Cloudflare (en-tête CF-IPCountry). On ne conserve JAMAIS l'adresse IP, seulement ce code, pour signaler à la modération
un écart avec le pays déclaré. Aucun blocage : un membre en voyage ou de la diaspora reste un membre honnête."""
from __future__ import annotations

from collections.abc import Mapping

UNKNOWN = {"", "XX", "T1"}  # XX : inconnu ; T1 : réseau Tor


def country_from_headers(headers: Mapping[str, str]) -> str | None:
    v = (headers.get("cf-ipcountry") or "").strip().upper()
    return v if len(v) == 2 and v.isalpha() and v not in UNKNOWN else None

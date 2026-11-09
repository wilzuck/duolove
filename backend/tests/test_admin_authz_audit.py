"""Audit des droits : TOUTES les routes d'administration refusent l'anonyme (401) et un simple membre (403), et aucune ne plante (5xx) pour un administrateur."""
import re

import httpx

from tests.helpers import new_agent
from tests.support_c import admin, member, set_role

SKIP = {"/api/admin/users/{user_id}/delete"}  # aucune : réservé si une route destructrice doit être exclue


def admin_routes(app):
    spec = app.openapi()
    for path, ops in spec["paths"].items():
        if "/admin" not in path or path in SKIP:
            continue
        for method in ops:
            if method.lower() in ("get", "post", "put", "patch", "delete"):
                yield method.upper(), path


def fill(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "inconnu", path)


async def test_toutes_les_routes_admin_exigent_un_role(app, db):
    u, mod, ad = await member(app, db), await member(app, db), await admin(app, db)
    await set_role(mod.id, "MODERATOR")
    anon: httpx.AsyncClient = new_agent(app)
    open_routes, user_ok, server_errors = [], [], []
    for method, path in admin_routes(app):
        url = fill(path)
        if (await anon.request(method, url, json={})).status_code not in (401, 403):
            open_routes.append((method, path))
        if (await u.agent.request(method, url, json={})).status_code != 403:
            user_ok.append((method, path))
    assert not open_routes, f"routes admin ouvertes à un anonyme : {open_routes}"
    assert not user_ok, f"routes admin ouvertes à un simple membre : {user_ok}"
    for method, path in admin_routes(app):
        if method in ("DELETE",) or path.endswith(("/send", "/restore", "/purge")):
            continue  # destructif ou envoi réel : couvert par les tests dédiés
        r = await ad.agent.request(method, fill(path), json={})
        if r.status_code >= 500:
            server_errors.append((method, path, r.status_code))
    assert not server_errors, f"routes admin qui plantent : {server_errors}"

"""Mesure d'audience maison : pages publiques seulement, totaux par jour, visiteurs uniques par empreinte du jour, robots ignorés, tableau de bord."""
import datetime

import pytest
from sqlalchemy import delete, select

from app.core import audience as au
from app.db.session import session_maker
from app.models.models import AudienceDaily, AudienceSeen, SystemSetting
from tests.helpers import new_agent
from tests.support_c import admin, member

UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36"
UA_PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"


@pytest.fixture(autouse=True)
async def _wipe(app):
    async def wipe():
        async with session_maker()() as s:
            await s.execute(delete(AudienceDaily))
            await s.execute(delete(AudienceSeen))
            await s.execute(delete(SystemSetting).where(SystemSetting.key == au.SALT_KEY))
            await s.commit()
        au._salt.update(day=None, salt=None)
        au._purged.update(day=None)

    await wipe()
    yield
    await wipe()


@pytest.mark.parametrize("raw,expected", [
    ("/", ("/", "fr")), ("/en", ("/", "en")), ("/en/pricing?utm_source=fb#tiers", ("/pricing", "en")),
    ("/blog/Lire-un-profil-entre-les-lignes", ("/blog/lire-un-profil-entre-les-lignes", "fr")),
    ("/share/abcDEF123", ("/share/:id", "fr")), ("/help/0f3a9c2b7d1e4f5a6b7c", ("/help/:id", "fr")),
    ("/discover", None), ("/en/messages/123", None), ("/admin/stats", None), ("//evil.com/x", None), ("pricing", None), ("", None),
])
def test_seules_les_pages_publiques_sont_mesurees(raw, expected):
    assert au.normalize_path(raw) == expected


def test_provenance():
    own = "crushduo.com"
    assert au.source_of("https://l.facebook.com/l.php?u=x", None, own) == "facebook"
    assert au.source_of("https://www.google.fr/", None, own) == "google"
    assert au.source_of("https://crushduo.com/pricing", None, own) == "direct"
    assert au.source_of(None, None, own) == "direct"
    assert au.source_of("https://blog.example.org/a", None, own) == "blog.example.org"
    assert au.source_of("https://l.facebook.com/", "FB_Post-1 <script>", own) == "fb_post-1script"  # utm_source prioritaire, nettoyé
    assert au.source_of("javascript:alert(1)", None, own) == "direct"


def test_robots_et_appareils():
    assert au.is_bot("facebookexternalhit/1.1") and au.is_bot("Googlebot/2.1") and au.is_bot("") and au.is_bot("curl/8.4")
    assert not au.is_bot(UA)
    assert au.device_of(UA) == "mobile" and au.device_of(UA_PC) == "desktop" and au.device_of("Mozilla/5.0 (iPad; CPU OS 17_0)") == "tablet"


async def _rows():
    async with session_maker()() as s:
        return {(r.dim, r.key): (r.views, r.visitors) for r in (await s.execute(select(AudienceDaily))).scalars()}


async def test_pages_vues_et_visiteurs_uniques(app):
    anon = new_agent(app)
    h = {"user-agent": UA, "cf-ipcountry": "BJ"}
    for body in ({"path": "/", "landing": True, "ref": "https://m.facebook.com/"}, {"path": "/pricing"}, {"path": "/pricing"}):
        assert (await anon.post("/api/audience/hit", json=body, headers=h)).status_code == 204
    # Un deuxième visiteur (autre navigateur), arrivé directement en anglais.
    assert (await anon.post("/api/audience/hit", json={"path": "/en/pricing", "landing": True}, headers={"user-agent": UA_PC})).status_code == 204
    # Ignorés : robot, espace membre, préchargement.
    await anon.post("/api/audience/hit", json={"path": "/", "landing": True}, headers={"user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)"})
    await anon.post("/api/audience/hit", json={"path": "/discover"}, headers=h)
    await anon.post("/api/audience/hit", json={"path": "/blog"}, headers={**h, "sec-purpose": "prefetch"})
    r = await _rows()
    assert r[("site", "*")] == (4, 2)
    assert r[("page", "/pricing")] == (3, 2) and r[("page", "/")] == (1, 1)
    assert r[("source", "facebook")] == (1, 1) and r[("source", "direct")] == (1, 1)
    assert r[("country", "BJ")] == (3, 1) and r[("country", "??")] == (1, 1)
    assert r[("device", "mobile")] == (3, 1) and r[("device", "desktop")] == (1, 1)
    assert r[("lang", "en")] == (1, 1) and r[("lang", "fr")] == (3, 1)
    assert not any(k == "/discover" for _, k in r)


async def test_aucune_adresse_ip_ni_navigateur_enregistres(app, db):
    await new_agent(app).post("/api/audience/hit", json={"path": "/", "landing": True}, headers={"user-agent": UA})
    seen = (await db.execute(select(AudienceSeen.hash))).scalars().all()
    assert seen and all(len(x) == 32 and "127.0.0.1" not in x for x in seen)
    keys = {k for (_, k) in await _rows()}
    assert not any("Mozilla" in k or "127.0.0.1" in k for k in keys)


async def test_le_sel_change_chaque_jour_et_les_empreintes_sont_effacees(db):
    d1 = datetime.datetime(2026, 11, 14, 10)
    kw = {"path": "/", "lang": "fr", "source": None, "ua": UA, "ip": "203.0.113.9", "country": "BJ"}
    await au.record(db, now=d1, **kw)
    await au.record(db, now=d1 + datetime.timedelta(hours=1), **kw)
    salt1 = au._salt["salt"]
    await au.record(db, now=d1 + datetime.timedelta(days=1), **kw)
    assert au._salt["salt"] != salt1
    days = {r.day: r.visitors for r in (await db.execute(select(AudienceDaily).where(AudienceDaily.dim == "site"))).scalars()}
    assert days == {d1.date(): 1, d1.date() + datetime.timedelta(days=1): 1}  # même personne : 1 visiteur chaque jour
    assert {r for r in (await db.execute(select(AudienceSeen.day))).scalars()} == {d1.date() + datetime.timedelta(days=1)}  # la veille est effacée


async def test_tableau_de_bord_reserve_a_l_administration(app, db):
    h = {"user-agent": UA, "cf-ipcountry": "CI"}
    anon = new_agent(app)
    await anon.post("/api/audience/hit", json={"path": "/", "landing": True, "utm": "fb_post1"}, headers=h)
    await anon.post("/api/audience/hit", json={"path": "/blog"}, headers=h)
    m = await member(app, db)
    assert (await m.agent.get("/api/admin/audience")).status_code == 403
    a = await admin(app, db)
    r = await a.agent.get("/api/admin/audience?days=7")
    assert r.status_code == 200
    d = r.json()
    assert d["days"] == 7 and len(d["series"]["views"]) == 7 and d["series"]["views"][-1]["value"] == 2
    assert d["flows"]["visitors"] == {"current": 1, "previous": 0}
    assert d["pages"] == [{"key": "/", "views": 1, "visitors": 1}, {"key": "/blog", "views": 1, "visitors": 1}]
    assert d["sources"] == [{"key": "fb_post1", "views": 1, "visitors": 1}] and d["countries"][0]["key"] == "CI"

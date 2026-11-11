"""Réseaux sociaux du pied de page : réglés par l'administration, adresse par langue, validation du domaine."""
from sqlalchemy import delete

from app.core import socials
from app.models.models import SystemSetting
from tests.support_c import admin


async def _reset(db):
    await db.execute(delete(SystemSetting).where(SystemSetting.key == socials.KEY))
    await db.commit()


async def test_par_defaut_rien_n_est_public(app, http, db):
    await _reset(db)
    assert (await http.get("/api/social")).json() == {}


async def test_admin_configure_adresse_par_langue_et_affichage(app, http, db):
    await _reset(db)
    a = await admin(app, db)
    body = {"facebook": {"enabled": True, "urls": {"fr": "https://www.facebook.com/crushduo", "en": "https://www.facebook.com/crushduo.en"}},
            "instagram": {"enabled": True, "urls": {"fr": "https://instagram.com/crushduo", "en": ""}},
            "tiktok": {"enabled": False, "urls": {"fr": "https://www.tiktok.com/@crushduo", "en": ""}}}
    r = await a.agent.put("/api/admin/social", json=body)
    assert r.status_code == 200, r.text
    pub = (await http.get("/api/social")).json()
    assert pub["facebook"] == {"fr": "https://www.facebook.com/crushduo", "en": "https://www.facebook.com/crushduo.en"}
    assert pub["instagram"] == {"fr": "https://instagram.com/crushduo", "en": "https://instagram.com/crushduo"}  # EN reprend FR
    assert "tiktok" not in pub  # masqué, mais l'adresse reste enregistrée
    assert (await a.agent.get("/api/admin/social")).json()["tiktok"]["urls"]["fr"].endswith("@crushduo")
    await _reset(db)


async def test_adresses_refusees(app, http, db):
    await _reset(db)
    a = await admin(app, db)
    ok = {"enabled": False, "urls": {}}
    for bad in ("javascript:alert(1)", "http://facebook.com/x", "https://evil.com/facebook.com", "https://facebook.com.evil.com/x"):
        r = await a.agent.put("/api/admin/social", json={"facebook": {"enabled": False, "urls": {"fr": bad}}, "instagram": ok, "tiktok": ok})
        assert r.status_code == 400 and r.json()["error"]["code"] == "SOCIAL_URL_INVALID", bad
    r = await a.agent.put("/api/admin/social", json={"facebook": {"enabled": True, "urls": {}}, "instagram": ok, "tiktok": ok})
    assert r.status_code == 400 and r.json()["error"]["code"] == "SOCIAL_URL_REQUIRED"
    assert (await http.put("/api/admin/social", json={})).status_code in (401, 403)
    await _reset(db)

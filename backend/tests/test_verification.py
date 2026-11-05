"""Vérification de profil par selfie : envoi, file de modération, selfie privé, décision, minimisation des données (le selfie est supprimé)."""
from sqlalchemy import select

from app.core import storage
from app.db.session import session_maker
from app.models.models import Notification, Profile, VerificationRequest
from tests.helpers import jpeg, new_agent
from tests.support_c import admin, member, set_role


def code(r):
    return (r.json().get("error") or {}).get("code")


async def test_selfie_verification_lifecycle(app, db):
    m = await member(app, db)
    mod = await member(app, db)
    await set_role(mod.id, "MODERATOR")
    mod = type(mod)(mod.id, mod.email, mod.agent)
    assert (await new_agent(app).post("/api/profiles/me/verification", files={"file": ("s.jpg", jpeg(), "image/jpeg")})).status_code == 401
    assert (await m.agent.post("/api/profiles/me/verification", files={"file": ("s.jpg", b"pas une image", "image/jpeg")})).status_code == 400
    r = await m.agent.post("/api/profiles/me/verification", files={"file": ("s.jpg", jpeg(), "image/jpeg")})
    assert r.status_code == 201
    async with session_maker()() as s:
        v = (await s.execute(select(VerificationRequest).where(VerificationRequest.userId == m.id))).scalar_one()
        vid, key = v.id, v.selfieKey
        assert not key.startswith("photos/")  # jamais dans l'espace public des photos de profil
    # le selfie n'est servi qu'au personnel ; ni le membre ni un autre membre ne le voient
    other = await member(app, db)
    assert (await m.agent.get(f"/api/admin/verifications/{vid}/selfie")).status_code == 403
    assert (await other.agent.get(f"/api/admin/verifications/{vid}/selfie")).status_code == 403
    assert (await mod.agent.get(f"/api/admin/verifications/{vid}/selfie")).status_code == 200
    queue = (await mod.agent.get("/api/admin/verifications")).json()
    assert any(x["id"] == vid for x in queue)
    assert (await m.agent.get("/api/admin/verifications")).status_code == 403
    # décision : le profil devient « vérifié », le membre est prévenu, le selfie est supprimé
    assert (await mod.agent.post(f"/api/admin/verifications/{vid}/review", json={"approve": True})).json() == {"ok": True}
    async with session_maker()() as s:
        assert (await s.execute(select(Profile.verified).where(Profile.userId == m.id))).scalar_one() is True
        assert (await s.execute(select(Notification.id).where(Notification.userId == m.id, Notification.type == "PROFILE_VERIFIED"))).first()
    assert await storage.get(key) in (None, b"")  # donnée minimisée
    assert code(await mod.agent.post(f"/api/admin/verifications/{vid}/review", json={"approve": True})) == "VERIFICATION_NOT_FOUND"  # une décision ne se rejoue pas


async def test_rejected_verification_keeps_profile_unverified(app, db):
    m = await member(app, db)
    adm = await admin(app, db)
    await m.agent.post("/api/profiles/me/verification", files={"file": ("s.jpg", jpeg(), "image/jpeg")})
    async with session_maker()() as s:
        vid = (await s.execute(select(VerificationRequest.id).where(VerificationRequest.userId == m.id))).scalar_one()
    assert (await adm.agent.post(f"/api/admin/verifications/{vid}/review", json={"approve": False, "note": "Photo floue"})).status_code == 200
    async with session_maker()() as s:
        assert (await s.execute(select(Profile.verified).where(Profile.userId == m.id))).scalar_one() is False

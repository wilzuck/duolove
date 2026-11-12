"""Actions groupées sur les comptes : suspension, bannissement, levée, suppression ; garde-fous (personnel, soi-même, rôle) ; chaque compte traité à part."""
from sqlalchemy import select

from app.db.session import session_maker
from app.models.models import User
from tests.support_c import admin, member, set_role


async def status_of(uid: str) -> str:
    async with session_maker()() as s:
        st = (await s.execute(select(User.status).where(User.id == uid))).scalar_one()
    return getattr(st, "value", st)


async def bulk(a, ids, action, **kw):
    return await a.agent.post("/api/admin/users/bulk", json={"ids": ids, "action": action, "reason": "Test groupé", **kw})


async def test_suspension_puis_levee_de_plusieurs_comptes(app, db):
    ad, u1, u2 = await admin(app, db), await member(app, db), await member(app, db)
    r = await bulk(ad, [u1.id, u2.id], "suspend", days=3)
    assert r.status_code == 200 and sorted(r.json()["done"]) == sorted([u1.id, u2.id]) and r.json()["failed"] == []
    assert await status_of(u1.id) == "SUSPENDED" and await status_of(u2.id) == "SUSPENDED"
    assert (await bulk(ad, [u1.id, u2.id], "unsuspend")).json()["failed"] == []
    assert await status_of(u1.id) == "ACTIVE"


async def test_bannissement_et_garde_fous_personnel_et_soi_meme(app, db):
    ad, other_admin, u = await admin(app, db), await admin(app, db), await member(app, db)
    r = (await bulk(ad, [u.id, other_admin.id, ad.id, "inconnu"], "ban")).json()
    assert r["done"] == [u.id]
    codes = {f["id"]: f["code"] for f in r["failed"]}
    assert codes[other_admin.id] == "CANNOT_SANCTION_STAFF" and codes[ad.id] == "CANNOT_SANCTION_STAFF" and codes["inconnu"] == "USER_NOT_FOUND"
    assert await status_of(u.id) == "BANNED" and await status_of(other_admin.id) == "ACTIVE"


async def test_suppression_reservee_aux_administrateurs_et_irreversible(app, db):
    mod, ad, u1, u2 = await member(app, db), await admin(app, db), await member(app, db), await member(app, db)
    await set_role(mod.id, "MODERATOR")
    assert (await bulk(mod, [u1.id], "delete")).status_code == 403
    assert (await bulk(mod, [u1.id], "suspend", days=1)).status_code == 200  # un modérateur peut suspendre
    r = (await bulk(ad, [u1.id, u2.id], "delete")).json()
    assert sorted(r["done"]) == sorted([u1.id, u2.id])
    assert await status_of(u1.id) == "DELETED"
    again = (await bulk(ad, [u1.id], "delete")).json()
    assert again["done"] == [] and again["failed"][0]["code"] == "USER_NOT_FOUND"  # déjà supprimé : rien à refaire


async def test_validation_et_droits(app, db):
    ad, u = await admin(app, db), await member(app, db)
    assert (await u.agent.post("/api/admin/users/bulk", json={"ids": [ad.id], "action": "ban", "reason": "abus"})).status_code == 403
    assert (await bulk(ad, [], "ban")).status_code == 400
    assert (await ad.agent.post("/api/admin/users/bulk", json={"ids": [u.id], "action": "ban", "reason": "x"})).status_code == 400  # motif trop court

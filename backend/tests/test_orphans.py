"""Images orphelines : détection (base vs stockage), âge minimal, suppression revérifiée, couverture remplacée supprimée sans casser un partage."""
import os
import secrets
import time

from app.core import storage
from tests.helpers import login, new_agent, seed_member, uid
from tests.test_blog import _admin, _cover, _payload


async def _plant(prefix: str, age_hours: float) -> str:
    key = f"{prefix}{secrets.token_hex(16)}.webp"
    await storage.put(key, b"RIFF....WEBPx")
    f = storage._resolve(key)
    t = time.time() - age_hours * 3600
    os.utime(f, (t, t))
    return key


async def test_replaced_cover_shared_by_another_post_is_kept(app, db):
    admin = await _admin(app, db)
    a, b = await _cover(admin), await _cover(admin)
    p1 = (await admin.post("/api/admin/blog", json=_payload(f"sh1-{uid()}", coverKey=a["key"]))).json()["id"]
    await admin.post("/api/admin/blog", json=_payload(f"sh2-{uid()}", coverKey=a["key"]))
    assert (await admin.patch(f"/api/admin/blog/{p1}", json={"coverKey": b["key"]})).status_code == 200
    assert await storage.get(a["key"]) is not None  # encore utilisée par l'autre article
    assert await storage.get(b["key"]) is not None


async def test_discard_unsaved_upload(app, db):
    admin = await _admin(app, db)
    unsaved, used = await _cover(admin), await _cover(admin)
    await admin.post("/api/admin/blog", json=_payload(f"u-{uid()}", coverKey=used["key"]))
    assert (await admin.delete("/api/admin/blog/images", params={"key": unsaved["key"]})).status_code == 204
    assert await storage.get(unsaved["key"]) is None
    assert await storage.get(storage_thumb(unsaved["key"])) is None
    assert (await admin.delete("/api/admin/blog/images", params={"key": used["key"]})).status_code == 204
    assert await storage.get(used["key"]) is not None  # référencée : intouchable
    assert (await admin.delete("/api/admin/blog/images", params={"key": "photos/" + "a" * 32 + ".webp"})).status_code == 204  # hors couvertures : ignoré


def storage_thumb(k: str) -> str:
    return k.replace(".webp", "_t.webp")


async def test_orphans_admin_only(app, db):
    member = await login(app, (await seed_member(db, gender="MAN", seeking="WOMEN", city="Lomé"))["email"])
    for c, code in ((member, 403), (new_agent(app), 401)):
        assert (await c.get("/api/admin/orphans")).status_code == code
        assert (await c.post("/api/admin/orphans/delete", json={"keys": ["blog/" + "a" * 32 + ".webp"]})).status_code == code


async def test_scan_and_delete_orphans(app, db):
    admin = await _admin(app, db)
    old = await _plant("blog/", 48)
    old_thumb = storage_thumb(old)
    await storage.put(old_thumb, b"RIFF....WEBPy")
    os.utime(storage._resolve(old_thumb), (time.time() - 48 * 3600,) * 2)
    young = await _plant("blog/", 1)
    cover = await _cover(admin)  # récent mais référencé ci-dessous
    await admin.post("/api/admin/blog", json=_payload(f"o-{uid()}", coverKey=cover["key"]))
    r = await admin.get("/api/admin/orphans")
    assert r.status_code == 200
    keys = {i["key"] for i in r.json()["items"]}
    assert old in keys and old_thumb not in keys and young not in keys  # la miniature est rattachée à son image and cover["key"] not in keys
    assert r.json()["tooRecent"] >= 1
    item = next(i for i in r.json()["items"] if i["key"] == old)
    assert item["kind"] == "blog" and item["url"] == f"/api/media/{old}"
    # Suppression : l'orpheline part ; la récente et la référencée sont ignorées.
    d = await admin.post("/api/admin/orphans/delete", json={"keys": [old, young, cover["key"]]})
    assert d.status_code == 200 and d.json()["deleted"] == [old] and set(d.json()["skipped"]) == {young, cover["key"]}
    assert await storage.get(old) is None and await storage.get(old_thumb) is None and await storage.get(young) is not None and await storage.get(cover["key"]) is not None
    assert (await admin.post("/api/admin/orphans/delete", json={"keys": []})).status_code == 400
    await storage.delete(young)


async def test_unused_rows_do_not_protect_files(app, db):
    """Pièce jointe d'un message supprimé ou refusée, photo d'un compte supprimé : le fichier est orphelin même si la ligne existe encore."""
    from sqlalchemy import select, update

    from app.models.models import Message, MessageAttachment, Profile, ProfilePhoto, User
    from tests.support_c import matched

    admin = await _admin(app, db)
    w, m, conv = await matched(app, db)
    keys = {n: await _plant(p, 48) for n, p in (("live", "private/chat/"), ("deleted", "private/chat/"), ("rejected", "private/chat/"), ("photo_ok", "photos/"), ("photo_gone", "photos/"))}
    import datetime

    def msg(deleted):
        return Message(conversationId=conv, senderId=w.id, body="", deletedAt=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) if deleted else None)

    for name, deleted, status in (("live", False, "APPROVED"), ("deleted", True, "APPROVED"), ("rejected", False, "REJECTED")):
        mm = msg(deleted)
        db.add(mm)
        await db.flush()
        db.add(MessageAttachment(messageId=mm.id, key=keys[name], mime="image/webp", size=10, moderationStatus=status))
    for name, uid_ in (("photo_ok", m.id), ("photo_gone", w.id)):
        pid = (await db.execute(select(Profile.id).where(Profile.userId == uid_))).scalar_one()
        db.add(ProfilePhoto(profileId=pid, key=keys[name], width=1, height=1, position=9, isPrimary=False, moderationStatus="APPROVED"))
    await db.execute(update(User).where(User.id == w.id).values(status="DELETED"))
    await db.commit()
    found = {i["key"] for i in (await admin.get("/api/admin/orphans")).json()["items"]}
    assert keys["deleted"] in found and keys["rejected"] in found and keys["photo_gone"] in found
    assert keys["live"] not in found and keys["photo_ok"] not in found
    res = (await admin.post("/api/admin/orphans/delete", json={"keys": [keys["deleted"], keys["rejected"], keys["photo_gone"], keys["live"]]})).json()
    assert set(res["deleted"]) == {keys["deleted"], keys["rejected"], keys["photo_gone"]} and res["skipped"] == [keys["live"]]
    assert await storage.get(keys["live"]) is not None and await storage.get(keys["photo_ok"]) is not None
    for k in (keys["live"], keys["photo_ok"]):
        await storage.delete(k)

"""Blog : brouillons invisibles, image de couverture obligatoire pour publier, droits admin, images servies, accroches des formules."""
import io

from PIL import Image
from sqlalchemy import update

from app.models.models import User
from tests.helpers import jpeg, login, new_agent, seed_member, uid


async def _admin(app, db):
    m = await seed_member(db, gender="OTHER", seeking="EVERYONE", city="Lomé")
    await db.execute(update(User).where(User.id == m["id"]).values(role="ADMIN"))
    await db.commit()
    return await login(app, m["email"])


def _payload(slug: str, **over):
    return {"slug": slug, "locale": "fr", "title": "Un bel article de test", "excerpt": "Un résumé suffisamment long pour passer.",
            "body": "## Titre\n\nUn corps d'article assez long pour être valide.", **over}


async def _cover(admin):
    r = await admin.post("/api/admin/blog/images", files={"file": ("c.jpg", jpeg(1600, 900), "image/jpeg")})
    assert r.status_code == 201, r.text
    return r.json()


async def test_admin_only(app, db):
    member = await login(app, (await seed_member(db, gender="MAN", seeking="WOMEN", city="Lomé"))["email"])
    anon = new_agent(app)
    for c, code in ((member, 403), (anon, 401)):
        assert (await c.get("/api/admin/blog")).status_code == code
        assert (await c.post("/api/admin/blog", json=_payload("x-" + uid()))).status_code == code
        assert (await c.post("/api/admin/blog/images", files={"file": ("c.jpg", jpeg(), "image/jpeg")})).status_code == code
    assert (await anon.get("/api/blog")).status_code == 200  # la lecture publique reste ouverte


async def test_draft_publish_flow_and_images(app, db):
    admin = await _admin(app, db)
    anon = new_agent(app)
    slug = f"art-{uid()}"
    draft = await admin.post("/api/admin/blog", json=_payload(slug))
    assert draft.status_code == 201 and draft.json()["status"] == "DRAFT" and draft.json()["publishedAt"] is None
    pid = draft.json()["id"]
    # Un brouillon est invisible du public.
    assert slug not in [p["slug"] for p in (await anon.get("/api/blog", params={"locale": "fr"})).json()["items"]]
    assert (await anon.get(f"/api/blog/{slug}", params={"locale": "fr"})).status_code == 404
    # Publier exige une image de couverture, puis son texte alternatif.
    r = await admin.patch(f"/api/admin/blog/{pid}", json={"status": "PUBLISHED"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "COVER_REQUIRED"
    cover = await _cover(admin)
    r = await admin.patch(f"/api/admin/blog/{pid}", json={"coverKey": cover["key"], "status": "PUBLISHED"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "COVER_ALT_REQUIRED"
    r = await admin.patch(f"/api/admin/blog/{pid}", json={"coverKey": cover["key"], "coverAlt": "Deux mains qui se touchent", "status": "PUBLISHED"})
    assert r.status_code == 200 and r.json()["publishedAt"]
    # Visible, avec image servie en WebP (plein format et miniature).
    item = next(p for p in (await anon.get("/api/blog", params={"locale": "fr"})).json()["items"] if p["slug"] == slug)
    assert item["coverUrl"] == cover["url"] and item["readMinutes"] >= 1 and "body" not in item
    detail = (await anon.get(f"/api/blog/{slug}", params={"locale": "fr"})).json()
    assert detail["body"].startswith("## Titre") and detail["coverAlt"] == "Deux mains qui se touchent"
    for url, size in ((cover["url"], (1600, 900)), (cover["thumbUrl"], (800, 450))):
        img = await anon.get(url)
        assert img.status_code == 200 and img.headers["content-type"] == "image/webp"
        assert Image.open(io.BytesIO(img.content)).size == size
    # La langue est respectée.
    assert (await anon.get(f"/api/blog/{slug}", params={"locale": "en"})).status_code == 404
    # Dépublier le retire du public ; supprimer retire aussi l'image.
    assert (await admin.patch(f"/api/admin/blog/{pid}", json={"status": "DRAFT"})).json()["publishedAt"] is None
    assert (await anon.get(f"/api/blog/{slug}", params={"locale": "fr"})).status_code == 404
    assert (await admin.delete(f"/api/admin/blog/{pid}")).status_code == 204
    assert (await anon.get(cover["url"])).status_code == 404


async def test_validation(app, db):
    admin = await _admin(app, db)
    slug = f"val-{uid()}"
    first = await admin.post("/api/admin/blog", json=_payload(slug))
    assert first.status_code == 201
    assert (await admin.post("/api/admin/blog", json=_payload(slug))).status_code == 409  # même langue, même slug
    assert (await admin.post("/api/admin/blog", json=_payload(slug, locale="en"))).status_code == 201  # autre langue : autorisé
    assert (await admin.post("/api/admin/blog", json=_payload("Slug Invalide!"))).status_code == 400
    assert (await admin.post("/api/admin/blog", json=_payload(f"cov-{uid()}", coverKey="blog/" + "a" * 32 + ".webp"))).json()["error"]["code"] == "INVALID_COVER"
    assert (await admin.post("/api/admin/blog", json=_payload(f"cov-{uid()}", coverKey="../../etc/passwd"))).status_code == 400
    assert (await admin.post("/api/admin/blog/images", files={"file": ("x.jpg", b"pas une image", "image/jpeg")})).status_code == 400
    assert (await new_agent(app).get("/api/media/blog/..%2Fsecret.webp")).status_code == 404
    assert (await admin.patch("/api/admin/blog/inconnu", json={"title": "Autre titre ok"})).status_code == 404


async def test_replacing_cover_removes_old_file(app, db):
    admin = await _admin(app, db)
    anon = new_agent(app)
    a, b = await _cover(admin), await _cover(admin)
    pid = (await admin.post("/api/admin/blog", json=_payload(f"rep-{uid()}", coverKey=a["key"]))).json()["id"]
    assert (await anon.get(a["url"])).status_code == 200
    assert (await admin.patch(f"/api/admin/blog/{pid}", json={"coverKey": b["key"]})).status_code == 200
    assert (await anon.get(a["url"])).status_code == 404 and (await anon.get(b["url"])).status_code == 200


async def test_plan_taglines_editable(app, db):
    admin = await _admin(app, db)
    anon = new_agent(app)
    assert (await admin.patch("/api/admin/plans/PREMIUM", json={"taglineFr": "Pour avancer sereinement", "taglineEn": "To move forward calmly"})).status_code == 200
    try:
        plan = next(p for p in (await anon.get("/api/plans")).json()["plans"] if p["code"] == "PREMIUM")
        assert plan["taglineFr"] == "Pour avancer sereinement" and plan["taglineEn"] == "To move forward calmly"
    finally:
        await admin.patch("/api/admin/plans/PREMIUM", json={"taglineFr": "", "taglineEn": ""})
    plan = next(p for p in (await anon.get("/api/plans")).json()["plans"] if p["code"] == "PREMIUM")
    assert plan["taglineFr"] is None  # vide = accroche par défaut du site

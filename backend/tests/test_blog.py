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


async def test_dates_d_ajout_et_de_publication_modifiables(app, db):
    admin = await _admin(app, db)
    anon = new_agent(app)
    slug = f"dates-{uid()}"
    cover = await _cover(admin)
    # À la création : date d'ajout choisie ; la publication prend la date donnée (passée), pas « maintenant ».
    r = await admin.post("/api/admin/blog", json=_payload(slug, coverKey=cover["key"], coverAlt="Deux mains", status="PUBLISHED",
                                                            createdAt="2026-01-05T10:00:00Z", publishedAt="2026-02-10T08:30:00Z"))
    assert r.status_code == 201, r.text
    row = r.json()
    assert row["createdAt"].startswith("2026-01-05T10:00") and row["publishedAt"].startswith("2026-02-10T08:30")
    pid = row["id"]
    # Modification des deux dates ; le public voit la date de publication.
    r = await admin.patch(f"/api/admin/blog/{pid}", json={"createdAt": "2025-12-24T09:00:00Z", "publishedAt": "2026-03-01T12:00:00Z"})
    assert r.status_code == 200 and r.json()["createdAt"].startswith("2025-12-24") and r.json()["publishedAt"].startswith("2026-03-01T12:00")
    item = next(p for p in (await anon.get("/api/blog", params={"locale": "fr"})).json()["items"] if p["slug"] == slug)
    assert item["publishedAt"].startswith("2026-03-01T12:00")
    # Jamais dans le futur.
    far = "2099-01-01T00:00:00Z"
    bad = await admin.patch(f"/api/admin/blog/{pid}", json={"publishedAt": far})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "DATE_IN_FUTURE"
    assert (await admin.patch(f"/api/admin/blog/{pid}", json={"createdAt": far})).status_code == 400
    # Un brouillon n'a pas de date de publication : elle est ignorée, et repasser en brouillon l'efface.
    r = await admin.patch(f"/api/admin/blog/{pid}", json={"status": "DRAFT", "publishedAt": "2026-03-02T12:00:00Z"})
    assert r.status_code == 200 and r.json()["publishedAt"] is None


async def test_featured_article_is_exclusive_and_published_only(app, db):
    admin = await _admin(app, db)
    anon = new_agent(app)
    cover = await _cover(admin)
    mk = lambda s, **o: admin.post("/api/admin/blog", json=_payload(f"{s}-{uid()}", coverKey=cover["key"], coverAlt="Une image", **o))  # noqa: E731
    a = (await mk("fa", status="PUBLISHED", featured=True)).json()
    assert a["featured"] is True
    b = (await mk("fb", status="PUBLISHED")).json()
    assert b["featured"] is False
    r = await admin.patch(f"/api/admin/blog/{b['id']}", json={"featured": True})
    assert r.json()["featured"] is True
    assert (await admin.get(f"/api/admin/blog/{a['id']}")).json()["featured"] is False  # un seul par langue
    # Un brouillon ne peut pas être à la une ; dépublier retire la mise à la une.
    d = (await mk("fd", featured=True)).json()
    assert d["status"] == "DRAFT" and d["featured"] is False
    assert (await admin.patch(f"/api/admin/blog/{b['id']}", json={"status": "DRAFT"})).json()["featured"] is False
    # Public : le champ est exposé sur les cartes.
    await admin.patch(f"/api/admin/blog/{a['id']}", json={"featured": True})
    items = (await anon.get("/api/blog", params={"locale": "fr"})).json()["items"]
    assert [i["slug"] for i in items if i["featured"]] == [a["slug"]]
    await admin.patch(f"/api/admin/blog/{a['id']}", json={"featured": False})


async def test_view_counter_and_public_visibility_setting(app, db):
    admin = await _admin(app, db)
    anon = new_agent(app)
    cover = await _cover(admin)
    p = (await admin.post("/api/admin/blog", json=_payload(f"vw-{uid()}", coverKey=cover["key"], coverAlt="Une image", status="PUBLISHED"))).json()
    assert p["views"] == 0
    for _ in range(3):
        assert (await anon.post(f"/api/blog/{p['slug']}/view", params={"locale": "fr"})).status_code == 204
    assert (await anon.post("/api/blog/inconnu-xyz/view", params={"locale": "fr"})).status_code == 204  # sans effet
    assert (await admin.get(f"/api/admin/blog/{p['id']}")).json()["views"] == 3  # l'administration le voit toujours
    # Masqué au public par défaut ; l'admin peut l'afficher.
    assert (await admin.put("/api/admin/blog/settings", json={"showViews": False})).status_code == 200
    detail = (await anon.get(f"/api/blog/{p['slug']}", params={"locale": "fr"})).json()
    assert "views" not in detail and all("views" not in i for i in (await anon.get("/api/blog", params={"locale": "fr"})).json()["items"])
    assert (await admin.put("/api/admin/blog/settings", json={"showViews": True})).json() == {"showViews": True}
    assert (await anon.get(f"/api/blog/{p['slug']}", params={"locale": "fr"})).json()["views"] == 3
    assert (await anon.put("/api/admin/blog/settings", json={"showViews": True})).status_code == 401
    await admin.put("/api/admin/blog/settings", json={"showViews": False})
    # Un brouillon n'est jamais compté.
    d = (await admin.post("/api/admin/blog", json=_payload(f"vd-{uid()}"))).json()
    await anon.post(f"/api/blog/{d['slug']}/view", params={"locale": "fr"})
    assert (await admin.get(f"/api/admin/blog/{d['id']}")).json()["views"] == 0


async def test_translation_link(app, db):
    """Lier un article à sa version dans l'autre langue : visible dans l'admin, exposé au public seulement si la traduction est publiée."""
    admin = await _admin(app, db)
    anon = new_agent(app)
    cover = await _cover(admin)
    pub = {"coverKey": cover["key"], "coverAlt": "Une image", "status": "PUBLISHED"}
    fr = (await admin.post("/api/admin/blog", json=_payload(f"fr-{uid()}", **pub))).json()
    en = await admin.post("/api/admin/blog", json=_payload(f"en-{uid()}", locale="en", translationOf=fr["id"]))
    assert en.status_code == 201 and en.json()["translation"]["id"] == fr["id"]
    en = en.json()
    assert (await admin.get(f"/api/admin/blog/{fr['id']}")).json()["translation"]["id"] == en["id"]
    # Traduction en brouillon : rien n'est annoncé au public.
    assert (await anon.get(f"/api/blog/{fr['slug']}", params={"locale": "fr"})).json()["translations"] == {}
    await admin.patch(f"/api/admin/blog/{en['id']}", json=pub)
    assert (await anon.get(f"/api/blog/{fr['slug']}", params={"locale": "fr"})).json()["translations"] == {"en": en["slug"]}
    assert (await anon.get(f"/api/blog/{en['slug']}", params={"locale": "en"})).json()["translations"] == {"fr": fr["slug"]}
    item = next(p for p in (await anon.get("/api/blog", params={"locale": "en"})).json()["items"] if p["slug"] == en["slug"])
    assert item["translations"] == {"fr": fr["slug"]}
    # Même langue refusée ; une deuxième version anglaise du même article aussi.
    fr2 = (await admin.post("/api/admin/blog", json=_payload(f"fr2-{uid()}"))).json()
    r = await admin.patch(f"/api/admin/blog/{fr2['id']}", json={"translationOf": fr["id"]})
    assert r.status_code == 400 and r.json()["error"]["code"] == "TRANSLATION_SAME_LOCALE"
    en2 = await admin.post("/api/admin/blog", json=_payload(f"en2-{uid()}", locale="en", translationOf=fr["id"]))
    assert en2.status_code == 409 and en2.json()["error"]["code"] == "TRANSLATION_TAKEN"
    # Délier.
    r = await admin.patch(f"/api/admin/blog/{en['id']}", json={"translationOf": None})
    assert r.status_code == 200 and r.json()["translation"] is None
    assert (await anon.get(f"/api/blog/{fr['slug']}", params={"locale": "fr"})).json()["translations"] == {}
    for p in (fr, en, fr2):
        await admin.delete(f"/api/admin/blog/{p['id']}")


async def test_image_partagee_entre_versions(app, db):
    """Case « Utiliser l'image de la version … » : les deux versions pointent vers le même fichier ; le remplacer d'un côté le remplace de l'autre,
    et le fichier n'est jamais supprimé tant qu'une version l'utilise."""
    admin = await _admin(app, db)
    anon = new_agent(app)
    c1, c2 = await _cover(admin), await _cover(admin)
    fr = (await admin.post("/api/admin/blog", json=_payload(f"fr-{uid()}", coverKey=c1["key"], coverAlt="Une image", status="PUBLISHED"))).json()
    en = (await admin.post("/api/admin/blog", json=_payload(f"en-{uid()}", locale="en", translationOf=fr["id"], coverKey=c1["key"], coverAlt="An image", status="PUBLISHED"))).json()
    assert en["coverKey"] == fr["coverKey"] == c1["key"]
    # Remplacer l'image de la version française : l'anglaise suit, l'ancien fichier (plus utilisé) est supprimé.
    r = await admin.patch(f"/api/admin/blog/{fr['id']}", json={"coverKey": c2["key"]})
    assert r.status_code == 200 and r.json()["coverKey"] == c2["key"]
    assert (await admin.get(f"/api/admin/blog/{en['id']}")).json()["coverKey"] == c2["key"]
    assert (await anon.get(c1["url"])).status_code == 404
    # Décocher côté anglais (plus d'image) : le fichier reste, la version française l'utilise toujours.
    r = await admin.patch(f"/api/admin/blog/{en['id']}", json={"coverKey": None, "status": "DRAFT"})
    assert r.status_code == 200 and r.json()["coverKey"] is None
    assert (await anon.get(c2["url"])).status_code == 200
    assert (await admin.get(f"/api/admin/blog/{fr['id']}")).json()["coverKey"] == c2["key"]
    # Une image propre à l'anglais ne touche plus la version française.
    c3 = await _cover(admin)
    await admin.patch(f"/api/admin/blog/{en['id']}", json={"coverKey": c3["key"]})
    assert (await admin.get(f"/api/admin/blog/{fr['id']}")).json()["coverKey"] == c2["key"]
    for p in (fr, en):
        await admin.delete(f"/api/admin/blog/{p['id']}")

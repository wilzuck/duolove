"""Parcours d'intégration (port de apps/api/test/flows.spec.ts) : auth, profil, découverte, likes, messagerie, paiements, modération, RGPD."""
import asyncio
import hashlib
import hmac
import re

import pytest
from sqlalchemy import func, select, update

from app.core import mail
from app.core.ids import utcnow
from app.models.models import Invoice, Match, Notification, Payment, Preference, Profile, Swipe, User
from tests.helpers import PASSWORD, jpeg, login, make_premium, new_agent, seed_member, uid

CITY = f"Ville-{uid()}"


def adult(email, **over):
    return {"displayName": "Ama", "email": email, "password": PASSWORD, "birthDate": "1995-05-05", "gender": "WOMAN", "country": "TG", "city": CITY, "acceptTerms": True, **over}


async def scalar(db, stmt):
    db.expire_all()
    return (await db.execute(stmt)).scalar_one()


def last_mail(email, subject_part=None):
    return next(m for m in reversed(mail.outbox) if m["to"] == email and (subject_part is None or subject_part in m["subject"]))


# ───────── inscription, e-mail et connexion ─────────
async def test_refuse_minor(http):
    y = utcnow().replace(year=utcnow().year - 16).date().isoformat()
    r = await http.post("/api/auth/register", json=adult(f"kid-{uid()}@t.io", birthDate=y))
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "underage" in str(r.json()["error"]["details"])


async def test_register_verify_email(http, app, db):
    email = f"ama-{uid()}@t.io"
    a = new_agent(app)
    reg = await a.post("/api/auth/register", json=adult(email))
    assert reg.status_code == 201
    assert re.search(r"duomatch_sid=.*HttpOnly", reg.headers.get_list("set-cookie")[0], re.I)

    assert (await a.get("/api/discovery")).json()["error"]["code"] == "EMAIL_NOT_VERIFIED"

    token = re.search(r"token=([\w-]+)", last_mail(email)["text"]).group(1)
    assert (await http.post("/api/auth/verify-email", json={"token": "faux-token-faux-token"})).status_code == 400
    assert (await a.post("/api/auth/verify-email", json={"token": token})).status_code == 200
    assert (await a.post("/api/auth/verify-email", json={"token": token})).status_code == 400  # usage unique
    assert (await a.get("/api/users/me")).json()["emailVerified"] is True
    await a.aclose()


async def test_duplicate_email_and_weak_password(http):
    email = f"dup-{uid()}@t.io"
    await http.post("/api/auth/register", json=adult(email))
    assert (await http.post("/api/auth/register", json=adult(email))).status_code == 409
    assert (await http.post("/api/auth/register", json=adult(f"w-{uid()}@t.io", password="faible"))).status_code == 400


async def test_lockout_after_five_failures(app):
    email = f"lock-{uid()}@t.io"
    c = new_agent(app)
    await c.post("/api/auth/register", json=adult(email))
    unknown = await c.post("/api/auth/login", json={"email": f"nope-{uid()}@t.io", "password": "Whatever-123"})
    wrong = await c.post("/api/auth/login", json={"email": email, "password": "Mauvais-Mdp-1"})
    assert unknown.status_code == 401 and wrong.status_code == 401
    assert wrong.json()["error"]["code"] == unknown.json()["error"]["code"]
    for _ in range(4):
        await c.post("/api/auth/login", json={"email": email, "password": "Mauvais-Mdp-1"})
    locked = await c.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert locked.status_code == 429
    assert locked.json()["error"]["code"] == "ACCOUNT_LOCKED"
    await c.aclose()


async def test_password_reset_revokes_sessions(http, app):
    email = f"rst-{uid()}@t.io"
    a = new_agent(app)
    await a.post("/api/auth/register", json=adult(email))
    assert (await http.post("/api/auth/forgot-password", json={"email": f"inconnu-{uid()}@t.io"})).status_code == 202
    await http.post("/api/auth/forgot-password", json={"email": email})
    token = re.search(r"token=([\w-]+)", last_mail(email, "Réinitialisation")["text"]).group(1)
    r = await http.post("/api/auth/reset-password", json={"token": token, "password": "Nouveau-Mdp-2026"})
    assert r.status_code == 200
    assert (await a.get("/api/users/me")).status_code == 401  # ancienne session révoquée
    assert (await http.post("/api/auth/login", json={"email": email, "password": "Nouveau-Mdp-2026"})).status_code == 200
    await a.aclose()


async def test_csrf_foreign_origin(http):
    r = await http.post("/api/auth/login", headers={"Origin": "https://evil.example"}, json={"email": "a@b.co", "password": "x"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "CSRF_ORIGIN"


# ───────── profil, photos et découverte ─────────
async def test_onboarding_photo_preferences(http, app, db):
    email = f"onb-{uid()}@t.io"
    a = new_agent(app)
    await a.post("/api/auth/register", json=adult(email))
    await db.execute(update(User).where(User.email == email).values(emailVerifiedAt=utcnow()))
    await db.commit()

    assert (await a.post("/api/profiles/me/onboarding/complete")).json()["error"]["code"] == "PHOTO_REQUIRED"
    upd = await a.patch("/api/profiles/me", json={"bio": "J’aime la cuisine, les voyages et les longues discussions sincères.", "interests": ["cooking", "travel", "music"], "intent": "SERIOUS", "occupation": "Ingénieure"})
    assert upd.status_code == 200
    assert sorted(upd.json()["interests"]) == ["cooking", "music", "travel"]

    bad = await a.post("/api/profiles/me/photos", files={"file": ("x.jpg", b"pas une image", "image/jpeg")})
    assert bad.status_code == 400
    up = await a.post("/api/profiles/me/photos", files={"file": ("a.jpg", jpeg(), "image/jpeg")})
    assert up.status_code == 201
    photos = up.json()["photos"]
    assert len(photos) == 1 and photos[0]["isPrimary"] is True
    from urllib.parse import urlparse

    img = await http.get(urlparse(photos[0]["url"]).path)
    assert img.status_code == 200
    assert img.headers["content-type"] == "image/webp"
    assert (await http.get(urlparse(photos[0]["thumbUrl"]).path)).status_code == 200  # miniature (suffixe _t)
    assert (await http.get("/api/media/photos/..%2F..%2F.env")).status_code == 404
    assert (await http.get("/api/media/photos/NOT_HEX.webp")).status_code == 404

    assert (await a.put("/api/profiles/me/preferences", json={"seeking": "MEN", "ageMin": 25, "ageMax": 20})).status_code == 400
    pref = await a.put("/api/profiles/me/preferences", json={"seeking": "MEN", "ageMin": 20, "ageMax": 40, "city": CITY})
    assert pref.json()["preference"]["seeking"] == "MEN"
    assert pref.json()["preference"]["cities"] == [CITY]  # ancien champ « city » : devient une liste d'une ville
    many = await a.put("/api/profiles/me/preferences", json={"seeking": "MEN", "ageMin": 20, "ageMax": 40, "cities": [" Lomé ", "LOME", "Kara", ""]})
    assert many.status_code == 400  # ville vide refusée
    many = await a.put("/api/profiles/me/preferences", json={"seeking": "MEN", "ageMin": 20, "ageMax": 40, "cities": [" Lomé ", "LOME", "Kara"]})
    assert many.json()["preference"]["cities"] == ["Lomé", "Kara"] and many.json()["preference"]["city"] == "Lomé"
    assert (await a.put("/api/profiles/me/preferences", json={"seeking": "MEN", "ageMin": 20, "ageMax": 40, "cities": [f"V{i}x" for i in range(11)]})).status_code == 400
    assert (await a.put("/api/profiles/me/preferences", json={"seeking": "MEN", "ageMin": 20, "ageMax": 40, "cities": []})).json()["preference"]["cities"] == []
    # filtres avancés = Premium : refusés côté serveur
    assert (await a.put("/api/profiles/me/preferences", json={"seeking": "MEN", "ageMin": 20, "ageMax": 40, "verifiedOnly": True})).json()["error"]["code"] == "PLAN_REQUIRED"

    done = await a.post("/api/profiles/me/onboarding/complete")
    assert done.status_code == 200
    assert done.json()["onboarded"] is True
    assert done.json()["completenessLevel"] != "INCOMPLETE"
    await a.aclose()


async def test_mutual_preferences_blocks_suspension_incognito(app, db):
    c1 = f"Disc-{uid()}"
    viewer = await seed_member(db, gender="WOMAN", seeking="MEN", city=c1, age=30)
    ok_man = await seed_member(db, gender="MAN", seeking="WOMEN", city=c1, name="Compatible")
    wrong_gender = await seed_member(db, gender="WOMAN", seeking="WOMEN", city=c1)
    not_seeking_her = await seed_member(db, gender="MAN", seeking="MEN", city=c1)
    too_young = await seed_member(db, gender="MAN", seeking="WOMEN", city=c1)
    await db.execute(update(Preference).where(Preference.userId == too_young["id"]).values(ageMin=40, ageMax=60))
    blocked = await seed_member(db, gender="MAN", seeking="WOMEN", city=c1)
    suspended = await seed_member(db, gender="MAN", seeking="WOMEN", city=c1)
    await db.execute(update(User).where(User.id == suspended["id"]).values(status="SUSPENDED"))
    hidden = await seed_member(db, gender="MAN", seeking="WOMEN", city=c1)
    await db.execute(update(Profile).where(Profile.userId == hidden["id"]).values(visibility="HIDDEN"))
    incognito = await seed_member(db, gender="MAN", seeking="WOMEN", city=c1)
    await db.execute(update(Profile).where(Profile.userId == incognito["id"]).values(incognito=True))
    await db.commit()

    a = await login(app, viewer["email"])
    assert (await a.post(f"/api/blocks/{blocked['id']}")).status_code == 200
    feed = await a.get("/api/discovery?limit=30")
    ids = [i["id"] for i in feed.json()["items"]]
    assert ok_man["id"] in ids
    for x in (wrong_gender, not_seeking_her, too_young, blocked, suspended, hidden, incognito):
        assert x["id"] not in ids
    assert (await a.get("/api/discovery/count")).json()["count"] == 1

    card = next(i for i in feed.json()["items"] if i["id"] == ok_man["id"])
    assert "approxLat" not in card
    assert card["compatibility"] > 0

    # l'autre sens : un bloqué ne voit plus la bloqueuse
    b = await login(app, blocked["email"])
    assert viewer["id"] not in [i["id"] for i in (await b.get("/api/discovery?limit=30")).json()["items"]]
    assert (await b.get(f"/api/profiles/{viewer['id']}")).status_code == 404

    # mode discret : visible seulement si la personne discrète m'a likée
    db.add(Swipe(giverId=incognito["id"], targetId=viewer["id"], action="LIKE"))
    await db.commit()
    assert incognito["id"] in [i["id"] for i in (await a.get("/api/discovery?limit=30")).json()["items"]]
    await a.aclose()
    await b.aclose()


async def test_discovery_several_cities(app, db):
    c1, c2, c3 = f"Uno-{uid()}", f"Duo-{uid()}", f"Tre-{uid()}"
    viewer = await seed_member(db, gender="WOMAN", seeking="MEN", city=c1, age=30)
    in_c1 = await seed_member(db, gender="MAN", seeking="WOMEN", city=c1)
    in_c2 = await seed_member(db, gender="MAN", seeking="WOMEN", city=c2.upper())  # casse différente : même ville
    in_c3 = await seed_member(db, gender="MAN", seeking="WOMEN", city=c3)
    await db.commit()
    a = await login(app, viewer["email"])
    seen = lambda r: {i["id"] for i in r.json()["items"]}  # noqa: E731
    only_c1 = seen(await a.get("/api/discovery?limit=50"))  # préférence enregistrée avant la migration : une seule ville
    assert in_c1["id"] in only_c1 and in_c2["id"] not in only_c1
    r = await a.put("/api/profiles/me/preferences", json={"seeking": "MEN", "ageMin": 18, "ageMax": 99, "cities": [c1, c2]})
    assert r.status_code == 200
    both = seen(await a.get("/api/discovery?limit=50"))
    assert in_c1["id"] in both and in_c2["id"] in both and in_c3["id"] not in both
    await a.aclose()


# ───────── likes, matchs et messagerie ─────────
async def test_exactly_one_match_with_concurrent_likes(app, db):
    c2 = f"Match-{uid()}"
    w = await seed_member(db, gender="WOMAN", seeking="MEN", city=c2)
    m = await seed_member(db, gender="MAN", seeking="WOMEN", city=c2)
    aw, am = await login(app, w["email"]), await login(app, m["email"])

    r1, r2 = await asyncio.gather(aw.post("/api/swipes", json={"targetId": m["id"], "action": "LIKE"}),
                                  am.post("/api/swipes", json={"targetId": w["id"], "action": "LIKE"}))
    assert [r1.status_code, r2.status_code] == [200, 200]
    assert r1.json()["matched"] or r2.json()["matched"]
    a, b = sorted([w["id"], m["id"]])
    count = lambda: scalar(db, select(func.count()).select_from(Match).where(Match.userAId == a, Match.userBId == b))  # noqa: E731
    assert await count() == 1

    again = await aw.post("/api/swipes", json={"targetId": m["id"], "action": "LIKE"})  # rejouer : pas de doublon
    assert again.status_code == 200
    assert await count() == 1
    assert await scalar(db, select(func.count()).select_from(Swipe).where(Swipe.giverId == w["id"], Swipe.targetId == m["id"])) == 1
    assert await scalar(db, select(func.count()).select_from(Notification).where(Notification.userId == w["id"], Notification.type == "MATCH")) == 1
    assert m["id"] not in [i["id"] for i in (await aw.get("/api/discovery?limit=30")).json()["items"]]
    await aw.aclose()
    await am.aclose()


async def test_messaging(app, db):
    c3 = f"Chat-{uid()}"
    w = await seed_member(db, gender="WOMAN", seeking="MEN", city=c3)
    m = await seed_member(db, gender="MAN", seeking="WOMEN", city=c3)
    stranger = await seed_member(db, gender="MAN", seeking="WOMEN", city=c3)
    aw, am, as_ = await login(app, w["email"]), await login(app, m["email"]), await login(app, stranger["email"])
    await aw.post("/api/swipes", json={"targetId": m["id"], "action": "LIKE"})
    matched = await am.post("/api/swipes", json={"targetId": w["id"], "action": "LIKE"})
    assert matched.json()["matched"] is True
    conv = matched.json()["match"]["conversationId"]

    assert (await as_.post(f"/api/conversations/{conv}/messages", json={"body": "intrus"})).status_code == 404
    assert (await as_.get(f"/api/conversations/{conv}/messages")).status_code == 404
    assert (await aw.post(f"/api/conversations/{conv}/messages", json={"body": "   "})).status_code == 400
    for i in range(1, 6):
        assert (await aw.post(f"/api/conversations/{conv}/messages", json={"body": f"Salut {i}"})).status_code == 201

    lst = await am.get("/api/conversations")
    assert lst.json()[0]["unread"] == 5
    assert lst.json()[0]["lastMessage"]["body"] == "Salut 5"
    assert len((await am.get("/api/conversations?q=salut 3")).json()) == 1
    assert len((await am.get("/api/conversations?q=introuvable")).json()) == 0

    p1 = await am.get(f"/api/conversations/{conv}/messages?limit=3")
    assert [x["body"] for x in p1.json()["items"]] == ["Salut 3", "Salut 4", "Salut 5"]
    p2 = await am.get(f"/api/conversations/{conv}/messages?limit=3&cursor={p1.json()['nextCursor']}")
    assert [x["body"] for x in p2.json()["items"]] == ["Salut 1", "Salut 2"]
    assert p2.json()["nextCursor"] is None

    assert (await am.post(f"/api/conversations/{conv}/read")).json()["read"] == 5
    assert (await aw.get(f"/api/conversations/{conv}/messages")).json()["items"][0]["readAt"] is not None
    # Désactiver les accusés de lecture est une option de formule : gratuit → refusé, abonné → accepté.
    assert (await am.patch("/api/profiles/me/settings", json={"readReceipts": False})).status_code == 403
    await make_premium(m["id"])
    assert (await am.patch("/api/profiles/me/settings", json={"readReceipts": False})).status_code == 200
    assert (await aw.get(f"/api/conversations/{conv}/messages")).json()["items"][0]["readAt"] is None

    first = p2.json()["items"][0]
    assert (await am.delete(f"/api/messages/{first['id']}")).status_code == 404  # pas l'auteur
    assert (await aw.delete(f"/api/messages/{first['id']}")).status_code == 200
    assert (await am.get(f"/api/conversations/{conv}/messages?limit=10")).json()["items"][0]["body"] is None

    from urllib.parse import urlparse

    await make_premium(w["id"])
    img = await aw.post(f"/api/conversations/{conv}/images", files={"file": ("p.jpg", jpeg(), "image/jpeg")})
    assert img.status_code == 201
    path = urlparse(img.json()["attachments"][0]["url"]).path
    assert (await am.get(path)).status_code == 200
    assert (await as_.get(path)).status_code == 404

    assert (await am.post(f"/api/blocks/{w['id']}")).status_code == 200  # blocage : conversation fermée dans les deux sens
    closed = await aw.post(f"/api/conversations/{conv}/messages", json={"body": "encore"})
    assert closed.status_code == 403
    assert closed.json()["error"]["code"] == "CONVERSATION_CLOSED"
    assert len((await am.get("/api/conversations")).json()) == 0
    for c in (aw, am, as_):
        await c.aclose()


async def test_free_plan_limits(app, db):
    c4 = f"Quota-{uid()}"
    me = await seed_member(db, gender="WOMAN", seeking="MEN", city=c4)
    a = await login(app, me["email"])
    targets = [await seed_member(db, gender="MAN", seeking="WOMEN", city=c4) for _ in range(21)]
    for i in range(20):
        assert (await a.post("/api/swipes", json={"targetId": targets[i]["id"], "action": "LIKE"})).status_code == 200
    over = await a.post("/api/swipes", json={"targetId": targets[20]["id"], "action": "LIKE"})
    assert over.status_code == 403
    assert over.json()["error"]["code"] == "DAILY_LIMIT"
    assert (await a.post("/api/swipes", json={"targetId": targets[20]["id"], "action": "PASS"})).status_code == 200  # passer reste gratuit
    assert (await a.post("/api/swipes", json={"targetId": targets[20]["id"], "action": "SUPER_LIKE"})).status_code == 200  # déjà décidé : idempotent
    fresh = await seed_member(db, gender="MAN", seeking="WOMEN", city=c4)
    assert (await a.post("/api/swipes", json={"targetId": fresh["id"], "action": "SUPER_LIKE"})).json()["error"]["code"] == "NO_SUPER_LIKES"
    assert (await a.post("/api/swipes/rewind")).json()["error"]["code"] == "PLAN_REQUIRED"
    assert (await a.post("/api/swipes", json={"targetId": me["id"], "action": "LIKE"})).status_code == 400
    await a.aclose()


async def test_reprendre_actif_seulement_apres_un_passer(app, db):
    c = f"Rewind-{uid()}"
    me = await seed_member(db, gender="WOMAN", seeking="MEN", city=c)
    a = await login(app, me["email"])
    t1 = await seed_member(db, gender="MAN", seeking="WOMEN", city=c)
    t2 = await seed_member(db, gender="MAN", seeking="WOMEN", city=c)
    assert (await a.get("/api/swipes/usage")).json()["canRewind"] is False  # rien à reprendre
    await a.post("/api/swipes", json={"targetId": t1["id"], "action": "PASS"})
    assert (await a.get("/api/swipes/usage")).json()["canRewind"] is True
    await a.post("/api/swipes", json={"targetId": t2["id"], "action": "LIKE"})
    assert (await a.get("/api/swipes/usage")).json()["canRewind"] is False  # la dernière décision est un like : on ne l'annule pas
    await a.aclose()


async def test_likes_identity_hidden_for_free(app, db):
    c5 = f"Likers-{uid()}"
    me = await seed_member(db, gender="WOMAN", seeking="MEN", city=c5)
    fan = await seed_member(db, gender="MAN", seeking="WOMEN", city=c5)
    af, a = await login(app, fan["email"]), await login(app, me["email"])
    await af.post("/api/swipes", json={"targetId": me["id"], "action": "LIKE"})
    r = (await a.get("/api/swipes/received")).json()
    assert r["locked"] is True and r["count"] == 1 and r["items"] == []
    notif = (await a.get("/api/notifications")).json()
    assert notif["items"][0]["type"] == "LIKE"
    assert notif["items"][0]["data"] == {}
    await af.aclose()
    await a.aclose()


# ───────── abonnements et paiements ─────────
async def test_subscription_requires_signed_webhook(http, app, db):
    c6 = f"Pay-{uid()}"
    me = await seed_member(db, gender="WOMAN", seeking="MEN", city=c6)
    a = await login(app, me["email"])

    co = await a.post("/api/subscriptions/checkout", json={"type": "subscription", "plan": "PREMIUM"})
    assert co.status_code == 201
    assert "/checkout/mock" in co.json()["checkoutUrl"]
    assert (await a.get("/api/subscriptions/me")).json()["plan"] == "FREE"  # checkout ≠ paiement

    import json

    payload = json.dumps({"id": f"evt_{uid()}", "type": "payment.succeeded", "providerRef": co.json()["providerRef"]})
    hdr = {"content-type": "application/json"}
    assert (await http.post("/api/payments/webhook/mock", content=payload, headers=hdr)).status_code == 401
    assert (await http.post("/api/payments/webhook/mock", content=payload, headers={**hdr, "x-duomatch-signature": "ab" * 32})).status_code == 401
    assert (await a.get("/api/subscriptions/me")).json()["plan"] == "FREE"

    sig = hmac.new(b"dev-only-webhook-secret-change-me", payload.encode(), hashlib.sha256).hexdigest()
    ok = await http.post("/api/payments/webhook/mock", content=payload, headers={**hdr, "x-duomatch-signature": sig})
    assert ok.status_code == 200
    replay = await http.post("/api/payments/webhook/mock", content=payload, headers={**hdr, "x-duomatch-signature": sig})
    assert replay.json()["duplicate"] is True

    sub = (await a.get("/api/subscriptions/me")).json()
    assert sub["plan"] == "PREMIUM"
    assert sub["limits"]["unlimitedLikes"] is True
    assert sub["limits"]["dailyLikes"] == 1000  # plafond anti-abus de la formule « illimitée »
    assert await scalar(db, select(func.count()).select_from(Payment).where(Payment.userId == me["id"], Payment.status == "SUCCEEDED")) == 1
    assert await scalar(db, select(func.count()).select_from(Invoice).join(Payment, Payment.id == Invoice.paymentId).where(Payment.userId == me["id"])) == 1

    history = (await a.get("/api/payments")).json()
    assert re.match(r"^CD-\d{4}-\d{6}$", history[0]["invoiceNumber"])
    assert (await a.get(f"/api/payments/{history[0]['id']}/invoice")).json()["amountXof"] == 2500

    target = await seed_member(db, gender="MAN", seeking="WOMEN", city=c6)
    assert (await a.post("/api/swipes", json={"targetId": target["id"], "action": "SUPER_LIKE"})).status_code == 200
    assert (await a.put("/api/profiles/me/preferences", json={"seeking": "MEN", "ageMin": 20, "ageMax": 40, "verifiedOnly": True})).status_code == 200

    assert (await a.post("/api/subscriptions/cancel")).json()["subscription"]["cancelAtPeriodEnd"] is True
    assert (await a.post("/api/subscriptions/resume")).json()["subscription"]["cancelAtPeriodEnd"] is False
    await a.post("/api/subscriptions/cancel")

    import datetime

    from app.core import payments as paymentsvc  # fourni par le fork C

    res = await paymentsvc.run_expiry_job(db, utcnow() + datetime.timedelta(days=40))
    assert res["expired"] >= 1
    assert (await a.get("/api/subscriptions/me")).json()["plan"] == "FREE"
    await a.aclose()


async def test_failed_payment_grants_nothing(app, db):
    me = await seed_member(db, gender="WOMAN", seeking="MEN", city=f"F-{uid()}")
    a = await login(app, me["email"])
    co = await a.post("/api/subscriptions/checkout", json={"type": "subscription", "plan": "VIP"})
    assert (await a.post(f"/api/payments/mock/{co.json()['providerRef']}/complete", json={"outcome": "fail"})).status_code == 200
    assert (await a.get("/api/subscriptions/me")).json()["plan"] == "FREE"
    assert (await a.get("/api/payments")).json()[0]["status"] == "FAILED"
    other = await seed_member(db, gender="MAN", seeking="WOMEN", city=f"F-{uid()}")
    ao = await login(app, other["email"])
    assert (await ao.post(f"/api/payments/mock/{co.json()['providerRef']}/complete", json={"outcome": "success"})).status_code == 404
    await a.aclose()
    await ao.aclose()


# ───────── modération et administration (RBAC) ─────────
async def test_rbac_moderation_and_flags(http, app, db):
    c7 = f"Adm-{uid()}"
    user = await seed_member(db, gender="MAN", seeking="WOMEN", city=c7)
    reporter = await seed_member(db, gender="WOMAN", seeking="MEN", city=c7)
    mod = await seed_member(db, gender="MAN", seeking="WOMEN", city=c7)
    adm = await seed_member(db, gender="MAN", seeking="WOMEN", city=c7)
    await db.execute(update(User).where(User.id == mod["id"]).values(role="MODERATOR"))
    await db.execute(update(User).where(User.id == adm["id"]).values(role="ADMIN"))
    await db.commit()
    au, ar, am, aa = [await login(app, x["email"]) for x in (user, reporter, mod, adm)]

    assert (await au.get("/api/admin/reports")).status_code == 403
    assert (await http.get("/api/admin/reports")).status_code == 401
    assert (await am.get("/api/admin/overview")).status_code == 403
    assert (await aa.get("/api/admin/overview")).status_code == 200

    assert (await ar.post("/api/reports", json={"targetId": user["id"], "reason": "SCAM", "details": "Demande de l’argent"})).status_code == 201
    # La file de modération est triée du plus ancien au plus récent et paginée : la base de test garde les signalements des
    # exécutions précédentes, le nouveau n'est donc pas forcément sur la première page.
    rep, cursor = None, None
    while rep is None:
        page = (await am.get("/api/admin/reports", params={"cursor": cursor} if cursor else None)).json()
        rep = next((r for r in page["items"] if r["target"]["id"] == user["id"]), None)
        cursor = page.get("nextCursor")
        assert rep or cursor, "signalement introuvable dans la file"

    assert (await am.get(f"/api/admin/users/{user['id']}")).json()["email"] is None  # le modérateur ne voit pas l'e-mail
    assert (await aa.get(f"/api/admin/users/{user['id']}")).json()["email"] == user["email"]
    assert (await am.post(f"/api/admin/users/{adm['id']}/suspend", json={"reason": "test"})).status_code == 403  # pas de sanction contre le personnel

    assert (await am.post(f"/api/admin/users/{user['id']}/suspend", json={"reason": "Arnaque confirmée", "days": 7, "reportId": rep["id"]})).status_code == 200
    assert (await am.post(f"/api/admin/reports/{rep['id']}/resolve", json={"status": "RESOLVED"})).status_code == 200
    assert (await au.get("/api/discovery")).json()["error"]["code"] == "ACCOUNT_SUSPENDED"
    me = (await au.get("/api/users/me")).json()
    assert me["status"] == "SUSPENDED"
    assert me["moderation"]["reason"] == "Arnaque confirmée"

    assert (await au.post("/api/users/me/appeal", json={"text": "Je conteste, il s’agit d’une erreur."})).status_code == 200
    appeals = (await am.get("/api/admin/appeals")).json()
    ap = next(x for x in appeals if x["userId"] == user["id"])
    assert "conteste" in ap["appealText"]
    assert (await am.post(f"/api/admin/appeals/{ap['id']}/decide", json={"approve": True, "note": "Révision OK"})).status_code == 200
    assert (await au.get("/api/discovery")).status_code == 200

    logs = (await aa.get("/api/admin/audit-logs?action=user.suspend")).json()
    assert any(l["targetId"] == user["id"] for l in logs["items"])
    assert (await am.get("/api/admin/audit-logs")).status_code == 403

    assert (await aa.put("/api/admin/feature-flags/new_ui", json={"enabled": True})).status_code == 404  # catalogue fermé
    assert (await aa.put("/api/admin/feature-flags/chat_images", json={"enabled": False})).status_code == 200
    assert (await http.get("/api/feature-flags")).json()["chat_images"] is False
    assert (await aa.put("/api/admin/feature-flags/chat_images", json={"enabled": True})).status_code == 200
    assert (await am.put("/api/admin/feature-flags/chat_images", json={"enabled": False})).status_code == 403
    for c in (au, ar, am, aa):
        await c.aclose()


# ───────── vie privée : export et suppression du compte ─────────
async def test_export_and_account_deletion(http, app, db):
    me = await seed_member(db, gender="WOMAN", seeking="MEN", city=f"Del-{uid()}", name="Zoé Secrète")
    a = await login(app, me["email"])
    exp = await a.get("/api/users/me/export")
    assert exp.status_code == 200
    assert exp.json()["account"]["email"] == me["email"]
    assert "passwordHash" not in exp.json()["account"]

    assert (await a.request("DELETE", "/api/users/me", json={"confirm": "DELETE", "password": "mauvais"})).status_code == 401
    assert (await a.request("DELETE", "/api/users/me", json={"confirm": "DELETE", "password": PASSWORD})).status_code == 200
    assert (await a.get("/api/users/me")).status_code == 401
    db.expire_all()
    row = (await db.execute(select(User).where(User.id == me["id"]))).scalar_one()
    assert row.status.value == "DELETED"
    assert row.email != me["email"]
    prof = (await db.execute(select(Profile.displayName).where(Profile.userId == me["id"]))).scalar_one()
    assert prof == "Compte supprimé"
    assert (await http.post("/api/auth/login", json={"email": me["email"], "password": PASSWORD})).status_code == 401
    await a.aclose()

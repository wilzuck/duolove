"""Envois de l'administration : public ciblé et consentement, aperçu, e-mail + annonce dans l'application, planification, annulation, désabonnement."""
import asyncio
import datetime

from sqlalchemy import select, update

from app.core import broadcastsvc as bc
from app.core import mail, notifications
from app.db.session import session_maker
from app.models.models import Broadcast, EmailSuppression, Notification, User
from tests.support_c import admin, member


async def consent(ids, value=True):
    async with session_maker()() as s:
        await s.execute(update(User).where(User.id.in_(ids)).values(marketingConsent=value))
        await s.commit()


async def wait_status(a, bid, wanted=("SENT", "FAILED"), tries=60):
    for _ in range(tries):
        r = (await a.agent.get(f"/api/admin/broadcasts/{bid}")).json()
        if r["status"] in wanted:
            return r
        await asyncio.sleep(0.2)
    raise AssertionError(f"envoi non terminé : {r}")


async def count(a, **body):
    r = await a.agent.post("/api/admin/broadcasts/audience", json=body)
    assert r.status_code == 200, r.text
    return r.json()["count"]


async def test_public_et_consentement(app, db):
    a = await admin(app, db)
    ok, no = await member(app, db), await member(app, db)
    await consent([ok.id]), await consent([no.id], False)
    spec = {"audienceMode": "SPECIFIC", "audience": {"userIds": [ok.id, no.id]}}
    assert await count(a, **spec, kind="MARKETING") == 1  # promotion : seul le membre qui a accepté
    assert await count(a, **spec, kind="SERVICE") == 2  # information du service : tous
    assert await count(a, audienceMode="SPECIFIC", audience={"emails": [ok.email.upper()]}, kind="SERVICE") == 1
    # Adresse bloquée (rebond) : toujours exclue.
    async with session_maker()() as s:
        s.add(EmailSuppression(email=no.email, reason="BOUNCE"))
        await s.commit()
    assert await count(a, **spec, kind="SERVICE") == 1
    # Tous sauf… et par profil.
    everyone = await count(a, audienceMode="ALL", kind="SERVICE")
    assert await count(a, audienceMode="EXCEPT", audience={"emails": [ok.email]}, kind="SERVICE") == everyone - 1
    men = await count(a, audienceMode="PROFILE", audience={"filters": {"gender": "MAN"}}, kind="SERVICE")
    women = await count(a, audienceMode="PROFILE", audience={"filters": {"gender": "WOMAN"}}, kind="SERVICE")
    assert men + women <= everyone and women >= 1
    # Adresses libres : information du service seulement, adresses valides.
    free = {"audienceMode": "FREE", "audience": {"emails": ["Partenaire@Exemple.com", "partenaire@exemple.com", "autre@exemple.org"]}}
    assert await count(a, **free, kind="SERVICE") == 2  # doublon (casse) retiré
    r = await a.agent.post("/api/admin/broadcasts/audience", json={**free, "kind": "MARKETING"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "FREE_NEEDS_SERVICE"
    r = await a.agent.post("/api/admin/broadcasts/audience", json={"audienceMode": "FREE", "audience": {"emails": ["pas-une-adresse"]}, "kind": "SERVICE"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "INVALID_EMAIL"
    assert (await ok.agent.post("/api/admin/broadcasts/audience", json=spec)).status_code == 403


async def test_apercu_variables_et_securite(app, db):
    a = await admin(app, db)
    body = "## Bonjour {{prénom}}\n\nUne nouveauté à {{ville}} : **génial** <script>alert(1)</script> [lien](javascript:alert(1)) [site](https://crushduo.com)"
    r = await a.agent.post("/api/admin/broadcasts/preview", json={"subject": "Salut {{prénom}}", "body": body, "signature": "L'équipe Crushduo"})
    assert r.status_code == 200
    html = r.json()["html"]
    assert "<script" not in html and "javascript:" not in html and "&lt;script&gt;" in html  # aucun HTML brut, aucun lien dangereux
    assert 'href="https://crushduo.com"' in html and "L&#x27;équipe Crushduo" in html and "Ne plus recevoir ces e-mails" in html
    assert "{{" not in html and "{{" not in r.json()["subject"]


async def test_envoi_email_et_annonce(app, db):
    a = await admin(app, db)
    u1, u2 = await member(app, db), await member(app, db)
    await consent([u1.id, u2.id])
    mail.outbox.clear()
    body = {"subject": "Nouveauté", "body": "Bonjour {{prénom}}, voici la nouveauté.", "signature": "Wilfried", "audienceMode": "SPECIFIC", "audience": {"userIds": [u1.id, u2.id]},
            "channel": "BOTH", "kind": "MARKETING", "when": "now", "expectedRecipients": 3}
    wrong = await a.agent.post("/api/admin/broadcasts", json=body)  # le nombre affiché (3) ne correspond pas au public réel (2)
    assert wrong.status_code == 409 and wrong.json()["error"]["code"] == "AUDIENCE_CHANGED"
    r = await a.agent.post("/api/admin/broadcasts", json={**body, "expectedRecipients": 2})
    assert r.status_code == 201, r.text
    done = await wait_status(a, r.json()["id"])
    assert done["status"] == "SENT" and done["recipients"] == 2 and done["sent"] == 2 and done["failed"] == 0
    got = [m for m in mail.outbox if m["subject"] == "Nouveauté"]
    assert {m["to"] for m in got} == {u1.email, u2.email}
    assert all("notifications-unsubscribe?token=" in m["html"] for m in got)
    async with session_maker()() as s:
        n = (await s.execute(select(Notification).where(Notification.userId.in_([u1.id, u2.id]), Notification.type == "ANNOUNCEMENT"))).scalars().all()
    assert len(n) == 2 and n[0].data["subject"] == "Nouveauté" and n[0].data["broadcastId"] == r.json()["id"]
    assert (await u1.agent.get("/api/notifications")).status_code == 200
    # Le lien de désabonnement coupe aussi les e-mails promotionnels.
    async with session_maker()() as s:
        assert await notifications.unsubscribe_emails(s, notifications.unsub_token(u1.id)) is True
        assert (await s.get(User, u1.id)).marketingConsent is False
    assert await count(a, audienceMode="SPECIFIC", audience={"userIds": [u1.id, u2.id]}, kind="MARKETING") == 1
    assert (await a.agent.post("/api/admin/broadcasts/test", json={"subject": "T", "body": "Corps"})).json()["ok"] is True
    assert any(m["subject"] == "[Test] T" and m["to"] == a.email for m in mail.outbox)


async def test_planification_annulation_et_balayage(app, db):
    a = await admin(app, db)
    u = await member(app, db)
    base = {"subject": "Plus tard", "body": "Texte", "audienceMode": "SPECIFIC", "audience": {"userIds": [u.id]}, "kind": "SERVICE", "when": "later"}
    past = await a.agent.post("/api/admin/broadcasts", json={**base, "scheduledAt": "2020-01-01T10:00:00"})
    assert past.status_code == 400 and past.json()["error"]["code"] == "INVALID_SCHEDULE"
    at = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S")
    r = await a.agent.post("/api/admin/broadcasts", json={**base, "scheduledAt": at})
    assert r.status_code == 201 and r.json()["status"] == "SCHEDULED"
    bid = r.json()["id"]
    async with session_maker()() as s:  # l'heure n'est pas venue : rien n'est lancé
        assert bid not in await bc.claim_due(s)
        # Heure venue : lancé une seule fois, même si le balayage passe deux fois.
        assert bid in await bc.claim_due(s, datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(hours=3))
        assert bid not in await bc.claim_due(s, datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(hours=3))
    await bc.run(bid)
    assert (await a.agent.get(f"/api/admin/broadcasts/{bid}")).json()["status"] == "SENT"
    # Annulation d'un envoi planifié, puis refus d'une seconde annulation ou d'un envoi terminé.
    r2 = await a.agent.post("/api/admin/broadcasts", json={**base, "scheduledAt": at})
    assert (await a.agent.post(f"/api/admin/broadcasts/{r2.json()['id']}/cancel")).json() == {"ok": True}
    assert (await a.agent.post(f"/api/admin/broadcasts/{r2.json()['id']}/cancel")).status_code == 400
    assert (await a.agent.post(f"/api/admin/broadcasts/{bid}/cancel")).status_code == 400
    assert (await a.agent.post("/api/admin/broadcasts/inconnu/cancel")).status_code == 404
    items = (await a.agent.get("/api/admin/broadcasts?limit=5")).json()["items"]
    assert {x["id"] for x in items} >= {bid, r2.json()["id"]}
    async with session_maker()() as s:
        await s.execute(update(Broadcast).where(Broadcast.id == r2.json()["id"]).values(status="CANCELED"))
        await s.commit()

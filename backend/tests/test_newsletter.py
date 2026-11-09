"""Newsletter (double confirmation, désabonnement, envoi par l'administration) et journal des e-mails."""
import asyncio

from app.core import mail, newslettersvc
from app.models.models import NewsletterCampaign
from tests.helpers import uid
from tests.support_c import admin, member


async def test_double_confirmation_et_desabonnement(app, db):
    ad = await admin(app, db)
    mail.outbox.clear()
    email = f"visiteur-{uid()}@duo.test"
    anon = (await ad.agent.post("/api/newsletter/subscribe", json={"email": email})).status_code
    assert anon == 202
    assert (await ad.agent.get("/api/admin/newsletter")).json()["subscribers"]["PENDING"] >= 1  # en attente : pas encore abonné
    token = mail.outbox[-1]["text"].split("token=")[1].split()[0]
    assert (await ad.agent.post(f"/api/newsletter/confirm?token={token}")).status_code == 200
    assert (await ad.agent.post(f"/api/newsletter/unsubscribe?token={token}")).status_code == 200
    assert (await ad.agent.post("/api/newsletter/confirm?token=inconnu-inconnu")).status_code == 404


async def test_membre_s_abonne_dans_ses_reglages(app, db):
    u = await member(app, db)
    assert (await u.agent.get("/api/newsletter/me")).json() == {"subscribed": False}
    await u.agent.put("/api/newsletter/me", json={"subscribed": True})
    assert (await u.agent.get("/api/newsletter/me")).json() == {"subscribed": True}
    await u.agent.put("/api/newsletter/me", json={"subscribed": False})
    assert (await u.agent.get("/api/newsletter/me")).json() == {"subscribed": False}


async def test_envoi_complet_et_journal(app, db):
    ad, u = await admin(app, db), await member(app, db)
    await u.agent.put("/api/newsletter/me", json={"subscribed": True})
    assert (await u.agent.get("/api/admin/newsletter")).status_code == 403
    c = (await ad.agent.post("/api/admin/newsletter", json={"subject": f"Nouveautés {uid()}", "body": "Bonjour <b>vous</b>\n\nDeux paragraphes.", "ctaLabel": "Voir", "ctaUrl": "https://crushduo.com"})).json()
    assert (await ad.agent.post("/api/admin/newsletter", json={"subject": "Lien", "body": "Un texte assez long.", "ctaLabel": "x", "ctaUrl": "javascript:alert(1)"})).status_code == 400
    assert (await ad.agent.post(f"/api/admin/newsletter/{c['id']}/test")).json()["ok"] is True
    mail.outbox.clear()
    await newslettersvc.start(db, c["id"])
    for _ in range(100):
        await asyncio.sleep(0.2)
        row = (await ad.agent.get("/api/admin/newsletter")).json()["items"]
        cur = next(x for x in row if x["id"] == c["id"])
        if cur["status"] == "SENT":
            break
    assert cur["status"] == "SENT" and cur["sent"] >= 1 and cur["failed"] == 0 and cur["recipients"] == cur["sent"]
    sent = [m for m in mail.outbox if m["subject"] == c["subject"]]
    assert sent and "Se désabonner" in sent[0]["html"] and "&lt;b&gt;" in sent[0]["html"] and "<b>vous</b>" not in sent[0]["html"]  # désabonnement présent, contenu échappé
    assert (await ad.agent.post(f"/api/admin/newsletter/{c['id']}/send")).status_code == 400  # déjà envoyé : pas de double envoi
    assert (await ad.agent.put(f"/api/admin/newsletter/{c['id']}", json={"subject": "Autre", "body": "Un texte assez long."})).status_code == 400
    logs = (await ad.agent.get(f"/api/admin/emails?kind=newsletter&q={c['subject']}")).json()["items"]
    assert logs and all(x["status"] == "SENT" and x["campaignId"] == c["id"] for x in logs if x["kind"] == "newsletter")
    st = (await ad.agent.get("/api/admin/emails/stats?days=7")).json()
    assert st["sent"] >= 1 and len(st["series"]["sent"]) == 7 and st["provider"] == "dev"
    assert (await u.agent.get("/api/admin/emails")).status_code == 403


async def test_desabonnement_des_notifications_en_un_clic(app, db):
    from app.core import notifications
    from sqlalchemy import select
    from app.models.models import NotificationPreference
    u = await member(app, db)
    await u.agent.put("/api/notifications/preferences", json={"emailMatches": True, "emailMessages": True})
    tok = notifications.unsub_token(u.id)
    assert (await u.agent.post(f"/api/notifications/unsubscribe-email?token={tok}")).status_code == 200
    p = (await u.agent.get("/api/notifications/preferences")).json()
    assert p["emailMatches"] is False and p["emailMessages"] is False and p["emailLikes"] is False
    assert (await u.agent.post(f"/api/notifications/unsubscribe-email?token={u.id}.0000000000000000000000000000000f")).status_code == 404  # signature falsifiée : refusé
    html = mail.notification_html("Titre", "Corps", "https://x.test/u")
    assert "Ne plus recevoir ces e-mails" in html and "Ne plus recevoir" not in mail.notification_html("Titre", "Corps")

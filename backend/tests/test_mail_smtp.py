"""Envoi SMTP : les identifiants de SMTP_URL sont décodés (mot de passe avec @, :, / en pourcentage)."""
import pytest

from app.core import mail
from app.core.config import get_settings


@pytest.mark.asyncio
async def test_identifiants_smtp_decodes(monkeypatch):
    seen = {}

    async def fake_send(msg, **kw):
        seen.update(kw)
        seen["to"] = msg["To"]

    import aiosmtplib
    monkeypatch.setattr(aiosmtplib, "send", fake_send)
    monkeypatch.setattr(get_settings(), "smtp_url", "smtp://us%40er:p%40ss%3Aw%2Frd@smtp.example.com:587")
    await mail.send("a@b.test", "Sujet", "Corps")
    assert seen["username"] == "us@er"
    assert seen["password"] == "p@ss:w/rd"
    assert seen["hostname"] == "smtp.example.com" and seen["port"] == 587
    assert seen["start_tls"] is True and seen["use_tls"] is False
    assert seen["to"] == "a@b.test"


@pytest.mark.asyncio
async def test_brevo_api_http(monkeypatch):
    import httpx
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(201, json={"messageId": "x"})

    real = httpx.AsyncClient
    monkeypatch.setattr(mail.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    st = get_settings()
    monkeypatch.setattr(st, "brevo_api_key", "xkeysib-test")
    monkeypatch.setattr(st, "mail_from", "Crushduo <no-reply@duomatch.test>")
    await mail.send("a@b.test", "Sujet", "Corps")
    assert len(calls) == 1
    req = calls[0]
    assert req.url == "https://api.brevo.com/v3/smtp/email" and req.headers["api-key"] == "xkeysib-test"
    import json
    body = json.loads(req.content)
    assert body["sender"] == {"email": "no-reply@duomatch.test", "name": "Crushduo"}
    assert body["to"] == [{"email": "a@b.test"}] and body["subject"] == "Sujet" and body["textContent"] == "Corps"


@pytest.mark.asyncio
async def test_echec_envoi_ne_leve_pas_et_ne_journalise_pas_la_cle(monkeypatch, caplog):
    import httpx
    real = httpx.AsyncClient
    monkeypatch.setattr(mail.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(lambda r: httpx.Response(401, json={"message": "Key not found"})), **kw))
    monkeypatch.setattr(get_settings(), "brevo_api_key", "xkeysib-secret")
    await mail.send("a@b.test", "Sujet", "Corps")  # ne lève pas
    assert "Brevo HTTP 401" in caplog.text and "xkeysib-secret" not in caplog.text


def test_mail_from_avec_guillemets_saisis_par_erreur(monkeypatch):
    st = get_settings()
    for raw in ('Crushduo <no-reply@duomatch.test>', '"Crushduo <no-reply@duomatch.test>"', "'Crushduo <no-reply@duomatch.test>'", "  no-reply@duomatch.test "):
        monkeypatch.setattr(st, "mail_from", raw)
        name, addr = mail.sender()
        assert addr == "no-reply@duomatch.test", raw
    monkeypatch.setattr(st, "mail_from", "Crushduo")
    with pytest.raises(RuntimeError, match="MAIL_FROM invalide"):
        mail.sender()


async def test_choix_du_fournisseur_par_l_administration(app, db, monkeypatch):
    """Brevo et SMTP configurés : « auto » préfère Brevo ; le super-administrateur peut basculer sur SMTP ; un fournisseur non configuré est refusé."""
    from app.core import mail_config
    from tests.helpers import uid
    from tests.support_c import member, set_role

    st = get_settings()
    monkeypatch.setattr(st, "brevo_api_key", "xkeysib-test")
    monkeypatch.setattr(st, "smtp_url", "smtp://u:p@smtp.example.com:587")
    mail_config.invalidate()
    sup = await member(app, db)
    await set_role(sup.id, "SUPER_ADMIN")
    view = (await sup.agent.get("/api/admin/emails/provider")).json()
    assert view["choice"] == "auto" and view["active"] == "brevo" and view["configured"] == {"brevo": True, "zeptomail": False, "smtp": True}

    brevo_calls, smtp_calls = [], []

    async def fake_brevo(to, subject, text, html=None, headers=None):  # on remplace l'envoi lui-même : patcher httpx gênerait les appels de test à l'API
        brevo_calls.append(to)
    monkeypatch.setattr(mail, "_send_brevo", fake_brevo)
    import aiosmtplib

    async def fake_smtp(msg, **kw):
        smtp_calls.append(msg["To"])
    monkeypatch.setattr(aiosmtplib, "send", fake_smtp)

    to = f"choix-{uid()}@duo.test"
    assert await mail.send(to, "Sujet", "Corps") and len(brevo_calls) == 1 and smtp_calls == []
    r = await sup.agent.put("/api/admin/emails/provider", json={"provider": "smtp"})
    assert r.status_code == 200 and r.json()["active"] == "smtp"
    assert await mail.send(to, "Sujet", "Corps") and smtp_calls == [to] and len(brevo_calls) == 1
    t = (await sup.agent.post("/api/admin/emails/provider/test")).json()
    assert t["ok"] is True and t["provider"] == "smtp"
    assert (await sup.agent.put("/api/admin/emails/provider", json={"provider": "inconnu"})).status_code == 400
    monkeypatch.setattr(st, "smtp_url", None)  # SMTP n'est plus configuré : on retombe sur Brevo au lieu de ne plus rien envoyer
    assert mail_config.resolve("smtp") == "brevo"
    assert (await sup.agent.put("/api/admin/emails/provider", json={"provider": "smtp"})).status_code == 400
    assert (await sup.agent.put("/api/admin/emails/provider", json={"provider": "auto"})).status_code == 200
    u = await member(app, db)
    assert (await u.agent.put("/api/admin/emails/provider", json={"provider": "brevo"})).status_code == 403
    mail_config.invalidate()


def test_nom_du_fournisseur_dans_le_journal(monkeypatch):
    st = get_settings()
    monkeypatch.setattr(st, "smtp_url", "smtp://u:p@email-smtp.eu-north-1.amazonaws.com:587")
    assert mail.log_provider("smtp") == "ses" and mail.log_provider("brevo") == "brevo" and mail.log_provider("dev") == "dev"
    monkeypatch.setattr(st, "smtp_url", "smtp://u:p@smtp.example.com:587")
    assert mail.log_provider("smtp") == "smtp"


async def test_emails_essentiels_uniquement(app, db, monkeypatch):
    """Interrupteur « e-mails essentiels uniquement » : désactivé par défaut ; activé, les notifications sont ignorées et journalisées,
    les codes, alertes de sécurité et tests partent toujours ; réservé à l'administration."""
    from sqlalchemy import select

    from app.core import mail_config
    from app.models.models import EmailLog
    from tests.helpers import uid
    from tests.support_c import member, set_role

    st = get_settings()
    monkeypatch.setattr(st, "brevo_api_key", "xkeysib-test")
    calls = []

    async def fake_brevo(to, subject, text, html=None, headers=None):
        calls.append((to, subject))
    monkeypatch.setattr(mail, "_send_brevo", fake_brevo)
    mail_config.invalidate()
    mail_config.invalidate_essential()
    adm = await member(app, db)
    await set_role(adm.id, "ADMIN")
    assert (await adm.agent.get("/api/admin/emails/provider")).json()["essentialOnly"] is False
    to = f"essentiel-{uid()}@duo.test"
    assert await mail.send(to, "Nouveau message", "x", kind="notification")  # désactivé : tout part

    r = await adm.agent.put("/api/admin/emails/essential-only", json={"enabled": True})
    assert r.status_code == 200 and r.json()["essentialOnly"] is True
    calls.clear()
    assert await mail.send(to, "Nouveau duo", "x", kind="notification") is False
    assert await mail.send(to, "Newsletter", "x", kind="newsletter") is False
    assert await mail.send(to, "Code", "x", kind="verification")
    assert await mail.send(to, "Connexion inhabituelle", "x", kind="security")
    assert [s for _, s in calls] == ["Code", "Connexion inhabituelle"]
    skipped = (await db.execute(select(EmailLog.subject, EmailLog.status).where(EmailLog.toEmail == to, EmailLog.status == "SKIPPED"))).all()
    assert sorted(s for s, _ in skipped) == ["Newsletter", "Nouveau duo"]
    t = (await adm.agent.post("/api/admin/emails/provider/test")).json()
    assert t["ok"] is True  # le test de l'administration part toujours

    assert (await adm.agent.put("/api/admin/emails/essential-only", json={"enabled": False})).json()["essentialOnly"] is False
    assert await mail.send(to, "Nouveau duo", "x", kind="notification")
    u = await member(app, db)
    assert (await u.agent.put("/api/admin/emails/essential-only", json={"enabled": True})).status_code == 403
    mail_config.invalidate()
    mail_config.invalidate_essential()


@pytest.mark.asyncio
async def test_zeptomail_api_et_marketing_par_brevo(app, db, monkeypatch):
    """ZeptoMail (API HTTP, centre européen par défaut) : en-tête « Zoho-enczapikey », format attendu ; choix dans l'admin ;
    newsletters et envois groupés jamais par ZeptoMail (Brevo si configuré, sinon échec journalisé)."""
    import json

    import httpx

    from app.core import mail_config
    from tests.helpers import uid
    from tests.support_c import member, set_role

    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(201, json={"data": [{"code": "EM_104"}]})

    real = httpx.AsyncClient
    monkeypatch.setattr(mail.httpx, "AsyncClient", lambda **kw: real(**{"transport": httpx.MockTransport(handler), **kw}))  # les clients de test gardent leur transport
    st = get_settings()
    monkeypatch.setattr(st, "zeptomail_token", "jeton-test")
    monkeypatch.setattr(st, "brevo_api_key", None)
    monkeypatch.setattr(st, "smtp_url", None)
    monkeypatch.setattr(st, "mail_from", "Crushduo <no-reply@duomatch.test>")
    mail_config.invalidate()
    mail_config.invalidate_essential()
    assert mail_config.resolve("auto") == "zeptomail"

    to = f"zepto-{uid()}@duo.test"
    assert await mail.send(to, "Code", "Corps", "<p>Corps</p>", kind="verification", headers={"List-Unsubscribe": "<https://x>"})
    req = calls[0]
    assert str(req.url) == "https://api.zeptomail.eu/v1.1/email" and req.headers["Authorization"] == "Zoho-enczapikey jeton-test"
    body = json.loads(req.content)
    assert body["from"] == {"address": "no-reply@duomatch.test", "name": "Crushduo"} and body["to"] == [{"email_address": {"address": to}}]
    assert body["subject"] == "Code" and body["textbody"] == "Corps" and body["htmlbody"] == "<p>Corps</p>" and body["mime_headers"] == {"List-Unsubscribe": "<https://x>"}

    calls.clear()  # marketing sans Brevo : rien ne part par ZeptoMail
    assert await mail.send(to, "Newsletter", "x", kind="newsletter") is False and calls == []

    brevo = []

    async def fake_brevo(to, subject, text, html=None, headers=None):
        brevo.append(subject)
    monkeypatch.setattr(mail, "_send_brevo", fake_brevo)
    monkeypatch.setattr(st, "brevo_api_key", "xkeysib-test")
    sup = await member(app, db)
    await set_role(sup.id, "SUPER_ADMIN")
    r = await sup.agent.put("/api/admin/emails/provider", json={"provider": "zeptomail"})
    assert r.status_code == 200 and r.json()["active"] == "zeptomail" and r.json()["configured"]["zeptomail"] is True
    calls.clear()
    assert await mail.send(to, "Envoi groupé", "x", kind="broadcast") and brevo == ["Envoi groupé"] and calls == []
    assert await mail.send(to, "Lien", "x", kind="magic_link") and len(calls) == 1 and brevo == ["Envoi groupé"]
    assert (await sup.agent.put("/api/admin/emails/provider", json={"provider": "auto"})).status_code == 200
    mail_config.invalidate()

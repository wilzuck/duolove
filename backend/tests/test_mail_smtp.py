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
    monkeypatch.setattr(st, "mail_from", "DuoMatch <no-reply@duomatch.test>")
    await mail.send("a@b.test", "Sujet", "Corps")
    assert len(calls) == 1
    req = calls[0]
    assert req.url == "https://api.brevo.com/v3/smtp/email" and req.headers["api-key"] == "xkeysib-test"
    import json
    body = json.loads(req.content)
    assert body["sender"] == {"email": "no-reply@duomatch.test", "name": "DuoMatch"}
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
    for raw in ('DuoMatch <no-reply@duomatch.test>', '"DuoMatch <no-reply@duomatch.test>"', "'DuoMatch <no-reply@duomatch.test>'", "  no-reply@duomatch.test "):
        monkeypatch.setattr(st, "mail_from", raw)
        name, addr = mail.sender()
        assert addr == "no-reply@duomatch.test", raw
    monkeypatch.setattr(st, "mail_from", "DuoMatch")
    with pytest.raises(RuntimeError, match="MAIL_FROM invalide"):
        mail.sender()

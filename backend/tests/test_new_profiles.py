"""E-mail « De nouveaux profils pour vous » : sélection et exclusions, fréquence réglée dans l'admin, consentement, pas de double envoi, ZeptoMail jamais."""
import asyncio
import datetime

import pytest_asyncio

from sqlalchemy import select, update

from app.core import mail, mail_config, newprofiles, notifications
from app.core.ids import utcnow
from app.db.session import session_maker
from app.models.models import Block, EmailLog, NotificationPreference, Preference, Profile, ProfilePhoto, Swipe, SystemSetting, User
from tests.helpers import login, seed_member, uid
from tests.support_c import Member, admin


@pytest_asyncio.fixture(autouse=True)
async def enabled():
    """L'envoi est désactivé par défaut : ces tests l'activent (une semaine), puis remettent le réglage précédent."""
    async with session_maker()() as s:
        row = await s.get(SystemSetting, newprofiles.KEY)
        before = dict(row.value) if row else None
        await newprofiles.set_frequency(s, {"enabled": True, "unit": "days", "every": 7})
    yield
    async with session_maker()() as s:
        row = await s.get(SystemSetting, newprofiles.KEY)
        if before is None:
            await s.delete(row)
        else:
            row.value = before
        await s.commit()
    newprofiles.invalidate()


async def person(app, db, *, country: str, gender: str = "MAN", age: int = 28, verified: bool = False, onboarded_days_ago: float = 0, seeking: str | None = None,
                 agent: bool = False) -> Member:
    """Membre complet dans un pays à part (les tests ne se voient pas entre eux), inscrit il y a `onboarded_days_ago` jours."""
    seeking = seeking or ("WOMEN" if gender == "MAN" else "MEN")
    m = await seed_member(db, gender=gender, seeking=seeking, city=f"V-{uid()}", country=country, age=age, verified=verified, name=f"P{uid()}")
    if onboarded_days_ago:
        async with session_maker()() as s:
            await s.execute(update(Profile).where(Profile.userId == m["id"]).values(onboardedAt=utcnow() - datetime.timedelta(days=onboarded_days_ago)))
            await s.commit()
    return Member(m["id"], m["email"], await login(app, m["email"]) if agent else None)


async def set_rows(model, user_id: str, **values):
    async with session_maker()() as s:
        await s.execute(update(model).where(model.userId == user_id).values(**values))
        await s.commit()


async def opt_in(user_id: str, consent: bool = True, **prefs):
    async with session_maker()() as s:
        await s.execute(update(User).where(User.id == user_id).values(marketingConsent=consent))
        if prefs:
            await s.execute(update(NotificationPreference).where(NotificationPreference.userId == user_id).values(**prefs))
        await s.commit()


def np_mail(email: str):
    return [m for m in mail.outbox if m["to"] == email and "nouveaux profils pour vous" in m["subject"]]


def country() -> str:
    return f"Z{uid()}"


async def run(now=None) -> int:
    async with session_maker()() as s:
        return await newprofiles.run_all(s, now)


async def test_selection_criteres_et_exclusions(app, db):
    c = country()
    w = await person(app, db, country=c, gender="WOMAN", age=28)
    await set_rows(Preference, w.id, ageMin=25, ageMax=35)
    ok_verified = await person(app, db, country=c, age=30, verified=True, onboarded_days_ago=3)
    ok_recent = await person(app, db, country=c, age=29)
    ok_older = await person(app, db, country=c, age=31, onboarded_days_ago=5)
    excluded = {
        "femme": await person(app, db, country=c, gender="WOMAN", seeking="WOMEN"),
        "trop âgé": await person(app, db, country=c, age=50),
        "autre pays": await person(app, db, country=country()),
        "ancien": await person(app, db, country=c, onboarded_days_ago=30),
        "sans photo approuvée": await person(app, db, country=c),
        "caché": await person(app, db, country=c),
        "mode discret": await person(app, db, country=c),
        "en pause": await person(app, db, country=c),
        "bloqué par moi": await person(app, db, country=c),
        "m'a bloquée": await person(app, db, country=c),
        "déjà liké": await person(app, db, country=c),
        "déjà passé": await person(app, db, country=c),
        "suspendu": await person(app, db, country=c),
        "ne cherche pas de femme": await person(app, db, country=c, seeking="MEN"),
    }
    async with session_maker()() as s:
        pid = (await s.execute(select(Profile.id).where(Profile.userId == excluded["sans photo approuvée"].id))).scalar_one()
        await s.execute(update(ProfilePhoto).where(ProfilePhoto.profileId == pid).values(moderationStatus="PENDING"))
        await s.execute(update(Profile).where(Profile.userId == excluded["caché"].id).values(visibility="HIDDEN"))
        await s.execute(update(Profile).where(Profile.userId == excluded["mode discret"].id).values(incognito=True))
        await s.execute(update(Profile).where(Profile.userId == excluded["en pause"].id).values(pausedAt=utcnow(), pauseEndsAt=utcnow() + datetime.timedelta(days=3)))
        await s.execute(update(User).where(User.id == excluded["suspendu"].id).values(status="SUSPENDED"))
        s.add_all([Block(blockerId=w.id, blockedId=excluded["bloqué par moi"].id), Block(blockerId=excluded["m'a bloquée"].id, blockedId=w.id),
                   Swipe(giverId=w.id, targetId=excluded["déjà liké"].id, action="LIKE"), Swipe(giverId=w.id, targetId=excluded["déjà passé"].id, action="PASS")])
        await s.commit()
    async with session_maker()() as s:
        got = await newprofiles.pick(s, w.id, utcnow() - datetime.timedelta(days=7))
    ids = [g["userId"] for g in got]
    assert ids == [ok_verified.id, ok_recent.id, ok_older.id], {k: v.id for k, v in excluded.items() if v.id in ids}  # vérifiés d'abord, puis les plus récents
    first = got[0]
    assert first["age"] in (30, 31) and first["verified"] is True and first["city"].startswith("V-") and first["photo"].endswith("_t.webp")
    assert w.id not in ids


async def test_envoi_consentement_minimum_et_pas_de_double_envoi(app, db):
    newprofiles.invalidate()
    c = country()
    w = await person(app, db, country=c, gender="WOMAN")
    no_consent = await person(app, db, country=c, gender="WOMAN")
    unchecked = await person(app, db, country=c, gender="WOMAN")
    dormant = await person(app, db, country=c, gender="WOMAN")
    paused = await person(app, db, country=c, gender="WOMAN")
    await opt_in(w.id)
    await opt_in(no_consent.id, consent=False)
    await opt_in(unchecked.id, emailNewProfiles=False)
    await opt_in(dormant.id)
    async with session_maker()() as s:
        await s.execute(update(User).where(User.id == dormant.id).values(lastActiveAt=utcnow() - datetime.timedelta(days=90)))
        await s.commit()
    await opt_in(paused.id)
    await set_rows(Profile, paused.id, pausedAt=utcnow(), pauseEndsAt=utcnow() + datetime.timedelta(days=3))
    men = [await person(app, db, country=c) for _ in range(2)]
    # Deux nouvelles personnes seulement : pas d'e-mail (il en faut 3), et l'échéance est consommée.
    await run()
    assert not np_mail(w.email)
    # Une troisième arrive ; l'échéance suivante (une semaine plus tard) part, avec les trois (depuis le début de la période, aucun envoi réel avant).
    men.append(await person(app, db, country=c))
    await run()
    assert not np_mail(w.email)  # même échéance : rien
    await set_rows(NotificationPreference, w.id, lastNewProfilesAt=utcnow() - datetime.timedelta(days=7))
    await run()
    sent = np_mail(w.email)
    assert len(sent) == 1, sent
    m = sent[0]
    assert m["subject"].startswith("3 nouveaux profils") and "/notifications-unsubscribe?token=" in m["text"] and "/discover" in m["text"]
    assert "Voir dans Découvrir" in m["html"] and "_t.webp" in m["html"] and "chaque semaine" in m["html"]
    for other in (no_consent, unchecked, dormant, paused):
        assert not np_mail(other.email), other.email
    log = (await db.execute(select(EmailLog.kind, EmailLog.status).where(EmailLog.toEmail == w.email))).all()
    assert ("new_profiles", "SENT") in [(k, s) for k, s in log]
    # Deuxième passage : rien de plus ; même échéance rouverte, plus personne de nouveau depuis le dernier envoi réel.
    await run()
    await set_rows(NotificationPreference, w.id, lastNewProfilesAt=utcnow() - datetime.timedelta(days=7))
    await run()
    assert len(np_mail(w.email)) == 1
    # Le lien de désabonnement coupe cet e-mail (et les offres).
    async with session_maker()() as s:
        assert await notifications.unsubscribe_emails(s, notifications.unsub_token(w.id))
        p = (await s.execute(select(NotificationPreference).where(NotificationPreference.userId == w.id))).scalar_one()
        assert p.emailNewProfiles is False and (await s.get(User, w.id)).marketingConsent is False


async def test_deux_instances_en_meme_temps_un_seul_envoi(app, db):
    newprofiles.invalidate()
    c = country()
    w = await person(app, db, country=c, gender="WOMAN")
    await opt_in(w.id)
    for _ in range(4):
        await person(app, db, country=c)
    now = utcnow()

    async def instance():
        async with session_maker()() as s:
            return await newprofiles.run_all(s, now)
    await asyncio.gather(instance(), instance())
    assert len(np_mail(w.email)) == 1


async def test_essentiels_uniquement_et_jamais_zeptomail(app, db, monkeypatch):
    newprofiles.invalidate()
    c = country()
    w = await person(app, db, country=c, gender="WOMAN")
    await opt_in(w.id)
    for _ in range(3):
        await person(app, db, country=c)
    async with session_maker()() as s:
        row = await s.get(SystemSetting, mail_config.ESSENTIAL_KEY)
        if row:
            row.value = {"enabled": True}
        else:
            s.add(SystemSetting(key=mail_config.ESSENTIAL_KEY, value={"enabled": True}))
        await s.commit()
    mail_config.invalidate_essential()
    try:
        await run()
    finally:
        async with session_maker()() as s:
            (await s.get(SystemSetting, mail_config.ESSENTIAL_KEY)).value = {"enabled": False}
            await s.commit()
        mail_config.invalidate_essential()
    assert not np_mail(w.email)
    rows = (await db.execute(select(EmailLog.kind, EmailLog.status).where(EmailLog.toEmail == w.email))).all()
    assert rows == [("new_profiles", "SKIPPED")]
    assert not mail_config.is_essential("new_profiles")
    monkeypatch.setattr(mail_config, "configured", lambda: {"brevo": True, "zeptomail": True, "smtp": False})
    assert mail_config.for_kind("zeptomail", "new_profiles") == "brevo"
    monkeypatch.setattr(mail_config, "configured", lambda: {"brevo": False, "zeptomail": True, "smtp": False})
    assert mail_config.for_kind("zeptomail", "new_profiles") == "none"


def test_frequence_periodes_et_fenetre():
    now = datetime.datetime(2026, 3, 31, 18, 0)
    assert newprofiles.period_start({"unit": "day", "every": 1}, now) == datetime.datetime(2026, 3, 30, 18, 0)
    assert newprofiles.period_start({"unit": "days", "every": 7}, now) == datetime.datetime(2026, 3, 24, 18, 0)
    assert newprofiles.period_start({"unit": "months", "every": 1}, now) == datetime.datetime(2026, 2, 28, 18, 0)
    assert newprofiles.period_start({"unit": "months", "every": 12}, now) == datetime.datetime(2025, 3, 31, 18, 0)
    # « Tous les jours » : un envoi d'hier à 22 h laisse repartir aujourd'hui dès 17 h ; jamais deux fois le même jour.
    daily = {"unit": "day", "every": 1}
    today = datetime.datetime(2026, 11, 17, 17, 5)
    assert datetime.datetime(2026, 11, 16, 22, 50) < newprofiles.due_before(daily, today)
    assert not datetime.datetime(2026, 11, 17, 17, 0) < newprofiles.due_before(daily, datetime.datetime(2026, 11, 17, 22, 55))
    # Depuis quand : dernier envoi réel, borné à deux périodes ; sinon une période.
    w = {"unit": "days", "every": 7}
    assert newprofiles.since_for(w, now, None) == now - datetime.timedelta(days=7)
    assert newprofiles.since_for(w, now, now - datetime.timedelta(days=10)) == now - datetime.timedelta(days=10)
    assert newprofiles.since_for(w, now, now - datetime.timedelta(days=60)) == now - datetime.timedelta(days=14)
    # Jamais le dimanche (résumé hebdomadaire), de 17 h à 23 h UTC.
    assert not newprofiles.in_send_window(datetime.datetime(2026, 11, 15, 18, 0))  # dimanche
    assert newprofiles.in_send_window(datetime.datetime(2026, 11, 16, 17, 0)) and not newprofiles.in_send_window(datetime.datetime(2026, 11, 16, 16, 59))
    assert not newprofiles.in_send_window(datetime.datetime(2026, 11, 16, 23, 0))
    assert newprofiles.validate({"unit": "day", "every": 9}) == {"enabled": False, "unit": "day", "every": 1}
    for bad in ({"unit": "days", "every": 1}, {"unit": "days", "every": 31}, {"unit": "months", "every": 13}, {"unit": "weeks", "every": 2}, {"unit": "days", "every": True}, {"unit": "days", "every": 7, "enabled": "oui"}, None):
        try:
            newprofiles.validate(bad)
        except Exception as e:  # noqa: BLE001
            assert getattr(e, "status", None) == 400, bad
        else:
            raise AssertionError(bad)


async def test_frequence_mensuelle_appliquee_a_l_envoi(app, db):
    newprofiles.invalidate()
    c = country()
    w = await person(app, db, country=c, gender="WOMAN")
    await opt_in(w.id)
    for _ in range(3):
        await person(app, db, country=c)
    freq = {"enabled": True, "unit": "months", "every": 2}
    await opt_in(w.id, lastNewProfilesAt=utcnow() - datetime.timedelta(days=40))  # moins de deux mois : pas encore
    async with session_maker()() as s:
        assert await newprofiles.run_once(s, freq=freq) in (-1, 0)
    assert not np_mail(w.email)
    await opt_in(w.id, lastNewProfilesAt=utcnow() - datetime.timedelta(days=62))
    async with session_maker()() as s:
        while await newprofiles.run_once(s, freq=freq) >= 0:
            pass
    assert len(np_mail(w.email)) == 1 and "tous les 2 mois" in np_mail(w.email)[0]["html"]


async def test_api_admin_et_case_du_membre(app, db):
    adm = await admin(app, db)
    try:
        v = (await adm.agent.get("/api/admin/emails/new-profiles")).json()
        assert v["default"] == {"enabled": False, "unit": "days", "every": 7} and v["limits"]["days"] == {"min": 2, "max": 30} and v["limits"]["months"] == {"min": 1, "max": 12}
        r = await adm.agent.put("/api/admin/emails/new-profiles", json={"enabled": True, "unit": "months", "every": 3})
        assert r.status_code == 200 and r.json()["frequency"] == {"enabled": True, "unit": "months", "every": 3}
        assert (await adm.agent.put("/api/admin/emails/new-profiles", json={"unit": "days", "every": 45})).status_code == 400
        assert (await adm.agent.put("/api/admin/emails/new-profiles", json={"enabled": True, "unit": "day"})).json()["frequency"] == {"enabled": True, "unit": "day", "every": 1}
        async with session_maker()() as s:
            assert await newprofiles.frequency(s) == {"enabled": True, "unit": "day", "every": 1}
        u = await person(app, db, country=country(), gender="WOMAN", agent=True)
        assert (await u.agent.get("/api/admin/emails/new-profiles")).status_code == 403
        assert (await u.agent.put("/api/admin/emails/new-profiles", json={"unit": "day"})).status_code == 403
        prefs = (await u.agent.get("/api/notifications/preferences")).json()
        assert prefs["emailNewProfiles"] is True  # activée par défaut (n'envoie qu'aux membres ayant accepté les offres)
        assert (await u.agent.put("/api/notifications/preferences", json={"emailNewProfiles": False})).json()["emailNewProfiles"] is False
    finally:
        newprofiles.invalidate()


async def test_rien_ne_part_tant_que_l_admin_n_a_pas_active(app, db):
    c = country()
    w = await person(app, db, country=c, gender="WOMAN")
    await opt_in(w.id)
    for _ in range(3):
        await person(app, db, country=c)
    async with session_maker()() as s:
        await newprofiles.set_frequency(s, {"unit": "days", "every": 7})  # sans « enabled » : désactivé
        assert (await newprofiles.frequency(s))["enabled"] is False
    assert await run() == 0
    assert not np_mail(w.email)
    p = (await db.execute(select(NotificationPreference.lastNewProfilesAt).where(NotificationPreference.userId == w.id))).scalar_one()
    assert p is None  # aucune échéance consommée : à l'activation, le membre reçoit bien son premier e-mail
    async with session_maker()() as s:
        await newprofiles.set_frequency(s, {"enabled": True, "unit": "days", "every": 7})
    await run()
    assert len(np_mail(w.email)) == 1

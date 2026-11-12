"""Résumé hebdomadaire : chiffres de la semaine, consentement, un seul envoi par semaine, désabonnement, blocage, inactifs."""
import datetime

from sqlalchemy import select, update

from app.core import digest, mail, notifications
from app.core.ids import utcnow
from app.db.session import session_maker
from app.models.models import Block, NotificationPreference, ProfileVisit, User
from tests.support_c import matched, member


async def visit(visitor_id: str, visited_id: str, days_ago: float = 1):
    async with session_maker()() as s:
        s.add(ProfileVisit(viewerId=visitor_id, visitedId=visited_id, visits=1, lastVisitAt=utcnow() - datetime.timedelta(days=days_ago)))
        await s.commit()


async def opt_in(user_id: str, **over):
    async with session_maker()() as s:
        await s.execute(update(User).where(User.id == user_id).values(marketingConsent=over.pop("consent", True), **({"lastActiveAt": over.pop("active")} if "active" in over else {})))
        if over:
            await s.execute(update(NotificationPreference).where(NotificationPreference.userId == user_id).values(**over))
        await s.commit()


def digest_mail(email: str):
    return [m for m in mail.outbox if m["to"] == email and m["subject"].startswith("Votre semaine sur Crushduo")]


async def test_chiffres_de_la_semaine_groupes_et_filtres(app, db):
    w, m, conv = await matched(app, db)  # un duo tout neuf ; m écrit à w (non lu)
    await m.agent.post(f"/api/conversations/{conv}/messages", json={"body": "Salut, belle journée !"})
    v1, v2, old, blocked = [await member(app, db) for _ in range(4)]
    await visit(v1.id, w.id)
    await visit(v2.id, w.id)
    await visit(old.id, w.id, days_ago=10)  # hors de la semaine
    await visit(blocked.id, w.id)
    async with session_maker()() as s:
        s.add(Block(blockerId=w.id, blockedId=blocked.id))
        await s.commit()
    liker = await member(app, db)
    await liker.agent.post("/api/swipes", json={"targetId": w.id, "action": "LIKE"})  # like auquel w n'a pas répondu
    async with session_maker()() as s:
        got = await digest.collect(s, [w.id, m.id], utcnow() - digest.WINDOW)
    c = got[w.id]
    assert c == {"visits": 2, "likes": 1, "duos": 1, "unread": 1}, c
    assert got[m.id]["unread"] == 0 and got[m.id]["duos"] == 1  # l'expéditeur n'a rien de non lu


async def test_envoi_unique_par_semaine_avec_consentement_et_desabonnement(app, db):
    w, m, conv = await matched(app, db)
    await visit((await member(app, db)).id, w.id)
    await opt_in(w.id)
    quiet = await member(app, db)           # accepte les offres mais a coupé le résumé
    no_consent = await member(app, db)      # n'a pas accepté les offres
    dormant = await member(app, db)         # inactif depuis 90 jours
    nothing = await member(app, db)         # rien à dire cette semaine
    for who, over in ((quiet, {"emailWeekly": False}), (no_consent, {"consent": False}), (dormant, {"active": utcnow() - datetime.timedelta(days=90)}), (nothing, {})):
        await visit((await member(app, db)).id, who.id) if who is not nothing else None
        await opt_in(who.id, **over)
    async with session_maker()() as s:
        await digest.run_all(s)
    assert len(digest_mail(w.email)) == 1
    body = digest_mail(w.email)[0]
    assert "personne a consulté votre profil" in body["text"] and "Ne plus recevoir ce résumé" in body["text"] and "/notifications-unsubscribe?token=" in body["text"]
    assert "Premium vous montre" in body["html"]  # membre gratuit : invitation, pas de noms
    for other in (quiet, no_consent, dormant, nothing):
        assert not digest_mail(other.email), other.email
    # Deuxième passage la même semaine : rien de plus.
    async with session_maker()() as s:
        await digest.run_all(s)
    assert len(digest_mail(w.email)) == 1
    # Une semaine plus tard (+7 jours) : de nouveau éligible.
    async with session_maker()() as s:
        await s.execute(update(NotificationPreference).where(NotificationPreference.userId == w.id).values(lastDigestAt=utcnow() - datetime.timedelta(days=7)))
        await s.commit()
    async with session_maker()() as s:
        await digest.run_all(s)
    assert len(digest_mail(w.email)) == 2
    # Le lien de désabonnement coupe le résumé (et les offres).
    token = notifications.unsub_token(w.id)
    async with session_maker()() as s:
        assert await notifications.unsubscribe_emails(s, token)
        p = (await s.execute(select(NotificationPreference).where(NotificationPreference.userId == w.id))).scalar_one()
        assert p.emailWeekly is False and (await s.get(User, w.id)).marketingConsent is False
        await s.execute(update(NotificationPreference).where(NotificationPreference.userId == w.id).values(lastDigestAt=None))
        await s.commit()
    async with session_maker()() as s:
        await digest.run_all(s)
    assert len(digest_mail(w.email)) == 2


async def test_reglage_du_membre_et_fenetre_d_envoi(app, db):
    u = await member(app, db)
    prefs = (await u.agent.get("/api/notifications/preferences")).json()
    assert prefs["emailWeekly"] is True  # activé par défaut (mais n'envoie qu'aux membres ayant accepté les offres)
    assert (await u.agent.put("/api/notifications/preferences", json={"emailWeekly": False})).json()["emailWeekly"] is False
    sunday = datetime.datetime(2026, 11, 15, 17, 30)
    assert sunday.weekday() == 6 and digest.in_send_window(sunday)
    assert not digest.in_send_window(datetime.datetime(2026, 11, 15, 16, 59)) and not digest.in_send_window(datetime.datetime(2026, 11, 15, 23, 0))
    assert not digest.in_send_window(datetime.datetime(2026, 11, 16, 18, 0))  # lundi

"""Phase 2 communication : réactions, réponses à un message précis, brise-glace pilotés par l'admin, indicateur de saisie facultatif."""
import pytest
from sqlalchemy import delete, insert, select, update

from app.core import appsettings, flags as flags_core, realtime
from app.core.constants import REACTION_EMOJIS
from app.db.session import session_maker
from app.models.models import FeatureFlag, IcebreakerTemplate, Interest, Message, Profile, SystemSetting, t_UserInterest
from tests.helpers import new_agent, uid
from tests.support_c import Member, admin, member


@pytest.fixture(autouse=True)
async def _clean(app):
    async def wipe():
        async with session_maker()() as s:
            await s.execute(delete(SystemSetting).where(SystemSetting.key.in_(appsettings.KEYS)))
            await s.execute(delete(FeatureFlag))
            await s.commit()
        appsettings.invalidate()
        flags_core.invalidate()

    await wipe()
    yield
    await wipe()


def code(r):
    return (r.json().get("error") or {}).get("code")


async def give_interests(user_id: str, slugs: list[str]) -> None:
    async with session_maker()() as s:
        have = {i.slug: i.id for i in (await s.execute(select(Interest))).scalars()}
        for slug in slugs:
            if slug not in have:
                i = Interest(slug=slug)
                s.add(i)
                await s.flush()
                have[slug] = i.id
        await s.execute(delete(t_UserInterest).where(t_UserInterest.c.userId == user_id))
        for slug in slugs:
            await s.execute(insert(t_UserInterest).values(userId=user_id, interestId=have[slug]))
        await s.commit()


async def matched(app, db) -> tuple[Member, Member, str]:
    city = f"C-{uid()}"
    w, m = await member(app, db, city=city), await member(app, db, city=city, gender="MAN")
    await w.agent.post("/api/swipes", json={"targetId": m.id, "action": "LIKE"})
    r = await m.agent.post("/api/swipes", json={"targetId": w.id, "action": "LIKE"})
    return w, m, r.json()["match"]["conversationId"]


async def say(a: Member, conv: str, body: str, **kw) -> dict:
    r = await a.agent.post(f"/api/conversations/{conv}/messages", json={"body": body, **kw})
    assert r.status_code == 201, r.text
    return r.json()


async def messages(a: Member, conv: str) -> list[dict]:
    return (await a.agent.get(f"/api/conversations/{conv}/messages")).json()["items"]


# ───────── réactions ─────────
async def test_reactions_replace_remove_and_are_seen_per_viewer(app, db):
    w, m, conv = await matched(app, db)
    msg = await say(w, conv, "Salut, belle journée !")
    r = await m.agent.put(f"/api/messages/{msg['id']}/reaction", json={"emoji": "❤️"})
    assert r.status_code == 200 and r.json()["reactions"] == [{"emoji": "❤️", "count": 1, "mine": True}]
    await w.agent.put(f"/api/messages/{msg['id']}/reaction", json={"emoji": "😂"})
    seen_w = next(x for x in await messages(w, conv) if x["id"] == msg["id"])["reactions"]
    assert {(x["emoji"], x["mine"]) for x in seen_w} == {("❤️", False), ("😂", True)}
    # Remplacer sa réaction : une seule par membre.
    r = await m.agent.put(f"/api/messages/{msg['id']}/reaction", json={"emoji": "👍"})
    assert [x["emoji"] for x in r.json()["reactions"] if x["mine"]] == ["👍"] and sum(x["count"] for x in r.json()["reactions"]) == 2
    assert (await m.agent.delete(f"/api/messages/{msg['id']}/reaction")).json()["reactions"] == [{"emoji": "😂", "count": 1, "mine": False}]
    assert (await m.agent.delete(f"/api/messages/{msg['id']}/reaction")).status_code == 200  # idempotent


async def test_reactions_rules(app, db):
    w, m, conv = await matched(app, db)
    msg = await say(w, conv, "Un message à réagir")
    outsider = await member(app, db)
    put = lambda a, mid, e: a.agent.put(f"/api/messages/{mid}/reaction", json={"emoji": e})  # noqa: E731
    assert code(await put(m, msg["id"], "💩")) == "INVALID_REACTION" and "🔥" in REACTION_EMOJIS
    assert (await put(outsider, msg["id"], "❤️")).status_code == 404  # ne révèle pas l'existence
    assert (await put(m, "inconnu", "❤️")).status_code == 404
    assert (await new_agent(app).put(f"/api/messages/{msg['id']}/reaction", json={"emoji": "❤️"})).status_code == 401
    await put(m, msg["id"], "❤️")
    assert (await w.agent.delete(f"/api/messages/{msg['id']}")).status_code == 200  # message supprimé : plus de réaction ni d'affichage
    assert (await put(m, msg["id"], "❤️")).status_code == 404
    assert next(x for x in await messages(m, conv) if x["id"] == msg["id"])["reactions"] == []
    # Après blocage, la conversation est fermée aux réactions.
    live = await say(w, conv, "Autre message")
    assert (await m.agent.post(f"/api/blocks/{w.id}")).status_code == 200
    assert code(await put(m, live["id"], "❤️")) in ("CONVERSATION_CLOSED", "CONVERSATION_NOT_FOUND") or (await put(m, live["id"], "❤️")).status_code in (403, 404)


# ───────── réponses à un message ─────────
async def test_reply_to_a_specific_message(app, db):
    w, m, conv = await matched(app, db)
    first = await say(w, conv, "Tu viens d'où exactement ?")
    reply = await say(m, conv, "De Lomé, et toi ?", replyToId=first["id"])
    assert reply["replyTo"] == {"id": first["id"], "mine": False, "deleted": False, "body": "Tu viens d'où exactement ?", "hasImage": False}
    seen = next(x for x in await messages(w, conv) if x["id"] == reply["id"])
    assert seen["replyTo"]["mine"] is True and seen["replyTo"]["body"].startswith("Tu viens")
    # Une réponse ne peut citer qu'un message de la même conversation.
    w2, m2, conv2 = await matched(app, db)
    other = await say(w2, conv2, "Message d'une autre conversation")
    r = await m.agent.post(f"/api/conversations/{conv}/messages", json={"body": "Hors sujet", "replyToId": other["id"]})
    assert code(r) == "INVALID_REPLY"
    # Le message cité supprimé n'est plus affiché dans la citation.
    await w.agent.delete(f"/api/messages/{first['id']}")
    cited = next(x for x in await messages(m, conv) if x["id"] == reply["id"])["replyTo"]
    assert cited["deleted"] is True and cited["body"] is None


async def test_reactions_and_replies_flags(app, db):
    a = await admin(app, db)
    w, m, conv = await matched(app, db)
    msg = await say(w, conv, "Un message pour tester")
    await m.agent.put(f"/api/messages/{msg['id']}/reaction", json={"emoji": "❤️"})
    reply = await say(m, conv, "Ma réponse", replyToId=msg["id"])
    await a.agent.put("/api/admin/feature-flags/message_reactions", json={"enabled": False})
    await a.agent.put("/api/admin/feature-flags/message_replies", json={"enabled": False})
    assert code(await m.agent.put(f"/api/messages/{msg['id']}/reaction", json={"emoji": "👍"})) == "FEATURE_DISABLED"
    assert code(await m.agent.post(f"/api/conversations/{conv}/messages", json={"body": "Encore", "replyToId": msg["id"]})) == "FEATURE_DISABLED"
    shown = {x["id"]: x for x in await messages(w, conv)}
    assert shown[msg["id"]]["reactions"] == [] and shown[reply["id"]]["replyTo"] is None  # masqués, pas supprimés
    assert (await m.agent.post(f"/api/conversations/{conv}/messages", json={"body": "Un message simple"})).status_code == 201  # la messagerie continue
    await a.agent.put("/api/admin/feature-flags/message_reactions", json={"enabled": True})
    assert next(x for x in await messages(w, conv) if x["id"] == msg["id"])["reactions"][0]["emoji"] == "❤️"


# ───────── brise-glace ─────────
async def test_icebreakers_use_only_shared_info_and_never_send(app, db):
    w, m, conv = await matched(app, db)
    from tests.helpers import make_premium

    await make_premium(w.id)  # idées de messagerie : réservées aux formules qui les incluent
    await make_premium(m.id)
    await give_interests(w.id, ["cooking", "travel", "music"])
    await give_interests(m.id, ["cooking", "travel", "sport"])
    res = (await w.agent.get(f"/api/conversations/{conv}/icebreakers")).json()
    assert res["basedOn"]["commonInterests"] == ["cooking", "travel"] and len(res["items"]) == 3
    texts = " ".join(i["text"] for i in res["items"])
    assert "sport" not in texts.lower() and "musique" not in texts.lower()  # un intérêt non partagé n'apparaît jamais
    assert {i["kind"] for i in res["items"]} <= {"INTEREST", "INTENT", "GENERIC"}
    assert sum(i["kind"] == "INTEREST" for i in res["items"]) == 2  # les sujets communs d'abord
    en = (await w.agent.get(f"/api/conversations/{conv}/icebreakers?locale=en")).json()["items"]
    assert any("travelling" in i["text"] or "cook" in i["text"] for i in en)
    async with session_maker()() as s:
        assert (await s.execute(select(Message.id).where(Message.conversationId == conv))).first() is None  # aucun envoi automatique


async def test_icebreakers_without_common_ground_are_neutral_and_regenerable(app, db):
    w, m, conv = await matched(app, db)
    from tests.helpers import make_premium

    await make_premium(w.id)  # idées de messagerie : réservées aux formules qui les incluent
    await make_premium(m.id)
    await give_interests(w.id, ["music"])
    await give_interests(m.id, ["sport"])
    async with session_maker()() as s:
        await s.execute(update(Profile).where(Profile.userId == w.id).values(intent="SERIOUS"))
        await s.execute(update(Profile).where(Profile.userId == m.id).values(intent="FRIENDSHIP"))
        await s.commit()
    one = (await w.agent.get(f"/api/conversations/{conv}/icebreakers")).json()
    assert one["basedOn"] == {"commonInterests": [], "sameIntent": False} and all(i["kind"] == "GENERIC" for i in one["items"])
    sets = {tuple(i["id"] for i in (await w.agent.get(f"/api/conversations/{conv}/icebreakers?seed={n}")).json()["items"]) for n in range(8)}
    assert len(sets) > 1  # « autres idées » change la sélection
    stable = [(await w.agent.get(f"/api/conversations/{conv}/icebreakers?seed=3")).json()["items"] for _ in range(2)]
    assert stable[0] == stable[1]


async def test_icebreakers_access_count_flag_and_admin_templates(app, db):
    a = await admin(app, db)
    w, m, conv = await matched(app, db)
    from tests.helpers import make_premium

    await make_premium(w.id)  # idées de messagerie : réservées aux formules qui les incluent
    await make_premium(m.id)
    await give_interests(w.id, ["art"])
    await give_interests(m.id, ["art"])
    outsider = await member(app, db)
    await make_premium(outsider.id)  # le refus attendu est celui de la conversation (404), pas celui de la formule
    assert (await outsider.agent.get(f"/api/conversations/{conv}/icebreakers")).status_code == 404
    assert (await new_agent(app).get(f"/api/conversations/{conv}/icebreakers")).status_code == 401
    # Réglage admin du nombre de suggestions.
    await a.agent.patch("/api/admin/settings", json={"values": {"icebreakers.count": 1}})
    assert len((await w.agent.get(f"/api/conversations/{conv}/icebreakers")).json()["items"]) == 1
    assert code(await a.agent.patch("/api/admin/settings", json={"values": {"icebreakers.count": 6}})) == "INVALID_SETTING"
    # Modèles gérés par l'admin : RBAC, validation, désactivation.
    body = {"slug": f"art-{uid()}", "kind": "INTEREST", "key": "art", "textFr": "Quel musée me conseilles-tu ?", "textEn": "Which museum do you recommend?"}
    assert (await w.agent.post("/api/admin/icebreakers", json=body)).status_code == 403
    assert (await a.agent.post("/api/admin/icebreakers", json={**body, "key": "inconnu"})).status_code == 422 or (await a.agent.post("/api/admin/icebreakers", json={**body, "key": "inconnu"})).status_code == 400
    made = await a.agent.post("/api/admin/icebreakers", json=body)
    assert made.status_code == 201 and (await a.agent.post("/api/admin/icebreakers", json=body)).status_code == 409
    async with session_maker()() as s:  # ne garder que le modèle créé pour « art » : la sélection est alors déterministe
        await s.execute(update(IcebreakerTemplate).where(IcebreakerTemplate.id != made.json()["id"]).values(active=False))
        await s.commit()
    try:
        assert (await w.agent.get(f"/api/conversations/{conv}/icebreakers")).json()["items"][0]["text"] == "Quel musée me conseilles-tu ?"
        assert (await a.agent.patch(f"/api/admin/icebreakers/{made.json()['id']}", json={"active": False})).status_code == 200
        assert (await w.agent.get(f"/api/conversations/{conv}/icebreakers")).json()["items"] == []
    finally:
        async with session_maker()() as s:
            await s.execute(update(IcebreakerTemplate).values(active=True))
            await s.execute(update(IcebreakerTemplate).where(IcebreakerTemplate.id == made.json()["id"]).values(active=False))
            await s.commit()
    await a.agent.put("/api/admin/feature-flags/icebreakers", json={"enabled": False})
    assert code(await w.agent.get(f"/api/conversations/{conv}/icebreakers")) == "FEATURE_DISABLED"


# ───────── indicateur de saisie facultatif ─────────
async def test_typing_indicator_is_optional_and_reciprocal(app, db, monkeypatch):
    w, m, conv = await matched(app, db)
    sent: list[tuple[str, str]] = []

    async def fake_emit(user, event, data):
        sent.append((user, event))

    monkeypatch.setattr(realtime, "emit_to_user", fake_emit)
    realtime._sid_user["sid-w"] = w.id
    try:
        await realtime.typing("sid-w", {"conversationId": conv, "isTyping": True})
        assert sent == [(m.id, "typing")]  # activé par défaut
        sent.clear()
        assert (await m.agent.patch("/api/profiles/me/settings", json={"typingIndicator": False})).json()["typingIndicator"] is False
        await realtime.typing("sid-w", {"conversationId": conv, "isTyping": True})
        assert sent == []  # le récepteur l'a coupé : personne ne voit l'autre écrire
        await m.agent.patch("/api/profiles/me/settings", json={"typingIndicator": True})
        await w.agent.patch("/api/profiles/me/settings", json={"typingIndicator": False})
        await realtime.typing("sid-w", {"conversationId": conv, "isTyping": True})
        assert sent == []  # l'expéditeur l'a coupé : rien n'est envoyé
    finally:
        realtime._sid_user.pop("sid-w", None)


async def test_travel_destination_prompt_is_available(app, db):
    w = await member(app, db)
    cat = (await w.agent.get("/api/engagement/prompts")).json()["items"]
    assert any(p["slug"] == "travel-destination" and "destination" in p["textFr"] for p in cat)


# ───────── accusés de lecture : gestion réservée aux abonnés ─────────
async def test_read_receipts_control_is_a_premium_option(app, db):
    from app.core import entitlements
    from tests.helpers import make_premium

    w, m, conv = await matched(app, db)
    off = lambda a: a.agent.patch("/api/profiles/me/settings", json={"readReceipts": False})  # noqa: E731
    # Gratuit : impossible de désactiver ; les accusés restent envoyés ; le réglage est présenté comme verrouillé.
    assert code(await off(m)) == "PLAN_REQUIRED"
    me = (await m.agent.get("/api/profiles/me")).json()
    assert me["readReceipts"] is True and me["readReceiptsLocked"] is True
    assert (await m.agent.patch("/api/profiles/me/settings", json={"readReceipts": True})).status_code == 200  # rester actif reste permis
    # Premium : peut désactiver ; l'expéditeur ne voit alors plus « vu ».
    await make_premium(m.id)
    me = (await off(m)).json()
    assert me["readReceipts"] is False and me["readReceiptsLocked"] is False
    sent = await say(w, conv, "Tu as vu mon message ?")
    await m.agent.post(f"/api/conversations/{conv}/read")
    assert next(x for x in await messages(w, conv) if x["id"] == sent["id"])["readAt"] is None
    # Après résiliation : les accusés redeviennent actifs (le réglage n'est pas perdu, il est simplement suspendu).
    async with session_maker()() as s:
        await entitlements.set_(s, m.id, "FREE", None)
        await s.commit()
    assert (await m.agent.get("/api/profiles/me")).json()["readReceipts"] is True
    await m.agent.post(f"/api/conversations/{conv}/read")
    assert next(x for x in await messages(w, conv) if x["id"] == sent["id"])["readAt"] is not None


async def test_admin_can_grant_read_receipts_control_to_the_free_plan(app, db):
    a = await admin(app, db)
    _, free, _ = await matched(app, db)
    plans = (await a.agent.get("/api/admin/plans")).json()["plans"]
    feats = next(p for p in plans if p["code"] == "FREE")["features"]
    assert feats["read_receipts_control"] is False and next(p for p in plans if p["code"] == "PREMIUM")["features"]["read_receipts_control"] is True
    try:
        assert (await a.agent.patch("/api/admin/plans/FREE", json={"features": {**feats, "read_receipts_control": True}})).status_code == 200
        assert (await free.agent.patch("/api/profiles/me/settings", json={"readReceipts": False})).json()["readReceipts"] is False
    finally:
        await a.agent.patch("/api/admin/plans/FREE", json={"features": feats})
    assert (await free.agent.get("/api/profiles/me")).json()["readReceipts"] is True  # le réglage est suspendu avec la fonctionnalité

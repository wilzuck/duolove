"""Phase 1 engagement : réglages pilotés par l'admin, pondérations du matching, questions de personnalité, likes commentés, découvertes du jour."""
import datetime

import pytest
from sqlalchemy import delete, select, text, update

from app.core import appsettings, dailysvc, flags as flags_core, plan_config
from app.core.scoring import DEFAULT_WEIGHTS, ScoreSubject, SoftPrefs, score_candidate
from app.db.session import session_maker
from app.models.models import AuditLog, DailyRecommendation, FeatureFlag, Message, ProfilePrompt, SystemSetting, User
from tests.helpers import login, make_premium, new_agent, seed_member, uid
from tests.support_c import Member, admin, member


@pytest.fixture(autouse=True)
async def _clean(app):
    async def wipe():
        async with session_maker()() as s:
            await s.execute(delete(SystemSetting).where(SystemSetting.key.in_(appsettings.KEYS)))
            await s.execute(delete(FeatureFlag))
            for code_, n in (("FREE", 5), ("PREMIUM", 10), ("VIP", 10)):  # les quotas de formule réglés par un test ne doivent jamais fuiter vers les autres suites
                await s.execute(text("UPDATE \"SubscriptionPlan\" SET features = jsonb_set(features, '{daily_picks_count}', to_jsonb(CAST(:n AS int))) WHERE code = CAST(:c AS \"PlanCode\")"), {"n": n, "c": code_})
            await s.commit()
        appsettings.invalidate()
        flags_core.invalidate()
        plan_config.invalidate()

    await wipe()
    yield
    await wipe()


def code(r):
    return (r.json().get("error") or {}).get("code")


async def prompt_ids(a: Member, n: int) -> list[str]:
    return [p["id"] for p in (await a.agent.get("/api/engagement/prompts")).json()["items"]][:n]


async def answer(a: Member, n: int = 3, text: str = "Une réponse sincère"):
    ids = await prompt_ids(a, n)
    return await a.agent.put("/api/engagement/me/prompts", json={"items": [{"promptId": i, "answer": f"{text} {k}"} for k, i in enumerate(ids)]})


async def pair(app, db, *, men: int = 1):
    """Une femme et `men` hommes de la même ville, réciproquement compatibles."""
    city = f"E-{uid()}"
    w = await member(app, db, city=city)
    ms = [await member(app, db, city=city, gender="MAN") for _ in range(men)]
    return w, ms


# ───────── réglages admin ─────────
async def test_settings_admin_only_validated_and_audited(app, db):
    a, u = await admin(app, db), await member(app, db)
    assert (await u.agent.get("/api/admin/settings")).status_code == 403
    assert (await new_agent(app).patch("/api/admin/settings", json={"values": {"daily.cooldown_days": 3}})).status_code == 401
    cur = (await a.agent.get("/api/admin/settings")).json()
    assert cur["values"]["matching.weights"] == DEFAULT_WEIGHTS and cur["values"]["daily.cooldown_days"] == 14
    assert code(await a.agent.patch("/api/admin/settings", json={"values": {"matching.weights": {**DEFAULT_WEIGHTS, "intent": 40}}})) == "WEIGHTS_SUM"
    assert code(await a.agent.patch("/api/admin/settings", json={"values": {"daily.cooldown_days": 91}})) == "INVALID_SETTING"
    assert code(await a.agent.patch("/api/admin/settings", json={"values": {"inconnu": 1}})) == "UNKNOWN_SETTING"
    assert code(await a.agent.patch("/api/admin/settings", json={"values": {"prompts.min": 5, "prompts.max": 3}})) == "INVALID_SETTING"
    ok = await a.agent.patch("/api/admin/settings", json={"values": {"daily.cooldown_days": 3, "matching.weights": {"intent": 10, "mutual": 10, "interests": 40, "location": 30, "other": 10}}})
    assert ok.status_code == 200 and ok.json()["values"]["daily.cooldown_days"] == 3
    assert (await a.agent.get("/api/admin/settings")).json()["values"]["matching.weights"]["interests"] == 40
    async with session_maker()() as s:
        assert (await s.execute(select(AuditLog.id).where(AuditLog.actorId == a.id, AuditLog.action == "settings.update"))).first()


def test_weights_change_the_score_and_reasons_explain():
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    me = ScoreSubject("SERIOUS", ["music", "travel", "art"], ["fr"], "Lomé", "TG", now, 80, False)
    other = ScoreSubject("SERIOUS", ["music", "travel"], ["fr"], "Accra", "GH", now, 80, True)
    base = score_candidate(me, other, None)
    interest_heavy = score_candidate(me, other, None, weights={"intent": 0, "mutual": 0, "interests": 100, "location": 0, "other": 0})
    location_heavy = score_candidate(me, other, None, weights={"intent": 0, "mutual": 0, "interests": 0, "location": 100, "other": 0})
    assert interest_heavy.compatibility == 40 and location_heavy.compatibility == 0 and base.compatibility != interest_heavy.compatibility
    codes = [r["code"] for r in base.reasons]
    assert "interests_common" in codes and "intent_same" in codes and base.common_interests == ["music", "travel"]
    assert score_candidate(me, other, None, weights={"intent": 1, "mutual": 1, "interests": 1, "location": 1, "other": 1}).compatibility <= 100  # poids normalisés
    # Préférences facultatives non satisfaites des deux côtés : moins de « préférences mutuelles ».
    strict = score_candidate(me, other, None, viewer_prefs=SoftPrefs(languages=["en"]), cand_prefs=SoftPrefs(intents=["FRIENDSHIP"]))
    assert strict.breakdown["mutual"] < base.breakdown["mutual"]


async def test_feed_exposes_explainable_affinity_without_private_data(app, db):
    w, (m,) = await pair(app, db)
    item = next(i for i in (await w.agent.get("/api/discovery?limit=30")).json()["items"] if i["id"] == m.id)
    aff = item["affinity"]
    assert 0 <= aff["score"] <= 100 and item["compatibility"] == aff["score"] and aff["reasons"] and "code" in aff["reasons"][0]
    assert not any(k in item for k in ("email", "approxLat", "approxLng", "birthDate"))
    # La page profil expose la même explication ; son propre profil n'en a pas.
    assert (await w.agent.get(f"/api/profiles/{m.id}")).json()["affinity"]["score"] >= 0
    assert (await w.agent.get(f"/api/profiles/{w.id}")).json()["affinity"] is None


# ───────── questions de personnalité ─────────
async def test_prompts_answers_rules_order_and_visibility(app, db):
    w, (m,) = await pair(app, db)
    cat = (await w.agent.get("/api/engagement/prompts")).json()["items"]
    assert len(cat) >= 8
    ids = [p["id"] for p in cat]
    body = lambda xs: {"items": [{"promptId": i, "answer": f"Réponse numéro {k} ici"} for k, i in enumerate(xs)]}  # noqa: E731
    assert code(await w.agent.put("/api/engagement/me/prompts", json=body(ids[:2]))) == "PROMPT_COUNT"
    assert code(await w.agent.put("/api/engagement/me/prompts", json=body(ids[:6]))) == "PROMPT_COUNT"
    assert code(await w.agent.put("/api/engagement/me/prompts", json=body([ids[0], ids[0], ids[1]]))) == "PROMPT_DUPLICATE"
    assert code(await w.agent.put("/api/engagement/me/prompts", json=body([ids[0], ids[1], "inconnu"]))) == "PROMPT_UNKNOWN"
    assert (await w.agent.put("/api/engagement/me/prompts", json={"items": [{"promptId": ids[0], "answer": "x"}] * 3})).status_code == 400
    ok = await w.agent.put("/api/engagement/me/prompts", json=body(ids[:3]))
    assert ok.status_code == 200 and [a["promptId"] for a in ok.json()["items"]] == ids[:3]
    # Réordonner puis modifier à tout moment.
    ok = await w.agent.put("/api/engagement/me/prompts", json=body([ids[2], ids[0], ids[4], ids[3]]))
    assert [a["promptId"] for a in ok.json()["items"]] == [ids[2], ids[0], ids[4], ids[3]]
    # Visible dans la carte vue par l'autre membre, dans l'ordre choisi.
    card = (await m.agent.get(f"/api/profiles/{w.id}")).json()
    assert [p["promptId"] for p in card["prompts"]] == [ids[2], ids[0], ids[4], ids[3]] and card["prompts"][0]["question"]["fr"]
    # Retirer tout est permis (profil sans questions).
    assert (await w.agent.put("/api/engagement/me/prompts", json={"items": []})).json()["items"] == []


async def test_admin_manages_prompts_and_limits(app, db):
    a, w = await admin(app, db), await member(app, db)
    slug = f"q-{uid()}"
    assert (await w.agent.post("/api/admin/prompts", json={"slug": slug, "textFr": "Ma question ?", "textEn": "My question?"})).status_code == 403
    made = await a.agent.post("/api/admin/prompts", json={"slug": slug, "textFr": "Ma question ?", "textEn": "My question?"})
    assert made.status_code == 201
    assert (await a.agent.post("/api/admin/prompts", json={"slug": slug, "textFr": "Autre question ?", "textEn": "Other?"})).status_code == 409
    pid = made.json()["id"]
    assert pid in await prompt_ids(w, 100)
    # Une réponse existante disparaît des profils quand la question est désactivée.
    ids = [i for i in await prompt_ids(w, 100) if i != pid][:2] + [pid]
    assert (await w.agent.put("/api/engagement/me/prompts", json={"items": [{"promptId": i, "answer": "Une réponse ici"} for i in ids]})).status_code == 200
    assert (await a.agent.patch(f"/api/admin/prompts/{pid}", json={"active": False})).status_code == 200
    assert pid not in await prompt_ids(w, 100)
    assert pid not in [x["promptId"] for x in (await w.agent.get("/api/engagement/me/prompts")).json()["items"]]
    listed = {p["id"]: p for p in (await a.agent.get("/api/admin/prompts")).json()["items"]}
    assert listed[pid]["active"] is False and listed[pid]["answers"] == 1
    # Les bornes (min/max) sont réglables.
    await a.agent.patch("/api/admin/settings", json={"values": {"prompts.min": 1, "prompts.max": 3}})
    assert (await w.agent.put("/api/engagement/me/prompts", json={"items": [{"promptId": (await prompt_ids(w, 1))[0], "answer": "Une seule réponse"}]})).status_code == 200
    assert (await w.agent.get("/api/engagement/config")).json()["prompts"] == {"min": 1, "max": 3, "answerMax": 300}


async def test_prompts_flag_off_makes_feature_unavailable(app, db):
    a, w = await admin(app, db), await member(app, db)
    assert (await answer(w)).status_code == 200
    await a.agent.put("/api/admin/feature-flags/profile_prompts", json={"enabled": False})
    assert (await w.agent.get("/api/engagement/prompts")).status_code == 503
    assert (await w.agent.put("/api/engagement/me/prompts", json={"items": []})).status_code == 503
    card = (await new_agent_for(app, db, w)).json()
    assert card["prompts"] == []  # les réponses ne s'affichent plus
    assert (await w.agent.get("/api/engagement/config")).json()["flags"]["profile_prompts"] is False


async def new_agent_for(app, db, w):
    other = await member(app, db, city=f"E-{uid()}", gender="MAN")
    return await other.agent.get(f"/api/profiles/{w.id}")


# ───────── likes commentés ─────────
async def test_like_with_comment_target_validation(app, db):
    w, (m,) = await pair(app, db)
    await answer(m)
    ans = (await m.agent.get("/api/engagement/me/prompts")).json()["items"][0]["id"]
    like = lambda **kw: w.agent.post("/api/swipes", json={"targetId": m.id, "action": "LIKE", **kw})  # noqa: E731
    assert code(await like(comment="Salut", targetKind="PROMPT", targetRef="pas-a-lui")) == "INVALID_LIKE_TARGET"
    assert code(await like(comment="Salut", targetKind="PHOTO", targetRef=ans)) == "INVALID_LIKE_TARGET"
    assert code(await like(comment="Salut", targetKind="INTEREST", targetRef="nope")) == "INVALID_LIKE_TARGET"
    assert code(await like(comment="x" * 201)) == "INVALID_COMMENT"
    assert code(await like(comment="")) == "INVALID_COMMENT"
    assert code(await w.agent.post("/api/swipes", json={"targetId": m.id, "action": "PASS", "comment": "Non"})) == "COMMENT_ON_PASS"
    ok = await like(comment="  J’ai adoré ta réponse !  ", targetKind="PROMPT", targetRef=ans)
    assert ok.status_code == 200 and ok.json()["matched"] is False
    sent = (await w.agent.get("/api/swipes/sent")).json()["items"][0]
    assert sent["comment"] == "J’ai adoré ta réponse !" and sent["likeTarget"] == {"kind": "PROMPT", "ref": ans}


async def test_like_comment_becomes_first_message_on_match(app, db):
    w, (m,) = await pair(app, db)
    assert (await w.agent.post("/api/swipes", json={"targetId": m.id, "action": "LIKE", "comment": "Quel pays rêves-tu de découvrir ?"})).json()["matched"] is False
    r = await m.agent.post("/api/swipes", json={"targetId": w.id, "action": "LIKE", "comment": "Le Japon, et toi ?"})
    assert r.json()["matched"] is True
    conv = r.json()["match"]["conversationId"]
    async with session_maker()() as s:
        msgs = (await s.execute(select(Message.senderId, Message.body).where(Message.conversationId == conv).order_by(Message.createdAt))).all()
    assert msgs == [(w.id, "Quel pays rêves-tu de découvrir ?"), (m.id, "Le Japon, et toi ?")]  # celle qui a liké en premier d'abord
    got = (await w.agent.get(f"/api/conversations/{conv}/messages")).json()
    assert sorted(x["body"] for x in got["items"]) == sorted(["Quel pays rêves-tu de découvrir ?", "Le Japon, et toi ?"])  # visibles via l'API de messagerie


async def test_like_without_comment_unchanged_and_reciprocal_match_has_no_message(app, db):
    w, (m,) = await pair(app, db)
    await w.agent.post("/api/swipes", json={"targetId": m.id, "action": "LIKE"})
    r = await m.agent.post("/api/swipes", json={"targetId": w.id, "action": "LIKE"})
    assert r.json()["matched"] is True
    async with session_maker()() as s:
        assert (await s.execute(select(Message.id).where(Message.conversationId == r.json()["match"]["conversationId"]))).first() is None


async def test_received_comment_visible_only_where_the_liker_is(app, db):
    """Gratuit : likers masqués (donc leurs commentaires aussi) sauf Super Like ; Premium : liste et commentaires."""
    w, (m,) = await pair(app, db)
    await m.agent.post("/api/swipes", json={"targetId": w.id, "action": "LIKE", "comment": "Ton sourire est contagieux"})
    free = (await w.agent.get("/api/swipes/received")).json()
    assert free["locked"] is True and free["count"] == 1 and free["items"] == []
    await make_premium(w.id)
    prem = (await w.agent.get("/api/swipes/received")).json()
    assert prem["items"][0]["comment"] == "Ton sourire est contagieux" and prem["items"][0]["id"] == m.id


async def test_like_comments_flag_and_length_setting(app, db):
    a = await admin(app, db)
    w, (m,) = await pair(app, db)
    await a.agent.patch("/api/admin/settings", json={"values": {"likes.comment_max": 20}})
    assert code(await w.agent.post("/api/swipes", json={"targetId": m.id, "action": "LIKE", "comment": "x" * 21})) == "INVALID_COMMENT"
    await a.agent.put("/api/admin/feature-flags/like_comments", json={"enabled": False})
    assert code(await w.agent.post("/api/swipes", json={"targetId": m.id, "action": "LIKE", "comment": "ok"})) == "FEATURE_DISABLED"
    assert (await w.agent.post("/api/swipes", json={"targetId": m.id, "action": "LIKE"})).status_code == 200  # le like simple reste possible


# ───────── découvertes du jour ─────────
async def test_daily_picks_limited_stable_real_and_plan_aware(app, db):
    a = await admin(app, db)
    w, men = await pair(app, db, men=7)
    plans = {p["code"]: p for p in (await a.agent.get("/api/admin/plans")).json()["plans"]}
    saved = {c: plans[c]["features"] for c in ("FREE", "PREMIUM")}
    for code_, n in (("FREE", 3), ("PREMIUM", 6)):  # le quota se règle PAR FORMULE, dans Offres et tarifs
        assert (await a.agent.patch(f"/api/admin/plans/{code_}", json={"features": {**saved[code_], "daily_picks_count": n}})).status_code == 200
    first = (await w.agent.get("/api/discovery/daily")).json()
    assert len(first["items"]) == 3 and first["pending"] == 3 and first["day"] == datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    ids = {m.id for m in men}
    assert all(i["id"] in ids and i["affinity"]["reasons"] is not None for i in first["items"])  # de vrais comptes éligibles
    again = (await w.agent.get("/api/discovery/daily")).json()
    assert [i["id"] for i in again["items"]] == [i["id"] for i in first["items"]]  # sélection stable dans la journée
    # Une décision prise est reflétée, sans retirer la carte.
    target = first["items"][0]["id"]
    await w.agent.post("/api/swipes", json={"targetId": target, "action": "PASS"})
    items = (await w.agent.get("/api/discovery/daily")).json()
    assert next(i for i in items["items"] if i["id"] == target)["decision"] == "PASS" and items["pending"] == 2
    # Premium : quota plus large, et pas de compte à rebours dans la réponse.
    p = await member(app, db, city=w and (await w.agent.get("/api/profiles/me")).json()["city"], gender="WOMAN")
    await make_premium(p.id)
    assert len((await p.agent.get("/api/discovery/daily")).json()["items"]) == 6
    assert "expiresAt" not in first and "countdown" not in first


async def test_daily_picks_exclude_blocked_suspended_and_respect_cooldown(app, db):
    w, men = await pair(app, db, men=4)
    shown = (await w.agent.get("/api/discovery/daily")).json()["items"]
    by_id = {i["id"]: i for i in shown}
    blocked, suspended = shown[0]["id"], shown[1]["id"]
    assert (await w.agent.post(f"/api/blocks/{blocked}")).status_code == 200
    async with session_maker()() as s:
        await s.execute(update(User).where(User.id == suspended).values(status="SUSPENDED"))
        await s.commit()
    left = [i["id"] for i in (await w.agent.get("/api/discovery/daily")).json()["items"]]
    assert blocked not in left and suspended not in left and set(left) <= set(by_id)
    # Historique : un jour passé apparaît ; un profil déjà proposé récemment n'est pas reproposé (cooldown).
    async with session_maker()() as s:
        await s.execute(update(DailyRecommendation).where(DailyRecommendation.userId == w.id).values(day=dailysvc.today() - datetime.timedelta(days=1)))  # jour UTC, comme l'application
        await s.commit()
    hist = (await w.agent.get("/api/discovery/daily/history")).json()
    assert hist["days"] and {i["id"] for i in hist["days"][0]["items"]} <= set(left)
    today = (await w.agent.get("/api/discovery/daily")).json()["items"]
    assert not ({i["id"] for i in today} & set(by_id))  # cooldown de 14 jours


async def test_daily_picks_flag_and_unauthenticated(app, db):
    a, w = await admin(app, db), await member(app, db)
    assert (await new_agent(app).get("/api/discovery/daily")).status_code == 401
    await a.agent.put("/api/admin/feature-flags/daily_picks", json={"enabled": False})
    assert (await w.agent.get("/api/discovery/daily")).status_code == 503
    assert (await w.agent.get("/api/discovery/daily/history")).status_code == 503


# ───────── indicateurs ─────────
async def test_metrics_admin_only_and_honest(app, db):
    a, u = await admin(app, db), await member(app, db)
    assert (await u.agent.get("/api/admin/engagement/metrics")).status_code == 403
    m = (await a.agent.get("/api/admin/engagement/metrics")).json()
    assert m["likes"] >= m["likesWithComment"] >= 0 and 0 <= (m["matchRate"] or 0) <= 100
    assert m["unavailable"] == [] and {"proposed", "accepted", "completed", "feedbackCount"} <= set(m["dates"])  # mesurés via déclarations volontaires
    assert "d7" in m["retention"] and m["retention"]["definition"]

"""Test de charge « connexions + discussions simultanées » (local uniquement : refuse tout hôte qui n'est pas localhost).

Étapes, avec N utilisateurs virtuels (300 à 500 recommandés) :
  1. préparation (--prepare) : crée les comptes charge001…chargeNNN@duo.test (mot de passe LOAD_PASSWORD, jamais écrit dans le dépôt) ;
  2. N connexions en même temps (hachage du mot de passe compris) ;
  3. N sockets Socket.IO ouverts en même temps (présence et messages en direct) ;
  4. les membres se likent deux à deux : N/2 matchs, donc N/2 conversations ;
  5. N membres écrivent en même temps (--messages chacun, pauses aléatoires), lisent l'historique et marquent comme lu ;
     on mesure l'envoi (REST) et la LIVRAISON en direct (le message arrive-t-il sur le socket de l'autre personne, et en combien de temps) ;
  6. quelques signalements et blocages (--report-rate) pour alimenter la modération.

Usage (API de test, limiteur de débit désactivé, base de développement) :
    NODE_ENV=test .venv/bin/uvicorn app.main:app --port 4100 &
    LOAD_PASSWORD=... .venv/bin/python -m scripts.loadchat --prepare --users 500
    LOAD_PASSWORD=... .venv/bin/python -m scripts.loadchat --users 500 --messages 8

Ce n'est PAS une preuve de capacité de production : machine, base et réseau de test ≠ production ; la mesure sert à repérer les goulots."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import statistics
import time
from collections import defaultdict
from urllib.parse import urlsplit

import httpx
import websockets

REASONS = ["FAKE_PROFILE", "SCAM", "HARASSMENT", "INAPPROPRIATE_CONTENT", "SPAM", "OTHER"]
TEXTS = ["Salut, comment tu vas ?", "Tu fais quoi ce week-end ?", "J’adore ta bio !", "On se voit bientôt ?", "Haha, trop drôle", "Tu es de quelle ville ?",
         "Belle photo 😊", "Je finis le travail à 18 h", "Tu préfères la mer ou la montagne ?", "Bonne soirée à toi !"]


def pct(v: list[float], q: float) -> float:
    return v[min(len(v) - 1, int(len(v) * q))] if v else 0.0


def table(title: str, rows: dict[str, list[float]], errors: dict[str, int]) -> None:
    print(f"\n{title}\n{'étape':30} {'n':>6} {'p50':>7} {'p95':>7} {'p99':>7} {'max':>7} {'err':>5}")
    for k, v in rows.items():
        v.sort()
        print(f"{k:30} {len(v):6d} {statistics.median(v) if v else 0:7.0f} {pct(v, .95):7.0f} {pct(v, .99):7.0f} {(v[-1] if v else 0):7.0f} {errors.get(k, 0):5d}")


async def prepare(n: int) -> None:
    from sqlalchemy import select

    from scripts.seed import add_member, birth_for  # refuse de tourner en production
    from app.core.security import hash_password
    from app.db.session import dispose, session_maker
    from app.models.models import User

    pw = await hash_password(os.environ["LOAD_PASSWORD"])
    made = 0
    async with session_maker()() as db:
        for i in range(1, n + 1):
            email = f"charge{i:04d}@duo.test"
            if (await db.execute(select(User.id).where(User.email == email))).first():
                continue
            gender = "WOMAN" if i % 2 else "MAN"
            await add_member(db, email=email, pw_hash=pw, name=f"Charge{i:04d}", gender=gender, birth=birth_for(22 + i % 20), country="BJ", city="Cotonou", intent="SERIOUS",
                             completeness=70, verified=False, bio="Compte de test de charge.", seeking="EVERYONE")
            made += 1
            if made % 100 == 0:
                await db.commit()
        await db.commit()
    await dispose()
    print(f"{made} comptes de charge créés ({n} au total).")


async def reset() -> None:
    """Efface likes, matchs, conversations, signalements et blocages des comptes de charge (les comptes eux-mêmes restent)."""
    from sqlalchemy import text

    from app.db.session import dispose, session_maker

    ids = "(SELECT id FROM \"User\" WHERE email LIKE 'charge%@duo.test')"
    async with session_maker()() as db:
        for t, cols in (("Report", ("reporterId", "targetId")), ("Block", ("blockerId", "blockedId")), ("Swipe", ("giverId", "targetId")), ("Match", ("userAId", "userBId"))):
            await db.execute(text(f'DELETE FROM "{t}" WHERE "{cols[0]}" IN {ids} OR "{cols[1]}" IN {ids}'))
        await db.commit()
    await dispose()
    print("Données de charge remises à zéro.")


class Member:
    def __init__(self, i: int, c: httpx.AsyncClient):
        self.i, self.c, self.id, self.conv, self.partner = i, c, None, None, None
        self.ws = None
        self.got = 0


async def socket_reader(m: Member, pending: dict, delivered: list, base: str, origin: str) -> None:
    """Client Socket.IO minimal (protocole Engine.IO v4 sur WebSocket) : connexion, ping/pong, comptage des « message:new » reçus."""
    u = urlsplit(base)
    cookie = "; ".join(f"{k}={v}" for k, v in m.c.cookies.items())
    async with websockets.connect(f"ws://{u.netloc}/socket.io/?EIO=4&transport=websocket", additional_headers={"Cookie": cookie, "Origin": origin}, max_size=2**22, open_timeout=60) as ws:
        m.ws = ws
        await ws.recv()  # « 0{sid,…} »
        await ws.send("40")
        while True:
            frame = await ws.recv()
            if frame == "2":
                await ws.send("3")
            elif frame.startswith("40"):
                m.connected.set()
            elif frame.startswith("42"):
                ev = json.loads(frame[2:])
                if ev[0] == "message:new" and ev[1].get("senderId") != m.id:
                    m.got += 1
                    body = ev[1].get("body") or ""
                    t0 = pending.pop(body, None)
                    if t0:
                        delivered.append((time.perf_counter() - t0) * 1000)


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:4100")
    ap.add_argument("--origin", default="http://localhost:3000")
    ap.add_argument("--users", type=int, default=300)
    ap.add_argument("--messages", type=int, default=8, help="messages envoyés par membre")
    ap.add_argument("--think", default="0.3,1.5", help="pause entre deux messages, en secondes (min,max) : 0.3,1.5 = rafale extrême ; 8,20 ≈ discussion réaliste")
    ap.add_argument("--report-rate", type=float, default=0.04, help="part des membres qui signalent leur interlocuteur")
    ap.add_argument("--reset", action="store_true", help="efface likes, matchs, conversations, signalements des comptes de charge puis s'arrête")
    ap.add_argument("--prepare", action="store_true", help="crée les comptes de charge puis s'arrête")
    a = ap.parse_args()
    if urlsplit(a.url).hostname not in ("localhost", "127.0.0.1", "::1"):
        raise SystemExit("Test de charge refusé : uniquement sur une API locale.")
    if a.reset:
        await reset()
        return
    if a.prepare:
        await prepare(a.users)
        return
    password = os.environ["LOAD_PASSWORD"]
    think = tuple(float(x) for x in a.think.split(","))
    lat: dict[str, list[float]] = defaultdict(list)
    err: dict[str, int] = defaultdict(int)
    why: dict[str, int] = defaultdict(int)
    delivered: list[float] = []
    pending: dict[str, float] = {}
    limits = httpx.Limits(max_connections=None, max_keepalive_connections=None)
    members = [Member(i, httpx.AsyncClient(base_url=a.url, headers={"Origin": a.origin}, timeout=120, limits=limits)) for i in range(1, a.users + 1)]
    for m in members:
        m.connected = asyncio.Event()

    async def timed(step: str, coro):
        t = time.perf_counter()
        try:
            r = await coro
            ok = r.status_code < 400
            if not ok:
                code = ""
                try:
                    code = (r.json().get("error") or {}).get("code", "")
                except Exception:  # noqa: BLE001
                    pass
                why[f"{step} → HTTP {r.status_code} {code}".strip()] += 1
        except Exception as e:  # noqa: BLE001 — une panne réseau compte comme erreur d'étape
            r, ok = None, False
            why[f"{step} → {type(e).__name__} {str(e)[:60]}".strip()] += 1
        lat[step].append((time.perf_counter() - t) * 1000)
        if not ok:
            err[step] += 1
        return r

    # 2. connexions simultanées
    t0 = time.perf_counter()
    res = await asyncio.gather(*[timed("1 connexion", m.c.post("/api/auth/login", json={"email": f"charge{m.i:04d}@duo.test", "password": password})) for m in members])
    live = [m for m, r in zip(members, res) if r is not None and r.status_code == 200]
    print(f"{len(live)}/{a.users} connexions réussies en {time.perf_counter() - t0:.1f} s")
    if len(live) < 2:
        raise SystemExit("Trop peu de connexions : arrêt (mot de passe de charge correct ? comptes préparés avec --prepare ?).")
    for m, r in zip(members, res):
        if r is not None and r.status_code == 200:
            m.id = (r.json().get("user") or r.json()).get("id")
    me = await asyncio.gather(*[timed("2 profil (/users/me)", m.c.get("/api/users/me")) for m in live])
    for m, r in zip(live, me):
        if r is not None and r.status_code == 200:
            m.id = r.json().get("id") or r.json().get("user", {}).get("id")

    # 3. sockets simultanés
    t1 = time.perf_counter()
    readers = [asyncio.create_task(socket_reader(m, pending, delivered, a.url, a.origin)) for m in live]
    done, _ = await asyncio.wait([asyncio.create_task(m.connected.wait()) for m in live], timeout=90)
    ok_ws = sum(1 for m in live if m.connected.is_set())
    print(f"{ok_ws}/{len(live)} sockets temps réel ouverts en {time.perf_counter() - t1:.1f} s")

    # 4. matchs deux à deux
    pairs = [(live[i], live[i + 1]) for i in range(0, len(live) - 1, 2)]
    for x, y in pairs:
        x.partner, y.partner = y, x
    await asyncio.gather(*[timed("3 like", m.c.post("/api/swipes", json={"targetId": m.partner.id, "action": "LIKE"})) for m in live if m.partner])
    convs = await asyncio.gather(*[timed("4 liste des conversations", m.c.get("/api/conversations")) for m in live if m.partner])
    for m, r in zip([m for m in live if m.partner], convs):
        if r is not None and r.status_code == 200:
            items = r.json().get("items", r.json()) if isinstance(r.json(), dict) else r.json()
            for conv in items:
                if m.partner.id in json.dumps(conv):
                    m.conv = conv.get("id")
                    break
    talking = [m for m in live if m.conv]
    print(f"{len(pairs)} paires, {len(talking)} membres avec une conversation ouverte")

    # 5. discussions simultanées + 6. signalements
    async def chat(m: Member) -> None:
        await asyncio.sleep(random.uniform(0, think[1]))
        for n in range(a.messages):
            body = f"{random.choice(TEXTS)} [{m.i}-{n}]"
            pending[body] = time.perf_counter()
            await timed("5 envoi d'un message", m.c.post(f"/api/conversations/{m.conv}/messages", json={"body": body}))
            if n % 3 == 2:
                await timed("6 lecture de l'historique", m.c.get(f"/api/conversations/{m.conv}/messages?limit=30"))
                await timed("7 marquer comme lu", m.c.post(f"/api/conversations/{m.conv}/read"))
            await asyncio.sleep(random.uniform(*think))

    async def moderate(m: Member) -> None:
        await asyncio.sleep(random.uniform(1.0, 4.0 + think[1]))
        if random.random() < a.report_rate:
            await timed("8 signalement", m.c.post("/api/reports", json={"targetId": m.partner.id, "reason": random.choice(REASONS), "details": "Signalement généré par le test de charge."}))
        if random.random() < a.report_rate / 2:
            await timed("9 blocage", m.c.post(f"/api/blocks/{m.partner.id}"))

    t2 = time.perf_counter()
    await asyncio.gather(*[chat(m) for m in talking], *[moderate(m) for m in talking])
    await asyncio.sleep(3)  # laisse arriver les dernières livraisons
    dur = time.perf_counter() - t2
    sent = len(lat["5 envoi d'un message"])
    total = sum(len(v) for k, v in lat.items() if k[0] in "5678")
    print(f"\nDiscussions : {len(talking)} membres, {sent} messages en {dur:.0f} s ({sent / dur:.0f} msg/s ; {total / dur:.0f} req/s toutes actions)")
    table("Latences en ms (client → réponse)", dict(sorted(lat.items())), err)
    delivered.sort()
    ok = sum(1 for m in talking if m.got)
    print(f"\nLivraison en direct : {len(delivered)}/{sent} messages reçus sur le socket du destinataire ({100 * len(delivered) / max(sent, 1):.1f} %), "
          f"p50 {statistics.median(delivered) if delivered else 0:.0f} ms, p95 {pct(delivered, .95):.0f} ms, p99 {pct(delivered, .99):.0f} ms ; {ok}/{len(talking)} membres ont reçu au moins un message")
    print(f"Erreurs : {sum(err.values())} sur {sum(len(v) for v in lat.values())} requêtes" + (f"\nDétail des erreurs : {dict(why)}" if why else ""))
    for r in readers:
        r.cancel()
    await asyncio.gather(*[m.c.aclose() for m in members])


asyncio.run(main())

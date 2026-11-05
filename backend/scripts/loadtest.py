"""Test de charge reproductible, sans dépendance supplémentaire (httpx + asyncio).

Usage (API démarrée avec NODE_ENV=test pour désactiver le limiteur de débit, sur la base de développement peuplée par `make seed`) :
    NODE_ENV=test .venv/bin/uvicorn app.main:app --port 4100 &
    LOAD_PASSWORD=... .venv/bin/python scripts/loadtest.py --url http://localhost:4100 --users 50 --seconds 30

Chaque utilisateur virtuel se connecte avec un compte de démonstration (membre001…) puis enchaîne des lectures réalistes avec une courte pause.
Le script mesure le débit, les latences (p50/p95/p99) et le taux d'erreurs par endpoint. Ce n'est PAS une preuve de capacité de production :
la machine, la base et le réseau de test ne sont pas ceux de la production ; il sert à comparer avant/après et à repérer les goulots."""
import argparse
import asyncio
import os
import random
import statistics
import time
from collections import defaultdict

import httpx

MIX = [("/api/users/me", 5), ("/api/discovery?limit=12", 3), ("/api/conversations", 3), ("/api/notifications", 2), ("/api/engagement/config", 2),
       ("/api/discovery/daily", 1), ("/api/swipes/received", 1), ("/api/speed-events", 1)]
PATHS = [p for p, w in MIX for _ in range(w)]


async def user(i: int, base: str, origin: str, password: str, seconds: int, state: dict, samples: dict, errors: dict) -> None:
    async with httpx.AsyncClient(base_url=base, headers={"Origin": origin}, timeout=30) as c:
        r = await c.post("/api/auth/login", json={"email": f"membre{i % 100 + 1:03d}@duo.test", "password": password})
        if r.status_code != 200:
            errors["login"] += 1
        state["logged"] += 1
        if state["logged"] == state["total"]:  # mesure en régime établi : le chronomètre démarre quand tout le monde est connecté
            state["stop"] = time.monotonic() + seconds
            state["ready"].set()
        await state["ready"].wait()
        if r.status_code != 200:
            return
        while time.monotonic() < state["stop"]:
            p = random.choice(PATHS)
            t = time.perf_counter()
            try:
                res = await c.get(p)
                ok = res.status_code == 200
            except httpx.HTTPError:
                ok = False
            samples[p.split("?")[0]].append((time.perf_counter() - t) * 1000)
            if not ok:
                errors[p.split("?")[0]] += 1
            await asyncio.sleep(random.uniform(0.2, 0.8))


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:4100")
    ap.add_argument("--origin", default="http://localhost:3000")
    ap.add_argument("--users", type=int, default=50)
    ap.add_argument("--seconds", type=int, default=30)
    a = ap.parse_args()
    password = os.environ["LOAD_PASSWORD"]
    samples: dict[str, list[float]] = defaultdict(list)
    errors: dict[str, int] = defaultdict(int)
    state = {"logged": 0, "total": a.users, "ready": asyncio.Event(), "stop": 0.0}
    t_login = time.monotonic()
    tasks = [asyncio.create_task(user(i, a.url, a.origin, password, a.seconds, state, samples, errors)) for i in range(a.users)]
    await state["ready"].wait()
    print(f"{a.users} connexions simultanées en {time.monotonic() - t_login:.1f} s (hachage du mot de passe inclus)")
    t0 = time.monotonic()
    await asyncio.gather(*tasks)
    dur = time.monotonic() - t0
    total = sum(len(v) for v in samples.values())
    print(f"{a.users} utilisateurs, {dur:.0f} s : {total} requêtes, {total / dur:.0f} req/s, erreurs : {sum(errors.values())}")
    print(f"{'endpoint':28} {'n':>6} {'p50':>7} {'p95':>7} {'p99':>7} {'err':>5}")
    for p, v in sorted(samples.items()):
        v.sort()
        q = lambda x: v[min(len(v) - 1, int(len(v) * x))]  # noqa: E731
        print(f"{p:28} {len(v):6d} {statistics.median(v):7.0f} {q(0.95):7.0f} {q(0.99):7.0f} {errors.get(p, 0):5d}")
    if errors.get("login"):
        print(f"connexions refusées : {errors['login']}")


asyncio.run(main())

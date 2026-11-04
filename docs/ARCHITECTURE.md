# Architecture

## Vue d'ensemble

```
Navigateur ──HTTPS──▶ Next.js (apps/web, :3000)
   │  ▲                 │  /api/* réécrit (rewrites)
   │  │ cookie httpOnly ▼
   │  └────────────── FastAPI (backend/, :4000) ──▶ PostgreSQL 17 (SQLAlchemy async)
   └── WebSocket (Socket.IO, cookie) ─────────────▶  │
                                                       └─▶ stockage fichiers (local · interface prête pour S3)
```

- **Monorepo pnpm + Turborepo** : `apps/web` (Next.js), `packages/{ui,types,config,eslint-config}`, `docs/`, `docker/`, `scripts/`. L'API Python vit à part dans `backend/` (même organisation que WaMarket : `app/api` routeurs, `app/core` briques métier, `app/models`, `app/schemas`, `alembic/`, `tests/`).
- **Un seul contrat partagé** : `@duomatch/types` contient les schémas Zod du web (formulaires) et les constantes (formules, pays, intérêts, flags). L'API Python en a une **copie** (`backend/app/core/constants.py` et `app/schemas/`) ; `backend/tests/test_contract.py` échoue si les constantes dérivent du TypeScript. Les règles de validation sont dupliquées : toute modification se fait des deux côtés.
- **`@duomatch/ui`** : design system (tokens CSS DuoMatch, `Button`, `Field`, `Card`, `Dialog` natif accessible, `Logo`…), source-only (transpilé par Next).

## Choix techniques notables

| Décision | Raison |
|---|---|
| **Sessions opaques en cookie httpOnly** (hash SHA-256 en base) plutôt que JWT | révocation immédiate, liste des appareils, pas de secret côté client |
| **Web et API sur la même origine** via `rewrites` Next | cookie `SameSite=Lax` sans CORS ; protection CSRF par vérification d'`Origin` |
| **FastAPI + SQLAlchemy 2 async + asyncpg** | même socle que WaMarket ; routes async, validation Pydantic v2 |
| **Alembic en mode synchrone (psycopg2)** | migrations multi-instructions fiables ; la révision `0001_baseline` reprend le schéma créé à l'origine par Prisma (sans effet sur une base qui l'a déjà) |
| **python-socketio monté sur l'ASGI** | même chemin `/socket.io` et mêmes événements : le client `socket.io-client` du web n'a pas changé |
| **Verrou consultatif PostgreSQL** (`pg_advisory_xact_lock`) sur la paire de membres | deux likes simultanés A→B et B→A produisent **exactement un** match (testé) |
| **Droits matérialisés** (`Entitlement`) + vérification d'expiration à la lecture | une formule expirée est traitée comme gratuite immédiatement |
| **Webhook signé HMAC + table `WebhookEvent`** | authentification et idempotence des événements de paiement |
| **Redis/BullMQ non utilisés (pour l'instant)** | non disponible dans l'environnement de développement ; limiteur de débit et job d'expiration en mémoire/`setInterval` — voir *Passage à l'échelle* |

## Modules de l'API (`backend/app`)

`auth` (inscription, connexion, e-mail, mot de passe, Google, sessions) · `users` (compte, export RGPD, suppression, contestation) · `profiles` (profil, photos, préférences, vérification, boost, localisation arrondie, média) · `discovery` (filtres + scoring) · `swipes` (likes, quotas, rewind, likes reçus) · `matches` · `chat` (messages, pièces jointes, passerelle Socket.IO) · `subscriptions` (plans, checkout, webhooks, factures, expiration) · `notifications` · `reports` (signalement, blocage) · `admin` (RBAC, modération, stats, flags, audit) · `core` (auth par cookie, erreurs, rôles, crédits, flags, notifications, limiteur de débit, temps réel, stockage et traitement d'images avec Pillow, e-mail). Un routeur par domaine dans `app/api/<domaine>.py` ; la logique métier est dans `app/core/*.py`.

Format d'erreur unique : `{ "error": { "code": "DAILY_LIMIT", "message": "…", "details"?: … } }` — les **codes** sont stables et traduits côté web (`errors.<CODE>`).

OpenAPI : `http://localhost:4000/api/docs` (désactivé en production).

## Flux critiques

1. **Authentification** : `POST /auth/login` → vérifie Argon2id (même coût pour un e-mail inconnu), verrouillage 15 min après 5 échecs, crée une `Session`, pose `duomatch_sid` (httpOnly, SameSite=Lax, Secure en prod). Les dépendances FastAPI de `core/auth.py` résolvent la session à chaque requête et appliquent rôles (`require_role`), e-mail vérifié (`verified_user`) et comptes suspendus.
2. **Swipe / match** : quota journalier (selon `Entitlement`) → transaction avec verrou de paire → `Swipe` (unique `(giverId,targetId)`) → si like réciproque, `Match` ordonné `(userAId < userBId)` + `Conversation` → notifications + événement temps réel `match:new`.
3. **Messagerie** : `POST /conversations/:id/messages` (REST) → persistance → diffusion `message:new` vers `user:<id>` (Socket.IO authentifié par cookie). Frappe et lecture via WebSocket. Toute action vérifie l'appartenance à la conversation (404 sinon, pour ne pas révéler l'existence).
4. **Paiement** : `checkout` crée `Subscription(PENDING)` + `Payment(PENDING)` → redirection fournisseur → **webhook signé** → `Payment SUCCEEDED`, `Invoice`, `Subscription ACTIVE`, `Entitlement` mis à jour, notification. Le retour navigateur n'active rien.
5. **Images** : décodage serveur (Pillow), formats JPEG/PNG/WebP, rotation EXIF appliquée puis **toutes les métadonnées supprimées**, WebP 1600 px + miniature 480×600. Selfies de vérification et pièces jointes de chat sont **privés** (`private/…`), jamais servis par la route publique.

## Frontend (`apps/web/src`)

Next.js 16 (App Router, `proxy.ts` pour next-intl), React 19, Tailwind 4, TanStack Query (cache serveur), Zustand (toasts, overlay de match, frappe), Framer Motion (swipe), `socket.io-client`. Pages publiques en SSG (FR+EN), espace membre `(app)` protégé côté client par `AppLayout` (redirection login/onboarding, écran de suspension + contestation), back-office `(app)/admin`.

Règles de code : aucun texte en dur (`messages/{fr,en}.json`, vérifié par `scripts/i18n-check.mjs` en test), aucune couleur en dur (tokens CSS), composants du design system d'abord.

## Passage à l'échelle (prévu, non implémenté)

- Redis pour : limiteur de débit partagé, anti-spam messages, file BullMQ (e-mails, expiration d'abonnements, purge RGPD), adaptateur Socket.IO multi-instances.
- Stockage S3/R2 derrière `StorageService` (même interface `put/get/delete`) + CDN pour `photos/`.
- Réplicas de lecture / index supplémentaires selon la charge de `discovery` (le pool candidat est limité à 200 profils par requête).

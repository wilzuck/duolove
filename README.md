# DuoMatch — Deux cœurs, une belle histoire

Plateforme de rencontres amoureuses pour adultes (18+), mobile-first, FR/EN : matching transparent, profils vérifiés, messagerie temps réel, abonnements Premium/VIP, back-office de modération.

> **État honnête** : l'application est fonctionnelle de bout en bout et testée, mais **pas encore prête à être lancée** : paiement réel, e-mail, stockage objet, modération automatique, validation juridique et audit sécurité restent à faire. Voir [docs/STATUS.md](docs/STATUS.md) et [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 · next-intl · TanStack Query · Zustand · Framer Motion · NestJS 12 · Prisma 7 · PostgreSQL 17 · Socket.IO · Playwright · Vitest · pnpm + Turborepo.

```
apps/web        site + application (Next.js)         :3000
apps/api        API REST + WebSocket (NestJS)        :4000  (/api/docs = OpenAPI en dev)
packages/ui     design system DuoMatch (tokens, composants accessibles)
packages/types  schémas Zod + constantes partagés web/API (formules, pays…)
prisma/         schéma + migrations PostgreSQL
docs/           PRD, architecture, base de données, sécurité, tests, déploiement, guides
docker/         Dockerfiles (api, web) · docker-compose.yml à la racine
```

## Démarrer en local

Prérequis : Node ≥ 22, pnpm 11, PostgreSQL ≥ 15.

```bash
pnpm install
createdb duomatch && createdb duomatch_test
cp .env.example apps/api/.env        # ajuster DATABASE_URL
pnpm db:migrate                      # applique les migrations
pnpm --filter @duomatch/api db:generate   # génère le client Prisma (Prisma 7 ne le fait pas après migrate)
pnpm db:seed                         # ~125 membres variés (pays, âges, intentions, Premium/VIP, photos) + likes + 3 conversations + 3 comptes staff — dev uniquement
pnpm --filter @duomatch/types build
pnpm dev                             # web :3000 + API :4000
```

Comptes de démonstration (`@seed.duomatch.test`) : `aminata@…` (membre), `admin@…`, `moderateur@…`, `super@…` — le mot de passe de développement est affiché à la fin de `pnpm db:seed`. **Jamais en production.**

En développement, les e-mails (confirmation, réinitialisation) ne partent pas : ouvrez le dernier via le lien « (dev) ouvrir le dernier e-mail » du bandeau, ou `GET /api/dev/outbox`.

## Commandes

| | |
|---|---|
| `pnpm lint` · `pnpm typecheck` | qualité statique (6 paquets) |
| `pnpm test` | unitaires + intégration API (PostgreSQL réel, base `duomatch_test`) + web + cohérence i18n |
| `pnpm test:e2e` | Playwright : 12 scénarios utilisateur + accessibilité (installer le navigateur une fois : `pnpm --filter @duomatch/web exec playwright install chromium`) |
| `pnpm build` | build de production |
| `pnpm db:migrate` · `pnpm db:seed` | base de données |
| `docker compose up --build` | environnement complet (non testé, voir DEPLOYMENT.md) |

## Documentation

[PRD](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Base de données](docs/DATABASE.md) · [Sécurité](docs/SECURITY.md) · [Roadmap](docs/ROADMAP.md) · [**État réel**](docs/STATUS.md) · [Tests](docs/TESTING.md) · [Déploiement](docs/DEPLOYMENT.md) · [Guide admin](docs/ADMIN_GUIDE.md) · [Guide utilisateur](docs/USER_GUIDE.md) · [Checklist de production](docs/PRODUCTION_CHECKLIST.md)

Conventions pour les contributeurs et agents IA : [AGENTS.md](AGENTS.md).

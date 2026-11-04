# DuoMatch — Deux cœurs, une belle histoire

Plateforme de rencontres amoureuses pour adultes (18+), mobile-first, FR/EN : matching transparent, profils vérifiés, messagerie temps réel, abonnements Premium/VIP, back-office de modération.

> **État honnête** : l'application est fonctionnelle de bout en bout et testée, mais **pas encore prête à être lancée** : paiement réel, e-mail, stockage objet, modération automatique, validation juridique et audit sécurité restent à faire. Voir [docs/STATUS.md](docs/STATUS.md) et [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 · next-intl · TanStack Query · Zustand · Framer Motion · FastAPI · SQLAlchemy 2 + Alembic · PostgreSQL 17 · Socket.IO · Playwright · Vitest · pytest · pnpm + Turborepo.

```
apps/web        site + application (Next.js)         :3000
backend/         API REST + WebSocket (FastAPI)       :4000  (/api/docs = OpenAPI en dev)
packages/ui     design system DuoMatch (tokens, composants accessibles)
packages/types  schémas Zod + constantes du web (copie Python vérifiée par test_contract)
docs/           PRD, architecture, base de données, sécurité, tests, déploiement, guides
docker/         Dockerfiles (api, web) · docker-compose.yml à la racine
```

## Démarrer en local

Prérequis : Node ≥ 22, pnpm 11, Python ≥ 3.13, PostgreSQL ≥ 15.

```bash
pnpm install
createdb duomatch && createdb duomatch_test
make -C backend install               # virtualenv + dépendances Python
cp .env.example backend/.env         # ajuster DATABASE_URL (sans ?schema=)
pnpm db:migrate                      # applique les migrations Alembic
pnpm db:seed                         # ~125 membres variés (pays, âges, intentions, Premium/VIP, photos) + likes + 3 conversations + 3 comptes staff — dev uniquement
pnpm --filter @duomatch/types build
pnpm dev                             # web :3000 + API :4000 (ou séparément : pnpm dev:api · pnpm dev:web)
```

Comptes de démonstration (`@duo.test`) : `aminata@…` (membre), `admin@…`, `moderateur@…`, `super@…` — le mot de passe de développement est affiché à la fin de `pnpm db:seed`. **Jamais en production.**

En développement, les e-mails (confirmation, réinitialisation) ne partent pas : ouvrez le dernier via le lien « (dev) ouvrir le dernier e-mail » du bandeau, ou `GET /api/dev/outbox`.

## Commandes

| | |
|---|---|
| `pnpm lint` · `pnpm typecheck` | qualité statique (web, ui, types) |
| `pnpm test` · `pnpm test:api` | web + cohérence i18n · API Python (pytest, PostgreSQL réel, base `duomatch_test`) |
| `pnpm test:e2e` | Playwright : 12 scénarios utilisateur + accessibilité (installer le navigateur une fois : `pnpm --filter @duomatch/web exec playwright install chromium`) |
| `pnpm build` | build de production |
| `pnpm db:migrate` · `pnpm db:seed` | base de données |
| `docker compose up --build` | environnement complet (non testé, voir DEPLOYMENT.md) |

## Documentation

[PRD](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Base de données](docs/DATABASE.md) · [Sécurité](docs/SECURITY.md) · [Roadmap](docs/ROADMAP.md) · [**État réel**](docs/STATUS.md) · [Tests](docs/TESTING.md) · [Déploiement](docs/DEPLOYMENT.md) · [Guide admin](docs/ADMIN_GUIDE.md) · [Guide utilisateur](docs/USER_GUIDE.md) · [Checklist de production](docs/PRODUCTION_CHECKLIST.md)

Conventions pour les contributeurs et agents IA : [AGENTS.md](AGENTS.md).

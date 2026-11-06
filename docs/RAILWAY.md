# Déployer DuoMatch sur Railway (environnement de test fermé)

> **Statut : préparé, jamais exécuté.** Aucun service n'a été créé sur Railway. À valider au premier déploiement. Ne pas ouvrir au public avant les prérequis de `docs/QA_REPORT.md` (SMTP, paiement réel, relecture juridique…).

## Architecture

3 services dans un projet Railway : **Postgres** (base managée), **api** (FastAPI, un seul réplica) et **web** (Next.js). Les fichiers de configuration sont `docker/railway.api.json` et `docker/railway.web.json` (Dockerfiles existants, contexte = racine du dépôt).

## Étapes

1. Créer le projet, ajouter le plugin **PostgreSQL**.
2. Service **api** : source = ce dépôt ; *Settings → Config-as-code* = `docker/railway.api.json`. Ajouter un **volume** monté sur `/data/uploads`. Les migrations (`alembic upgrade head`) tournent en pré-déploiement.
3. Service **web** : même dépôt ; config-as-code = `docker/railway.web.json`.
4. **Domaines** (voir « Cookies et temps réel » ci-dessous) : un domaine pour le web (ex. `app.exemple.com`), un pour l'API (ex. `api.exemple.com`).
5. Renseigner les variables, déployer l'API d'abord, puis le web.
6. Premier administrateur : créer un compte normalement puis `UPDATE "User" SET role = 'SUPER_ADMIN' WHERE email = '…';`. **Ne jamais lancer `scripts.seed` en production** (mots de passe de démonstration).

## Variables — service `api`

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `DATABASE_URL` | référence Railway au plugin : `${{Postgres.DATABASE_URL}}` — l’application convertit `postgresql://` en pilote asyncpg (`config.py:94`), rien à adapter |
| `APP_URL` | `https://app.exemple.com` (origine exacte du site) |
| `API_URL` | `https://api.exemple.com` |
| `COOKIE_DOMAIN` | `.exemple.com` |
| `UPLOAD_DIR` | `/data/uploads` |
| `RAILWAY_RUN_UID` | `0` (le volume Railway appartient à root ; sans cela l'utilisateur `app` du Dockerfile ne peut pas écrire) |
| `PAYMENT_WEBHOOK_SECRET` | `openssl rand -hex 32` |
| `IP_HASH_SALT` | `openssl rand -hex 32` |
| `PAYMENT_PROVIDER` | `mock` (tant que KKiaPay n'est pas testé) |
| `CALL_PROVIDER` | `mock` (en production le mode simulé masque simplement les appels) |
| `SMTP_URL`, `MAIL_FROM` | requis pour que les codes de confirmation arrivent |
| `REQUIRE_EMAIL_VERIFICATION` | `true` ; ne passer à `false` que pour une démo privée sans SMTP |
| `DEV_EMAIL_CODE` | **ne pas définir** (interdit en production) |

## Variables — service `web` (lues **au build** : redéployer après tout changement)

| Variable | Valeur |
|---|---|
| `PORT` | `3000` |
| `API_URL` | `http://api.railway.internal:4000` (réseau privé ; « api » = nom du service) |
| `NEXT_PUBLIC_SITE_URL` | `https://app.exemple.com` |
| `NEXT_PUBLIC_API_URL` | `https://api.exemple.com` (WebSocket et photos, depuis le navigateur) |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | adresse de support réelle |

## Cookies et temps réel

Le navigateur appelle `/api` sur le domaine du web (réécriture Next), mais le **WebSocket** (messages, appels, invitations) se connecte directement au domaine de l'API avec le cookie de session. Les deux domaines doivent donc être des **sous-domaines d'un même domaine à vous** avec `COOKIE_DOMAIN=.exemple.com`. Les domaines `*.up.railway.app` figurent sur la liste des suffixes publics : le cookie n'y est pas partagé, la messagerie ne se mettrait **pas** à jour en direct. Pour un simple essai sans domaine, il faut recharger la page pour voir les nouveaux messages.

## Limites connues

- **Une seule instance** de l'API (`numReplicas: 1`) : pas de Redis (voir `docs/QA_REPORT.md`).
- Aucune sauvegarde automatique du volume : activer les sauvegardes Railway du volume et de Postgres.
- Le garde-fou de démarrage refuse `DEV_EMAIL_CODE` et les secrets de développement : si l'API redémarre en boucle, lire les journaux.

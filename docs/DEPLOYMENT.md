# Déploiement

> Les fichiers Docker et la CI sont **écrits mais non exécutés** dans l'environnement de développement initial : valider au premier lancement.

## Prérequis de production

| Élément | Exigence |
|---|---|
| PostgreSQL 15+ | sauvegardes quotidiennes + test de restauration, connexion TLS |
| Domaine + HTTPS | terminaison TLS au reverse proxy (HSTS déjà envoyé par l'API) |
| Stockage fichiers | **volume persistant** monté sur `UPLOAD_DIR` (pilote local) — ou pilote S3/R2 (à implémenter, interface `StorageService`) |
| SMTP | `SMTP_URL` + SPF/DKIM/DMARC |
| Secrets | `PAYMENT_WEBHOOK_SECRET`, `IP_HASH_SALT` (`openssl rand -hex 32`) — l'API **refuse de démarrer** avec les valeurs de dev |
| Fournisseur de paiement | adaptateur réel (voir ROADMAP) ; `PAYMENT_PROVIDER` |

## Activer KKiaPay

1. Compte marchand sur kkiapay.me ; récupérer clés **publique / privée** (bac à sable d'abord).
2. `backend/.env` : `PAYMENT_PROVIDER=kkiapay`, `KKIAPAY_PUBLIC_KEY`, `KKIAPAY_PRIVATE_KEY`, `KKIAPAY_SANDBOX=true`, `SITE_NAME=DuoMatch`. L'API refuse de démarrer si une clé manque.
3. Tableau de bord KKiaPay → Webhooks : URL `https://<api>/api/payments/webhook/kkiapay` (publique, HTTPS), définir un *secret hash* et le copier dans `KKIAPAY_WEBHOOK_SECRET`.
4. Flux : `POST /subscriptions/checkout` renvoie la config du widget → le navigateur ouvre KKiaPay → `POST /payments/kkiapay/confirm` → **le serveur interroge KKiaPay** (statut `SUCCESS` + montant exact) → activation. Le webhook refait la même vérification (il n'est jamais cru sur parole) et rattrape un navigateur fermé trop tôt. Une transaction ne sert qu'une fois.
5. **Configuration alignée sur WaMarcket** (où le module KKiaPay tourne en production) : vérification via `POST /api/v1/transactions/status` avec `x-api-key` = clé **privée** ; webhook authentifié par l'en-tête `x-kkiapay-secret` = « hash secret » brut ; notre référence de paiement est passée au widget en `partnerId` et revient dans la vérification et le webhook ; méthodes `momo` + `card`. **Reste à faire : un premier test en bac à sable avec vos clés** (paiement réussi, échec, Mobile Money en attente), puis un paiement réel de petit montant avec `KKIAPAY_SANDBOX=false`.
6. Non gérés : remboursements, renouvellement automatique (KKiaPay est un paiement ponctuel : à l'échéance l'abonnement passe en « paiement en retard » et l'utilisateur est notifié).

## Variables d'environnement

Voir [`.env.example`](../.env.example) (aucun secret réel). Points d'attention :

- `APP_URL` doit être **exactement** l'origine du site (contrôle CSRF + CORS + liens e-mail).
- Web et API sur la **même origine** (reverse proxy `/api` → API, comme les `rewrites` de Next) : aucun réglage de cookie. Sinon : sous-domaines + `COOKIE_DOMAIN=.exemple.com`.
- `API_URL` du web est lue **au build** (rewrites). `NEXT_PUBLIC_API_URL` est ce que le **navigateur** utilise pour le WebSocket et les photos : ils doivent être joignables publiquement.
- Le proxy doit transmettre les en-têtes WebSocket (`Upgrade`, `Connection`) vers l'API et `X-Forwarded-For` (l'API fait confiance à 1 proxy).

## Docker Compose (local / staging)

```bash
cp .env.example .env && docker compose up --build
# web http://localhost:3000 · API http://localhost:4000/api/docs · e-mails http://localhost:8025
```

Le service `migrate` applique `alembic upgrade head` puis s'arrête ; l'API démarre ensuite. **Les migrations ne s'exécutent jamais automatiquement au démarrage de l'API** : en production, les lancer en étape de déploiement contrôlée.

## Sans Docker (PaaS type Railway / Render)

1. Deux services depuis ce dépôt : API Python (`pip install -r backend/requirements.txt`, démarrage `uvicorn app.main:app --host 0.0.0.0 --port 4000 --proxy-headers` depuis `backend/`) et web (`… @duomatch/web build`, `… start`).
2. Étape de pré-déploiement API : `alembic upgrade head` (depuis `backend/`). Le job d'expiration des abonnements tourne dans le processus de l'API : un seul worker uvicorn.
3. Volume persistant pour les uploads (ou S3), base PostgreSQL managée, variables d'environnement.
4. Premier compte administrateur : créer un compte normalement, puis `UPDATE "User" SET role = 'SUPER_ADMIN' WHERE email = '…';` (le seed de dev est interdit en production).

## CI/CD

`.github/workflows/ci.yml` : lint → typecheck → tests web → build ; job `api` (Alembic + pytest sur PostgreSQL de service) ; puis E2E Playwright, puis `pnpm audit --prod`. Déploiement : à brancher selon la plateforme (déclenché sur `main` après CI verte).

## Observabilité (à mettre en place)

- Logs : actuellement les logs uvicorn et Python (texte). Recommandé : logs JSON + corrélation de requête, jamais de données personnelles.
- Erreurs : Sentry (front + API). Métriques : latence, taux d'erreur, connexions WebSocket, file de signalements.
- Alertes : indisponibilité `/api/health`, taux d'échec des webhooks de paiement, espace disque `UPLOAD_DIR`.
- Sauvegardes : `pg_dump` quotidien chiffré hors site + sauvegarde du volume d'uploads ; tester la restauration.

## Multi-instances

Avant de passer à plusieurs instances API : Redis (limiteur de débit, anti-spam, adaptateur Socket.IO), job d'expiration des abonnements unique (BullMQ/cron avec verrou), stockage objet partagé.

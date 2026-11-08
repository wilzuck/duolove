# Déploiement

> Les fichiers Docker et la CI sont **écrits mais non exécutés** dans l'environnement de développement initial : valider au premier lancement.

## Prérequis de production

| Élément | Exigence |
|---|---|
| PostgreSQL 15+ | sauvegardes quotidiennes + test de restauration, connexion TLS |
| Domaine + HTTPS | terminaison TLS au reverse proxy (HSTS déjà envoyé par l'API) |
| Stockage fichiers | **volume persistant** monté sur `UPLOAD_DIR` (pilote local) — ou stockage objet S3/Cloudflare R2 (livré : voir « Photos sur Cloudflare R2 » ci-dessous) |
| E-mail | `BREVO_API_KEY` (API HTTP Brevo, prioritaire) ou `SMTP_URL` (SMTP sortant : forfait Railway Pro) ; `MAIL_FROM` avec un expéditeur validé chez Brevo ; SPF/DKIM/DMARC |
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

## Verrous contre les déploiements cassés

Incident du 8 nov. 2026 : deux déploiements ont échoué (« Failed to build an image », sans journal). Causes trouvées : (1) la CI était **désactivée sans bruit** (erreur de syntaxe dans `ci.yml`, tous les contrôles échouaient en 0 s), donc rien ne bloquait ; (2) des variables Railway collées depuis un tableau avaient une **tabulation cachée dans leur nom**.

| Verrou | Où | Effet |
|---|---|---|
| Contrôle local avant envoi | `.githooks/pre-push` → `scripts/verify.sh` (`pnpm verify`, `pnpm verify:full`) | Bloque `git push` si un workflow est invalide, s'il y a plusieurs têtes Alembic, ou si lint / types échouent. `VERIFY_FULL=1` ajoute build + tests API. Activé par `pnpm install` (script `prepare`). Contournement : `git push --no-verify` |
| Lint des workflows | `.github/workflows/workflow-lint.yml` (actionlint) | Échoue si un fichier de workflow est invalide : la CI ne peut plus être désactivée en silence |
| CI | `.github/workflows/ci.yml` | lint, types, tests, build, migrations, tests API sur PostgreSQL, E2E, audit |
| « Wait for CI » | Railway → service → Settings → Deploy | Railway ne déploie que si la CI est verte (à activer sur `api` et `web`) |
| Branche protégée | GitHub → Settings → Branches → `main` | Exige les contrôles `quality` et `api` avant fusion (facultatif) |

Variables Railway : **ne jamais coller un tableau**. Utiliser *Raw Editor* (`NOM=valeur`, une ligne par variable) ou saisir nom et valeur séparément ; un nom ne doit contenir ni espace ni tabulation.

## Observabilité (à mettre en place)

- Logs : actuellement les logs uvicorn et Python (texte). Recommandé : logs JSON + corrélation de requête, jamais de données personnelles.
- Erreurs : Sentry (front + API). Métriques : latence, taux d'erreur, connexions WebSocket, file de signalements.
- Alertes : indisponibilité `/api/health`, taux d'échec des webhooks de paiement, espace disque `UPLOAD_DIR`.
- Sauvegardes : `pg_dump` quotidien chiffré hors site + sauvegarde du volume d'uploads ; tester la restauration.

## Multi-instances

Avant de passer à plusieurs instances API : Redis (limiteur de débit, anti-spam, adaptateur Socket.IO), job d'expiration des abonnements unique (BullMQ/cron avec verrou), stockage objet partagé.

## Sauvegardes sur Railway et restauration (procédure choisie)

Projet `joyful-prosperity` : deux volumes à protéger — `postgres-volume` (service `DB`, la base) et `api-volume` (service `api`, les photos dans `/data/uploads`).

**Activer** (tableau de bord Railway, par volume : onglet des sauvegardes) : planification quotidienne et hebdomadaire, éventuellement mensuelle. Rétention annoncée par Railway : quotidiennes 6 jours, hebdomadaires 27 jours, mensuelles 89 jours. Une sauvegarde peut aussi être créée à la main et verrouillée (elle n'expire plus) avant une opération risquée (migration, mise à jour de version de PostgreSQL).

**Limites à connaître**
- Les sauvegardes restent chez Railway : effacer (« wipe ») un volume supprime toutes ses sauvegardes. Ne jamais supprimer le volume ou le service pour « réparer » : restaurer à la place.
- Elles sont dans la même région que le volume (sfo). Ce n'est pas une copie hors de Railway.
- RGPD : un compte supprimé reste dans les sauvegardes jusqu'à leur expiration (89 jours au plus avec le mensuel) ; à écrire dans la politique de confidentialité, ou ne pas activer le mensuel.
- La restauration d'un volume ramène aussi les comptes supprimés entre-temps : après toute restauration, rejouer les suppressions de comptes demandées depuis la date de la sauvegarde.

**Restaurer** : la restauration crée un volume neuf et laisse l'ancien volume dans le projet, démonté. Marche à suivre : prévenir (mode maintenance : couper les drapeaux), restaurer la sauvegarde choisie, redémarrer le service concerné, vérifier `/api/health`, une connexion, une photo et le nombre de comptes, puis seulement supprimer l'ancien volume démonté.

**Test de restauration** (à faire une fois avant l'ouverture, puis chaque trimestre) : restaurer la dernière sauvegarde de la base dans un projet ou un environnement de test, lancer `alembic current` et compter les membres. Noter la date et le résultat dans `docs/STATUS.md`.

**Option plus fine pour la base** : la restauration à un instant précis (PITR) de PostgreSQL existe chez Railway (`railway postgres pitr`) ; fenêtre d'environ 4 semaines d'après leur documentation. À étudier si la perte de quelques heures de données est inacceptable.

## Photos sur Cloudflare R2 (livré, désactivé par défaut)

Par défaut les photos restent sur le volume (`UPLOAD_DIR`). Le stockage objet se règle **dans la console** : Administration → Stockage des fichiers (super administrateur uniquement), ou par les variables `STORAGE_DRIVER=s3` et `S3_*` (voir `.env.example`). La console l'emporte si elle est configurée.

**Mise en route**
1. Cloudflare → R2 : créer un bucket **privé** (les photos passent par l'API, le bucket n'est jamais public) et un jeton API R2 avec lecture, écriture et suppression sur ce bucket. Noter l'adresse `https://<identifiant>.r2.cloudflarestorage.com`, l'identifiant et la clé secrète.
2. Railway, service `api` : définir `SETTINGS_ENCRYPTION_KEY` (chaîne aléatoire longue, par exemple `openssl rand -base64 48`). Elle chiffre la clé secrète enregistrée en base ; **la perdre rend la clé secrète inutilisable** (il faudra la ressaisir), la changer aussi.
3. Console → Stockage des fichiers : saisir adresse, bucket, identifiant et clé secrète, puis « Tester puis enregistrer ». Rien n'est enregistré si le test d'écriture, de relecture et de suppression échoue.
4. « Copier les photos du disque vers le bucket » : copie par lots, relançable ; ne supprime rien du disque.
5. Pendant la migration, une photo absente du bucket est servie depuis le disque (aucune photo ne disparaît). Vérifier quelques photos, garder le volume et ses sauvegardes un temps, puis seulement le retirer.

**Sécurité** : la clé secrète est chiffrée (Fernet), jamais renvoyée au navigateur ni écrite dans le journal d'audit (qui note seulement qu'elle a changé) ; l'adresse doit être en https et ne peut pas viser une adresse interne ; chaque modification et chaque migration sont tracées. Revenir au disque est possible mais les photos déjà dans le bucket ne s'affichent plus tant qu'il n'est pas réactivé.

**Limite connue** : l'adresse est validée sans résolution DNS (un nom pointant vers une adresse interne n'est pas détecté) ; l'accès est réservé au super administrateur.

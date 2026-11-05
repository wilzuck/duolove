# Sécurité et confidentialité

Cadre : OWASP Top 10 / ASVS, RGPD. Cette page décrit **ce qui est réellement en place** et ce qui reste à faire. Elle ne remplace ni un audit externe ni une revue juridique.

## 1. Contrôles en place

| Domaine | Mesure | Où / comment vérifier |
|---|---|---|
| Mots de passe | **Argon2id** (19 Mo, 2 itérations), politique 10+ car. maj/min/chiffre ; vérification à coût constant pour un e-mail inconnu | `core/authsvc.py`, `core/security.py` · tests `test_flows` |
| Lien magique | jeton aléatoire 256 bits (haché en base), 15 min, usage unique consommé de façon atomique, pas d'énumération de comptes, limite d'un e-mail par minute et par compte + limiteur de débit par IP | `core/authsvc.py` · `test_login_options` |
| Brute-force | verrouillage 15 min après 5 échecs + limiteur de débit (10/min sur login/inscription, 5/min mot de passe oublié) | test « verrouille le compte » |
| Sessions | jeton opaque 256 bits, **hash SHA-256 en base**, cookie `httpOnly`, `SameSite=Lax`, `Secure` en production, expiration 30 j, révocation unitaire/globale (changement et réinitialisation de mot de passe) | `core/auth.py` |
| CSRF | cookie `SameSite=Lax` **+** rejet des requêtes mutantes dont l'en-tête `Origin` n'est pas l'application | test « CSRF » |
| Contrôle d'accès | dépendances FastAPI (`current_user` sur toute route privée), rôles hiérarchiques `USER < MODERATOR < ADMIN < SUPER_ADMIN`, contrôle **objet par objet** (conversation, message, paiement, pièce jointe, session) avec 404 pour ne pas révéler l'existence | tests messagerie, paiements, admin |
| Validation | modèles Pydantic sur toutes les entrées (mêmes règles que les schémas Zod du web, contrôlées par `test_contract`) ; images décodées côté serveur | `app/schemas/` |
| Injection | SQLAlchemy (requêtes paramétrées) ; `text()` uniquement avec paramètres liés | — |
| XSS | React échappe par défaut ; aucun `dangerouslySetInnerHTML` hors script de thème constant | — |
| Uploads | taille max (8 Mo photos, 6 Mo chat), format réel via décodeur (JPEG/PNG/WebP), limite de pixels, **suppression de toutes les métadonnées (EXIF/GPS)**, ré-encodage WebP ; clés aléatoires 120 bits ; routes média n'acceptent que `[a-f0-9]+(_t)?.webp` (anti traversée de chemin, testé) | `StorageService/ImagesService` |
| Fichiers privés | selfies de vérification et pièces jointes de chat sous `private/`, servis uniquement à leurs ayants droit ; selfie **supprimé après décision** | admin / chat |
| Paiements KKiaPay | le navigateur ne fournit qu'un identifiant de transaction : le serveur **re-vérifie** statut et montant exact auprès de KKiaPay ; transaction à usage unique ; webhook authentifié par secret (comparaison à temps constant) puis re-vérifié ; clés privées jamais renvoyées au client | `kkiapay.spec.ts` |
| Paiements | activation **uniquement** via webhook : signature HMAC-SHA256 du corps brut (comparaison à temps constant), idempotence (`WebhookEvent` unique), droits vérifiés côté serveur | tests paiements |
| En-têtes | API : Helmet (CSP, HSTS, nosniff…) ; web : `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` | `next.config.ts` |
| Secrets | `.env` non versionné ; l'API **refuse de démarrer en production** avec les secrets de développement (`PAYMENT_WEBHOOK_SECRET`, `IP_HASH_SALT`) | `config/env.ts` |
| Journaux | pas de mot de passe/jeton/e-mail dans les logs en production ; IP stockée **hachée (HMAC)** dans les sessions | `crypto.ts` |
| Audit | toute action de modération/administration écrit un `AuditLog` ; consultation des selfies tracée | `admin.controller.ts` |
| Dépendances | `pnpm audit --prod` : **aucune vulnérabilité connue** au moment de l'écriture (nodemailer mis à jour en 10.x) | CI |

## 2. Vie privée et RGPD

- **Localisation** : jamais de GPS précis. Si l'utilisateur partage sa position (opt-in), elle est **arrondie à 0,1° (~11 km) avant stockage** ; la distance affichée est arrondie à 5 km.
- **Visibilité** : profil masquable, mode discret (VIP), blocage mutuel (le bloqué ne voit plus le profil), accusés de lecture désactivables.
- **Export** (`GET /users/me/export`) : toutes les données personnelles en JSON, sans `passwordHash`.
- **Suppression** (`DELETE /users/me`, mot de passe exigé) : anonymisation immédiate, sessions révoquées, photos effacées, messages vidés, abonnements annulés.
- **Consentements** : aucun consentement marketing requis pour s'inscrire ; case dédiée, modifiable ; cookie unique essentiel (session) + préférence de thème locale → pas de bandeau de consentement nécessaire tant qu'aucun traceur n'est ajouté (à revoir si analytics).
- **Conservation** : politique à formaliser (recommandé : purge physique 30 j après suppression, factures 10 ans). ⛔ job de purge non implémenté.
- Les textes légaux fournis sont des **brouillons à valider par un juriste**.

## 3. Modération et prévention des arnaques

- Signalement en un geste (motifs : faux profil, arnaque, harcèlement, contenu inapproprié, mineur, spam, autre), limité à 10/h par adresse IP ; blocage immédiat ; unmatch.
- File de modération : signalements, photos (rejet + suppression du fichier), vérifications de profil (badge **uniquement** après revue humaine), contestations des suspensions.
- Sanctions : suspension (durée) / bannissement, motif visible de la personne, **procédure de contestation** (file dédiée ; il est recommandé qu'elle soit traitée par un autre modérateur que l'auteur de la sanction — non imposé techniquement), levée automatique à l'échéance. Le personnel ne peut pas sanctionner un rôle égal/supérieur ni lui-même.
- Prévention : conseils (blog, aide, page « Comment ça marche »), anti-spam messages (30/min/utilisateur), limite de likes, e-mail à confirmer avant d'interagir.
- ⛔ Non implémenté : détection automatique d'images (NSFW/mineurs), détection de comportements suspects (scripts/langage d'arnaque), score de risque.

## 4. Risques résiduels et recommandations

1. **CSP côté web** non définie (Next injecte des scripts inline) : ajouter une CSP à nonce via `proxy.ts` avant production.
2. **Limiteur de débit en mémoire** : par instance ; à déplacer dans Redis en multi-instances.
3. **Énumération de comptes** : l'inscription répond `EMAIL_TAKEN` (compromis UX, limité par le débit) et le verrouillage (`ACCOUNT_LOCKED`) révèle l'existence d'un compte après 5 échecs ; la réinitialisation de mot de passe répond de façon identique.
4. **Photos de profil publiques** (clés aléatoires non devinables) ; migrer vers des URL signées + CDN si besoin de révocation fine.
5. **Fournisseur de paiement simulé** : la vérification de signature du fournisseur réel (Stripe/KKiaPay) reste à implémenter.
6. **Webhook** : ajouter une fenêtre de validité (horodatage signé) quand le fournisseur le permet.
7. **2FA** et notifications de connexion inhabituelle : non implémentés.
8. Faire réaliser un **test d'intrusion** et une **revue RGPD (AIPD)** avant le lancement.

## 5. Signaler une vulnérabilité

À définir avant production (adresse `security@…`, page `/.well-known/security.txt`).

## Confirmation de l'e-mail par code
Code à 6 chiffres aléatoire (jamais en clair en base : HMAC lié au compte), 5 essais puis annulation, expiration courte, renvoi plafonné (30 s), limitation de débit par IP, comparaison à temps constant, consommation atomique. Tant que l'e-mail n'est pas confirmé, le **serveur** refuse toute route protégée ; les comptes jamais confirmés sont supprimés après un délai réglé par l'administration. Le code fixe de développement (`DEV_EMAIL_CODE`) est impossible en production par construction (le serveur refuse de démarrer) et en test.

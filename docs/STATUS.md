# État réel des fonctionnalités

Vérifié le 2026-11-03 : `pnpm lint`, `pnpm typecheck`, `pnpm test` (API 26 + web 6), `pnpm build`, E2E Playwright 13/13, `pnpm audit --prod` sans vulnérabilité. Détails dans [TESTING.md](TESTING.md).

**Terminé = implémenté, branché au backend réel (PostgreSQL) et couvert par au moins un test automatisé.**

## ✅ Terminé

| Domaine | Détail |
|---|---|
| Fondations | monorepo pnpm/Turborepo, Next 16, API FastAPI (Python) + SQLAlchemy 2 + Alembic, PostgreSQL, design system, i18n FR/EN, thème clair/sombre |
| Pages publiques | accueil, comment ça marche, tarifs, à propos, blog (articles gérés depuis l'admin), contact, aide, CGU, confidentialité, cookies, règles — SEO, Open Graph, sitemap, robots |
| Auth | inscription (18+), connexion, déconnexion, e-mail à confirmer, mot de passe oublié/réinitialisation, changement de mot de passe, verrouillage, sessions actives, Google (code prêt) |
| Profil | onboarding 4 étapes, photos (recadrage, ordre, principale, suppression, suppression EXIF), complétude, préférences, vérification par selfie (revue humaine), boost VIP |
| Découverte | swipe (glisser/boutons/clavier), Super Like, retour arrière, filtres gratuits + Premium (serveur), score + % de compatibilité, exclusion bloqués/suspendus/masqués, mode discret, position arrondie |
| Likes / matchs | quotas par formule, match transactionnel idempotent (verrou de paire), animation, likes reçus (verrouillés en gratuit) |
| Messagerie | temps réel Socket.IO, texte/émojis/images, frappe, lecture configurable, historique paginé, recherche, suppression, unmatch, blocage, signalement, anti-spam |
| Notifications | in-app + temps réel + e-mail (préférences), page de réglages |
| Abonnements | plans, checkout, **webhook signé idempotent**, factures, historique, annulation/reprise, expiration, droits côté serveur |
| Calendrier | composant `DatePicker` (react-day-picker, repris de WaMarcket) avec menus mois/année, utilisé pour la date de naissance ; à réutiliser pour toute date |
| Monétisation | offres, prix par durée (1/3/6/12 mois), quotas et remises **configurables** (`/admin/plans`), Charme+ (boutique de boosts, packs de Super Likes et jetons), portefeuille de crédits idempotent — voir [MONETISATION.md](MONETISATION.md) |
| Match en direct | menu `/match` : critères (âge, genre, pays, enfants, animaux, vie, taille, origine), invitation des personnes **en ligne** compatibles et réciproques, acceptation en direct (Socket.IO), conversation ouverte contre **1 jeton** (2 personnes au plus par recherche), recherche active 24 h relançable toutes les 15 min, **3 jetons offerts une fois** à 100 % de profil + e-mail vérifié, packs de jetons en boutique, essais gratuits pour le plan Gratuit — voir [MONETISATION.md](MONETISATION.md) §8 |
| Administration | console dédiée (barre latérale groupée, pastilles de travail en attente), RBAC (modérateur/admin/super-admin), stats, utilisateurs (suspendre/bannir/lever/rôle), signalements, photos, vérifications, contestations, abonnements/paiements, feature flags, journal d'audit |
| Vie privée | export JSON, suppression/anonymisation, visibilité, accusés de lecture, consentement marketing |
| Qualité | ESLint, TypeScript strict, tests unitaires + intégration (PostgreSQL réel) + E2E + axe (WCAG 2.2 AA), audit dépendances |

## 🟡 Simulé ou partiel

| Élément | Réalité |
|---|---|
| **KKiaPay** | adaptateur écrit (widget + vérification serveur + webhook), testé avec une **API KKiaPay simulée** ; **jamais exécuté contre le vrai bac à sable** (pas de clés). Le format (en-têtes, champs, statuts) est repris de WaMarcket, où KKiaPay fonctionne en production ; à valider au premier test sandbox de DuoMatch (voir DEPLOYMENT.md). |
| **Paiement (mock)** | fournisseur `mock` : même chemin que la production (checkout → webhook HMAC → activation) mais **aucun argent réel**. La page `/checkout/mock` et `POST /payments/mock/:ref/complete` sont désactivées en production. |
| Google OAuth | flux serveur (vérification du jeton d'identité, audience) écrit mais **non testé** sans `GOOGLE_CLIENT_ID` réel |
| E-mail | SMTP via nodemailer **non testé** avec un vrai serveur ; en dev les e-mails vont dans une boîte mémoire (`/api/dev/outbox`) |
| Images « après validation » | validation technique (décodage, format, taille, nettoyage) ; **pas de modération automatique du contenu** |
| Docker / Compose / CI | écrits, **non exécutés** (Docker indisponible localement ; la CI n'a pas tourné sur GitHub) |
| Textes légaux | brouillons à faire valider par un juriste |
| Distance | calculée uniquement si les deux membres ont partagé une position approximative |

## ⛔ Non implémenté

- Match en direct : présence **en mémoire d'un seul processus** (plusieurs instances → adaptateur Redis de Socket.IO) ; pas de dotation mensuelle de jetons par formule (à ajouter dans les fonctionnalités de formule) ; pas de remboursement de jetons ; pas de tableau de bord admin dédié
- Stripe, CinetPay (non demandés pour l'instant) ; KKiaPay couvre déjà MTN/Moov/Wave côté widget · Apple Sign In (compte développeur requis)
- Redis, BullMQ (limiteur, files, expiration en `setInterval`), stockage S3/R2 (interface prête, pilote local seulement)
- Notifications **push PWA** (le manifeste existe ; pas de service worker ni VAPID) — l'interface l'indique « Bientôt »
- Détection automatique NSFW / mineurs / comportements suspects
- Job de purge RGPD différée, politique de rétention appliquée
- Monitoring (Sentry, métriques, alertes), logs JSON structurés, sauvegardes automatisées (documentées seulement)
- CSP côté web, 2FA, notifications de connexion inhabituelle
- Mesure Lighthouse / Core Web Vitals en environnement déployé ; audit d'accessibilité des pages authentifiées (axe n'est lancé que sur les pages publiques)
- Témoignages : volontairement absents (aucun témoignage authentique disponible)

## Jetons Match mensuels (livré)
- **Terminé** : clé de formule `match_tokens_monthly` (Premium 5, VIP 15, réglable dans `/admin/plans`) ; crédit à l'activation × mois, idempotent ; repris au remboursement ; affiché sur la page Tarifs. Testé (API : 68/68).
- **Limites** : crédité d'un bloc (pas de distribution mensuelle ni d'expiration) ; pas de rétroaction sur les abonnés déjà actifs.

## Promos et parrainage (livré)
- **Terminé** : codes promo (remise % ou jetons offerts) créés et désactivés en admin, appliqués au paiement côté serveur, plafonds et unicité testés en concurrence ; parrainage avec lien d'invitation, récompense unique 5/2 jetons, plafond de 20 ; page `/referral`, champ à l'inscription, saisie de code dans Charme+ et sur Premium ; migration `20261104150000_promos_referral`.
- **Tests** : API 82/82 (14 nouveaux), E2E 22/22 sur le dernier passage (5 nouveaux). Deux passages précédents avaient échoué sur des tests Match/admin déjà verts seuls et n'ont pas été reproduits en 3 relances : cause non identifiée.
- **Corrigé au passage** : contraste de `--success-ink` (4,4:1 → ≥ 7:1) détecté par axe sur l'admin.
- **Non implémenté** : parrainage via Google, détection d'abus par IP/appareil, réglage admin des montants de récompense.

## Feature flags (livré)
- **Terminé** : catalogue FERMÉ de 8 interrupteurs (`FEATURE_FLAGS`, `packages/types`) : inscriptions, paiements, codes promo, boosts, Match en direct, Super Likes, photos dans les messages, parrainage. Page `/admin/flags` : fonctions groupées (Accès / Argent / Rencontres), badge « Coupure d'urgence », état réel (valeur par défaut = actif), icône « i » qui explique à quoi sert la fonction, ce qui se passe activée/coupée et quand l'utiliser.
- **Appliqué côté serveur** (jamais seulement masqué) : garde `@RequireFlag` (503 `FEATURE_DISABLED`) + contrôles dans les services ; changements audités (avant → après) et pris en compte immédiatement (cache 10 s invalidé).
- **Garde-fous métier** : une coupure des paiements laisse terminer un paiement déjà lancé et n'empêche pas les remboursements ; la coupure des inscriptions ne bloque pas la connexion des membres existants ; les filleuls en attente sont récompensés à la réactivation du parrainage.
- **Tests** : API `flags.spec.ts` (7) ; E2E `flags.spec.ts` (2, axe inclus).
- **Limites** : l'interface des membres ne masque pas encore les menus d'une fonction coupée (elle affiche l'erreur « temporairement indisponible ») ; pas de flags par pourcentage ou par groupe de membres ; les clés libres ont été supprimées (catalogue fermé).

## Migration de l'API vers FastAPI (Python)
- **Terminé** : l'API NestJS/Prisma est remplacée par `backend/` (FastAPI, SQLAlchemy 2 async, Alembic, python-socketio), organisation de WaMarket. Mêmes routes `/api`, mêmes formes JSON et codes d'erreur, même cookie `duomatch_sid`, même chemin Socket.IO, même port 4000 : le web n'a pas changé. Base PostgreSQL reprise telle quelle (migration `0001_baseline`, sans effet sur une base existante ; `alembic check` propre).
- **Tests (réels, dernier passage)** : pytest 114/114 sur `duomatch_test` ; E2E Playwright 24/24 contre l'API Python (dont deux sockets réels : messagerie et Match en direct). Un E2E (création de code promo) a échoué à cause d'une liste admin lente (N+1) : corrigé par des comptages groupés.
- **À savoir** : les règles de validation et les constantes existent en double (Zod côté web, Pydantic côté API) ; `test_contract` ne contrôle que les constantes, pas chaque règle de validation. Les identifiants et `updatedAt` sont produits par l'application (plus de défaut SQL), et les dates par défaut sont en UTC.
- **Non couvert par un test** : selfie de vérification, connexion Google, événement `typing`, déclenchement de la présence par une vraie connexion socket, démarrage via Docker (le Dockerfile et docker-compose ont été réécrits mais **non testés**), job CI Python (non exécuté).
- **Limites inchangées** : présence et limiteur de débit en mémoire d'un seul processus (Redis avant plusieurs instances) ; job d'expiration des abonnements dans le processus de l'API (un seul worker).

## Options de connexion (livré)
- **Terminé** : « Restez connecté » (case cochée par défaut sur `/login` : session de 30 jours avec cookie persistant ; décochée : session de 24 h et cookie de session sans date d'expiration) et **connexion par lien magique** (`POST /auth/magic-link`, `POST /auth/magic-link/verify`, page `/magic-link`) : lien à usage unique valable 15 minutes, réponse identique que l'adresse existe ou non, un seul e-mail par minute et par compte, comptes supprimés ou bannis exclus ; cliquer le lien confirme aussi l'adresse e-mail. Migration `0002_magic_link` (nouvelle valeur de `TokenType`).
- **Tests** : pytest `test_login_options.py` (4) ; E2E `login-options.spec.ts` (2, axe inclus).
- **Simulé / non vérifié** : l'e-mail du lien magique n'est lu qu'en boîte d'envoi de développement (aucun SMTP réel testé). La connexion Google existe côté API mais n'a jamais été testée avec un vrai identifiant client.
- **Non implémenté** : code par SMS/WhatsApp, Apple, Facebook, clés d'accès (passkeys) ; le lien magique ne crée pas de compte (seuls les comptes existants peuvent l'utiliser).

## Match : J'aime / Passer, et boutique en trois familles (livré)
- **Terminé** : sur chaque personne qui a accepté, boutons **J'aime** (un like normal : mêmes quotas et même réciprocité que Découvrir, **sans jeton** ; un like réciproque crée le match et ouvre la conversation gratuitement) et **Passer** (la personne est retirée de la liste, sans consommer de choix). Si un match existe déjà, la carte propose « Ouvrir la conversation ». Boutique Charme+ : trois sections séparées (**Jetons Match**, **Boosts de visibilité**, **Super Likes**).
- **Tests** : pytest `test_live_react.py` (3) ; E2E `live` et `promo` étendus. Dernier passage : pytest 114/114 (3 relances consécutives), E2E 26/26.
- **Échecs intermittents expliqués et corrigés (tests uniquement, pas le produit)** : (1) `test_live` : des candidats ou des recherches encore actives laissés par les exécutions précédentes (même code d'origine tiré au hasard) recevaient l'invitation et faussaient les décomptes ; les tests Match repartent maintenant d'un état propre (membres hors ligne, recherches fermées). (2) `test_flows::test_rbac…` : la file de modération est triée du plus ancien au plus récent et paginée ; avec les signalements accumulés dans la base de test, le nouveau n'était plus sur la première page ; le test parcourt maintenant les pages. Dernier passage : 5 relances consécutives, 114/114 à chaque fois.
- **Choix de conception** : « J'aime » compte dans le quota quotidien de likes (c'est un like normal) ; « Passer » est enregistré comme un « pas intéressé » définitif.

## Messagerie : espacement, « Entrée pour envoyer », photos réservées, mise en garde (livré)
- **Terminé** : marge basse du champ de saisie (elle était de 4 px) ; case **« Envoyer avec la touche Entrée »** (cochée par défaut ; décochée, Entrée ajoute une ligne, Ctrl/⌘+Entrée envoie toujours ; mémorisée sur l'appareil) ; **photos dans les messages réservées aux abonnés** (fonctionnalité de formule `chat_images_enabled`, voir MONETISATION §10) avec cadenas et invitation à s'abonner ; **mise en garde anti-escroquerie** courte, en gris sans fond, sous le champ (argent, numéros, codes, coordonnées bancaires).
- **Corrigé au passage** : la modale (`Dialog`) n'avait pas de nom accessible ; elle est maintenant reliée à son titre.
- **Tests** : pytest `test_chat_images_plan.py` (3) + tests de messagerie mis à jour ; E2E `journey` étendu (mise en garde, case Entrée, invitation à s'abonner). Dernier passage : E2E 29/29.
- **Limite** : le message de mise en garde est informatif ; aucune détection automatique de numéros de téléphone ou de demandes d'argent dans les messages (non implémenté).

## Match : guide quand on n'a pas de jeton (livré)
- **Terminé** : quand une personne a accepté et que le membre n'a aucun jeton, un guide s'affiche au-dessus de la liste : 1) obtenir un jeton (acheter, compléter le profil pour les 3 jetons offerts, saisir un code promo), 2) revenir pour « Discuter », 3) alternatives gratuites « J'aime » / « Passer » ; chaque carte indique jusqu'à quelle heure la personne reste disponible (2 h après sa réponse, ou la fin de la recherche). Le guide disparaît dès qu'un jeton est disponible.
- **Tests** : E2E `live.spec.ts` (3 nouveaux : guide visible avec liens et accessibilité, disparition après achat).

## À propos, navigation, blog administrable, tarifs (livré)
- **Terminé** : page À propos réécrite en récit (5 chapitres, engagements, appel « Le prochain, c'est peut-être vous ») FR/EN, sans témoignage ni chiffre inventé ; lien actif de la navbar mis en évidence (gras, souligné, `aria-current="page"`, y compris sous-pages et menu mobile).
- **Terminé** : blog administrable (admin > Blog) : table `BlogPost` (migration `0003`), brouillon/publié, une ligne par langue, éditeur avec aperçu, image de couverture + texte alternatif **obligatoires pour publier** (contrôlé par l'API), images insérables dans le texte, suppression qui retire aussi l'image, journal d'audit. Rendu Markdown restreint **sans HTML brut** ; pages publiques : à la une + grille avec images, durée de lecture, Open Graph, sitemap dynamique. Cache de 5 min purgé immédiatement à chaque enregistrement.
- **Terminé** : accroches des formules (FR/EN) modifiables dans admin > Offres et tarifs ; prix, durées, remises, fonctionnalités et packs l'étaient déjà. Page Tarifs : boosts, Super Likes et jetons en trois sections, durées de boost et quantités en grand.
- **Simulé** : les 3 articles et leurs images de démonstration (`make seed`) ; les illustrations sont des dégradés décoratifs à remplacer par de vraies images. En production, le blog démarre vide.
- **Non implémenté** : traduction liée entre les versions FR/EN d'un même article, suppression des images insérées dans le texte quand l'article est supprimé (seule la couverture l'est), planification de publication, éditeur visuel (Markdown saisi à la main).
- **Tests** : pytest 119/119 (`test_blog.py` : droits, brouillon invisible, image obligatoire, doublons de slug, remplacement/suppression d'image, accroches) ; Playwright 34/34 (`blog.spec.ts` : parcours admin complet + accessibilité, Tarifs en trois sections).

## Engagement, phase 1 : profils interactifs et matching explicable (livré)
- **Terminé** : moteur de score pondéré et explicable (poids pilotés par l'admin, total 100), affinité et raisons affichées ; questions de personnalité (catalogue admin bilingue, 3 à 5 réponses réordonnables) ; likes avec commentaire et ciblage (profil, photo, réponse, intérêt), commentaire repris comme premier message au match ; découvertes du jour + historique (quotas gratuit/Premium, délai avant reproposition, rétention, aucun compte à rebours) ; admin Engagement (réglages, questions, indicateurs réels) ; 3 feature flags (`profile_prompts`, `like_comments`, `daily_picks`) appliqués par le serveur. Détails : `ENGAGEMENT_AUDIT.md`, `MATCHING_ARCHITECTURE.md`, `UX_IMPROVEMENTS.md`, `ENGAGEMENT_ROADMAP.md`, `ENGAGEMENT_METRICS.md`.
- **Tests** : pytest 134/134 (`test_engagement.py` : 15 tests — droits, validation et audit des réglages, effet des pondérations, questions, ciblage et validation des likes, premiers messages, découvertes du jour, flags, indicateurs) ; Playwright 40/40 (`engagement.spec.ts` : parcours profil → découvertes → like commenté → match → premiers messages, puis pilotage admin et flag).
- **Non implémenté** : phases 2 à 4 (réactions, vocaux, brise-glace, rendez-vous, speed dating, appels audio/vidéo, mode pause et préférences d'engagement), assistant IA de profil, « enregistrer un profil pour plus tard », commentaires sur une réponse sans like, détection automatique de contenus à risque dans les commentaires, indicateurs de rendez-vous/satisfaction, quotas Premium propres aux nouvelles fonctions.
- **Limites** : pondérations de départ non validées sur des données réelles ; rétention J7/J30 approximative ; correction d'accessibilité au passage (deux champs fichier masqués de la page Profil).

## Engagement, phase 2 : messagerie enrichie (livré)
Principe retenu : **ce qui existait est amélioré, pas refait**. Déjà présents et conservés : accusés de lecture, indicateur de saisie, recherche (nom et contenu), suppression, photos pour abonnés.
- **Terminé (nouveau)** : réactions aux messages (jeu fermé de 6 emojis défini côté serveur, une par membre, temps réel) ; réponse à un message précis (citation, y compris message supprimé) ; brise-glace (« Besoin d'une idée pour commencer ? ») : modèles bilingues gérés par l'admin, déduits des seuls centres d'intérêt et intention communs, régénérables, **jamais envoyés automatiquement** ; 3 feature flags (`message_reactions`, `message_replies`, `icebreakers`) ; réglage admin du nombre d'idées (`icebreakers.count`) ; onglet Admin › Engagement › Brise-glace.
- **Terminé (amélioré)** : gestion des accusés de lecture réservée aux abonnés (fonctionnalité de formule `read_receipts_control`, réglable par plan dans l'admin ; gratuit = accusés toujours actifs, réglage verrouillé avec lien Premium ; après résiliation, les accusés redeviennent actifs sans perdre le réglage) ; indicateur de saisie désactivable (réciproque, appliqué par le serveur) ; sélecteur d'emojis qui insère à l'endroit du curseur ; nouvelle question de profil « Si je devais voyager, ma prochaine destination serait… » (ajoutée par migration aux bases existantes) ; deux champs fichier masqués rendus accessibles (chat, profil).
- **Tests** : pytest 145/145 (`test_chat_enrichment.py` : 11 tests — réactions, droits, flags, réponses, brise-glace, réglages admin, accusés Premium, saisie) ; Playwright 47/47 (`chat-enrichment.spec.ts`). Un test existant a été adapté à la nouvelle règle des accusés (gratuit refusé, abonné accepté) ; un test de phase 1 sensible au fuseau horaire a été corrigé (date UTC).
- **Non implémenté** : messages vocaux, GIF contrôlés (fournisseur externe et clé requis), suivi d'usage des brise-glace dans les indicateurs, recherche à l'intérieur d'une conversation.

## Engagement, phase 3 (partielle) : mode rendez-vous (livré)
- **Terminé** : proposition de rendez-vous dans une conversation (jour, plage horaire, **lieu public** parmi 6 catégories + nom, mot facultatif) ; accepter, refuser, **proposer un autre horaire** (l'ancien passe à « Reporté »), annuler, « Nous nous sommes vus » (terminé, déclaration volontaire), **retour de satisfaction facultatif et privé** ; **rappel** 1 h ou 24 h avant (boucle de rappels toutes les 5 min, une seule fois par membre) ; **partage volontaire avec une personne de confiance** : lien secret (hash seul stocké), expirant, révocable, page publique sans compte montrant prénoms, horaire, lieu public et statut, jamais d'e-mail, photo ni position (page non indexée, jamais en cache) ; notifications (`DATE_UPDATE`, `DATE_REMINDER`) et temps réel ; conseils de sécurité affichés dans le panneau. Un lieu contenant un numéro de téléphone ou une adresse e-mail est refusé.
- **Contrôle admin** : flag `date_proposals` (coupé : plus de nouvelle proposition ni de réponse, mais les rendez-vous existants restent visibles et **annulables** : on ne piège jamais un membre) ; réglages `dates.min_notice_hours`, `dates.max_days_ahead`, `dates.max_open`, `dates.max_per_day`, `dates.share_hours_after` ; indicateurs réels (proposés, acceptés, taux d'acceptation, terminés, satisfaction déclarée).
- **Tests** : pytest 154/154 (`test_dates.py` : 9 tests — cycle de vie et droits, validation et règles admin, plafond quotidien, report, terminaison et retour, rappels et expiration, partage minimal/révocable/expirant, blocage, flag) ; Playwright 62/62 (`dates.spec.ts` : parcours complet y compris lien lu sans compte).
- **Non implémenté (reste de la phase 3)** : speed dating (version textuelle puis audio/vidéo) ; appels audio et vidéo (WebRTC). Les rendez-vous ne sont jamais déduits des conversations ; un rendez-vous n'est « terminé » que par déclaration.

## Pages d'information, pied de page et charte (livré)
- **Terminé** : pied de page à liens (À propos, Blog, Aide, Contact, mentions et règles) ajouté aux pages de connexion/inscription et à l'espace membre (hors conversation et onboarding) ; lien « Mot de passe oublié » centré ; **Règles de la communauté** réécrites (11 rubriques sur ce que la plateforme fait réellement, sommaire, tous âges, bien-être) ; **Comment ça marche** (huit étapes, ce qui change, tous âges, gratuit/Premium) ; **Centre d'aide** avec recherche instantanée (insensible aux accents), 6 thèmes, 33 réponses ; **Contact** (6 sujets pré-remplis, conseils, urgence sécurité) ; **Conditions d'utilisation** restructurées (15 rubriques, sommaire). Composant commun `DocBody`. FR et EN. Axe et mobile vérifiés.
- **Corrigé** : les anciennes conditions parlaient de formules « mensuelles » alors que le produit propose 1, 3, 6 ou 12 mois sans renouvellement automatique ; le texte est aligné sur le produit.
- **À faire valider** : le texte des conditions reste un modèle de travail à relire par un juriste (bandeau conservé) ; la rubrique « Droit applicable » indique qu'elle sera précisée avant la mise en production. La charte de la communauté n'a plus le bandeau juridique : elle complète les conditions. La page Contact reste en mailto (aucun formulaire sans boîte de support configurée) ; l'adresse vient de `NEXT_PUBLIC_SUPPORT_EMAIL`.
- **Tests** : Playwright `community.spec.ts` (2) et `pages.spec.ts` (5).

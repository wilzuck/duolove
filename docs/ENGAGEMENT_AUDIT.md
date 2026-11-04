# Audit — engagement, matching et fidélisation (phase 0)

Audit réalisé avant toute modification, à partir du code du dépôt (novembre 2026). Il sert de référence à `ENGAGEMENT_ROADMAP.md`.

## Stack et conventions
- **Web** : Next 16 (App Router, next-intl FR/EN), TanStack Query, Zustand, `packages/ui` (composants sources), `packages/types` (Zod, constantes partagées, compilé dans `dist`).
- **API** : FastAPI + SQLAlchemy 2 async + Alembic, PostgreSQL, python-socketio (temps réel), `backend/app/core/*` (services) et `app/api/*` (routes).
- **Droits** : abonnements Free / Premium / VIP lus côté serveur (`entitlements`), fonctionnalités par formule dans `SubscriptionPlan.features`.
- **Contrôle admin existant** : feature flags (catalogue fermé, appliqués par le serveur), offres et tarifs, codes promo, modération, journal d'audit.

## Déjà en place avant cette phase (réutilisé, non recréé)
| Domaine | État |
|---|---|
| Découverte | filtres obligatoires + réciprocité en SQL, score pondéré en dur, pagination, mode discret (VIP) |
| Likes | J'aime / Passer / Super Like, quotas par formule, likes reçus (Premium), match atomique (verrou de paire) |
| Messagerie | texte, photos réservées aux abonnés, temps réel, blocage, signalement |
| Match en direct | invitations en temps réel, jetons |
| Sécurité | blocage bilatéral, suspension, modération des photos, mises en garde anti-arnaque |
| Notifications | in-app + e-mail selon préférences (likes anonymes pour les non-abonnés) |

## Écarts constatés par rapport au cahier des charges
| Fonctionnalité demandée | Constat initial | Décision |
|---|---|---|
| Score configurable et explicable | poids codés en dur, aucune explication | **Livré** (phase 1) |
| Questions de personnalité | absentes | **Livré** (phase 1) |
| Likes avec commentaire / sur un élément | absents (`Swipe` sans contexte) | **Livré** (phase 1) |
| Découvertes du jour + historique | absentes | **Livré** (phase 1) |
| Pilotage admin (poids, quotas, questions, indicateurs) | uniquement flags, offres, promos | **Livré** (phase 1) |
| Messagerie enrichie, messages vocaux, brise-glace | texte + photos seulement | Phase 2 (non démarrée) |
| Rendez-vous, speed dating, appels audio/vidéo | absents | Phase 3 (non démarrée) |
| Préférences d'engagement, mode pause, notifications regroupées | préférences de notification basiques | Phase 4 (non démarrée) |
| Mode « rencontres sélectionnées » sans swipe | absent | **Livré en version simple** : la page Découvertes du jour est une liste détaillée sans swipe ; « enregistrer » un profil pour plus tard n'existe pas |
| Assistant IA de profil | absent | Non implémenté (aucune API IA branchée ; ne rien inventer sur les profils) |

## Risques de régression identifiés et traitement
- **Le classement de la découverte change** (nouveau score) : conservé le contrat `compatibility` (0–100) et l'ordre par boost ; tests existants (scoring, flux, E2E) rejoués.
- **`load_cards` est partagé** (découverte, matchs, live) : l'ajout des réponses est borné à une requête et coupé par feature flag.
- **`Swipe` est une table chaude** : colonnes ajoutées nullables, aucune réécriture ; l'unicité `(giverId, targetId)` et l'idempotence sont inchangées.
- **Premier message automatique** : n'existe qu'à la création d'un match, en reprenant le texte écrit par chaque personne ; aucun message n'est généré.
- **Abonnements, authentification, messagerie** : aucun fichier de ces domaines modifié hors lecture des messages en test.

## Dette connue (hors périmètre de cette phase)
- Limiteur de débit et présence en mémoire (Redis nécessaire en multi-instances).
- Règles de validation dupliquées TS ↔ Python.
- Aucune détection automatique de numéros de téléphone ou de demandes d'argent dans les messages ni dans les commentaires de like.

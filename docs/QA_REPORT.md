# Rapport de recette — DuoMatch

Campagne du 5 novembre 2026. **Légende** : ✅ validé par un test automatisé exécuté dans un vrai navigateur ou sur l'API · ⚠️ validé **en simulé** (le service externe réel n'a jamais été utilisé) · ❌ non validé.

## Résultats globaux

| Batterie | Résultat |
|---|---|
| Navigateur (Playwright, base de test, comptes de démonstration + comptes créés à la volée) | **127 réussis, 0 échec**, 4 ignorés par conception |
| Backend (pytest) | **206 réussis, 0 échec** |
| Qualité de code (lint, typecheck, tests unitaires, build, traductions FR/EN) | tout vert |
| Accessibilité (axe, WCAG 2.1 AA) | 0 violation sur les pages publiques, 17 pages membre, 14 pages d'administration |
| Charge | voir la section dédiée : 0 erreur jusqu'à 100 utilisateurs simultanés ; latence qui se dégrade au-delà de ~50 par processus |

Comptes utilisés (base de test, jamais la base de développement) : visiteur anonyme, membre **gratuit**, **Premium**, **VIP**, **modérateur**, **administrateur**, **super administrateur**, plus des comptes créés par chaque scénario (parcours d'inscription complet).

## Fonctionnalités

| Domaine | Fonctionnalité | Statut | Preuve / limite |
|---|---|---|---|
| Comptes | Inscription 18+ (formulaire et API ; mineur refusé) | ✅ | `journey`, `QA-PUB-04`, pytest |
| | Confirmation de l'e-mail par code (délai de suppression réglable) | ✅ | `confirm-email`, pytest. **E-mail réel (SMTP) jamais envoyé** ⚠️ |
| | Connexion, « Restez connecté », déconnexion, mot de passe oublié, lien magique | ✅ | `auth-pages`, `login-options`, `QA-FREE-10` |
| | Connexion Google | ⚠️ | Serveur et navigateur testés avec Google simulé ; **ID client Google à créer** (`docs/GOOGLE_LOGIN.md`) |
| | Rôles et droits (gratuit / Premium / VIP / modérateur / admin / super) | ✅ | `QA-*-02`, `QA-*-03` : pages interdites, API 403, droits par offre |
| | Suppression du compte, export des données | ✅ | `journey` 12, pytest |
| Profil | Onboarding, photos, biographie, enregistrement après rechargement | ✅ | `engagement`, `QA-FREE-06` |
| | Questions de personnalité, conseils de profil, mode pause | ✅ | `engagement`, `rhythm` |
| | Vérification par selfie (envoi, file de modération, selfie privé, décision, suppression du selfie) | ✅ | pytest `test_verification` (ajouté pendant cette recette) |
| Découverte | Découvrir : liker, passer, match réciproque | ✅ | `journey` |
| | Découvertes du jour : carrousel, jauge Duo, phrase d'intention, question du jour | ✅ | `engagement`, `daily-question` |
| | Likes reçus floutés en gratuit, visibles en Premium ; filtres avancés | ✅ | `QA-*-03` |
| | Live Match (critères, jetons, invitations, durée réglable) | ✅ | `live` |
| | Speed dating en texte | ✅ | `speed` + pytest |
| Messagerie | Messages en temps réel, réactions, réponses, brise-glace, accusés de lecture réservés aux abonnés | ✅ | `journey`, `chat-enrichment` |
| | Photos dans les messages : refusées en gratuit, invitation à s'abonner | ✅ | `journey` |
| | Signaler, bloquer, fermer une conversation | ✅ | `journey` 9, pytest |
| | Rendez-vous (proposer, répondre, rappel, partage avec un proche) | ✅ | `dates` |
| | Appels audio / vidéo | ⚠️ | Règles, interface, notifications testées en **simulé** ; **le son et l'image réels (LiveKit) jamais testés** |
| Argent | Offres et tarifs éditables, paiement simulé, codes promo, parrainage, boutique | ✅ | `journey`, `promo`, pytest |
| | Paiement réel KKiaPay | ⚠️ | Signatures et flux testés en simulé ; **aucun vrai paiement** |
| | Remboursements | ✅ | pytest |
| Administration | Tableau de bord, utilisateurs, modération, signalements, journal d'audit | ✅ | `QA-ADMIN-*`, `QA-MODERATOR-*` |
| | 20 drapeaux d'urgence, réglages d'engagement, offres, codes promo, paiements | ✅ | `flags`, `engagement`, `QA-ADMIN-04/05` |
| | Blog (articles et images), speed dating, question du jour, indicateurs | ✅ | `blog`, `speed`, `daily-question`, `QA-ADMIN-06` |
| Site public | 13 pages en français et en anglais, blog, aide avec recherche, contact, charte, conditions, cookies | ✅ | `QA-PUB-01/02`, `pages`, `a11y` |
| | Textes juridiques (conditions, cookies, confidentialité) | ⚠️ | **Brouillons à faire relire par un juriste** |
| Transversal | Accessibilité, message cookies, thème clair/sombre, mobile sans débordement | ✅ | `a11y*`, `cookies`, `pages` |
| | Sécurité : CSRF par origine, limitation de débit, en-têtes, cookies httpOnly, accès objet par objet | ✅ | pytest, `cookies` |
| | **Plusieurs instances** (limiteur, présence, temps réel partagés) | ❌ | **Redis non implémenté** : une seule instance possible |
| | Sauvegardes, supervision, alertes en production | ❌ | Hors code : à mettre en place sur l'hébergement |

## Charge (machine de développement, 8 cœurs, base de développement ≈130 membres, générateur et API sur la même machine)

`backend/scripts/loadtest.py`, mélange de lectures réalistes, 25 s de régime établi.

| Configuration | Utilisateurs | Débit | `/api/users/me` p50 / p95 | Découverte p50 / p95 | Erreurs |
|---|---|---|---|---|---|
| 1 processus | 50 | 61 req/s | 207 / 649 ms | 368 / 909 ms | 0 |
| 1 processus | 100 | 54 req/s | 1 070 / 3 637 ms | 1 245 / 3 501 ms | 0 |
| 4 processus | 50 | 73 req/s | 50 / 767 ms | 129 / 1 472 ms | 0 |
| 4 processus | 100 | 80 req/s | 517 / 1 950 ms | 934 / 2 565 ms | 0 |

Lecture honnête : aucune erreur, mais **un processus sature autour de 50–60 requêtes/s** (processeur) et la latence devient désagréable au-delà de 50 utilisateurs actifs simultanés par processus. Ce n'est **pas** une mesure de production (machine, base et réseau différents ; le générateur limite peut-être les chiffres à 4 processus). Plusieurs processus exigent Redis (voir ❌).

## Défauts trouvés et corrigés pendant la recette

| Défaut | Gravité | Correction |
|---|---|---|
| Inscription via Google : **majorité non vérifiée** et acceptation des conditions non stricte | Élevée (site 18+) | Validation 18 ans et conditions comme l'inscription classique ; testé |
| Connexion Google : compte jamais confirmé **détournable** (le mot de passe de l'attaquant survivait) | Élevée | Mot de passe retiré et sessions révoquées à la première connexion Google ; testé |
| Connexion Google : émetteur et expiration du jeton non vérifiés | Moyenne | Vérifiés ; testés |
| Photos de démonstration absentes du disque (226) | Faible (développement) | Script `restore_seed_photos.py` |
| `/users/me` : 9 requêtes SQL par appel | Faible | 7 requêtes |
| Vérification par selfie : aucun test | Moyenne (donnée sensible) | 2 tests ajoutés (accès restreint, suppression du selfie après décision) |

Aucun autre échec n'a été relevé : les 3 échecs initiaux de la campagne étaient des hypothèses erronées de mes tests (libellés, forme d'une réponse API), corrigées sans changer l'application.

## Ce qui reste avant l'ouverture au public (aucun n'est corrigeable par du code seul)

1. **SMTP réel** — sans lui, personne ne reçoit le code de confirmation ni les e-mails de sécurité.
2. **ID client Google** (si vous gardez Google) — `docs/GOOGLE_LOGIN.md`.
3. **KKiaPay** — un vrai paiement de test puis un remboursement.
4. **LiveKit** — un appel audio puis vidéo entre deux appareils réels (ou désactiver le drapeau `calls`).
5. **Relecture juridique** des conditions, cookies et confidentialité.
6. **Redis** si plus d'une instance ; sinon une seule instance et une surveillance de la charge.
7. **Sauvegardes de la base, HTTPS, supervision** sur l'hébergement.

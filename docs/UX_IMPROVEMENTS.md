# Améliorations d'expérience (phase 1)

Charte respectée : rose `#E91E63` (jetons existants de `packages/ui`), blanc, anthracite ; mode sombre, mobile-first, états de chargement et vides, erreurs traduites, composants accessibles (rôles, `aria-pressed`, `aria-current`, axe vérifié sur les nouveaux écrans).

| Écran | Statut | Détails |
|---|---|---|
| Profils interactifs | **Livré** | Profil › « Questions de personnalité » : 3 à 5 questions (bornes réglables), réponses de 3 à 300 caractères, réordonner, modifier, retirer. Affichées dans le profil détaillé |
| Affinités | **Livré** | Panneau « Affinité estimée » : pourcentage, raisons, centres d'intérêt communs, avertissement « pas une garantie » |
| Likes avec commentaire | **Livré** | Fenêtre « J'aime avec un commentaire » : profil, photo, réponse ou centre d'intérêt + commentaire facultatif (compteur) ; le commentaire devient le premier message en cas de match ; visible dans « Ils vous ont liké » (Premium) et « Vous avez liké » |
| Découvertes du jour | **Livré** | Liste détaillée sans swipe, raisons, historique par jour, aucune urgence artificielle ; accessible depuis la barre latérale et l'icône ✦ de la découverte |
| Rencontres sélectionnées (sans swipe) | **Partiel** | Même page : liker, passer, voir le profil. « Enregistrer pour plus tard » non implémenté |
| Likes reçus / Match réussi | Existants, adaptés | le commentaire est affiché, le match ouvre la conversation avec les premiers messages |
| Messagerie enrichie | **Livré** (hors vocaux et GIF) | Réactions (emoji, temps réel), réponse à un message précis avec citation, emoji inséré au curseur, indicateur de saisie facultatif, accusés « vu » gérables en Premium |
| Brise-glace | **Livré** | Bouton ampoule du champ de saisie : idées fondées sur l'en commun, « autres idées », insertion modifiable, jamais d'envoi automatique ; FR/EN |
| Rendez-vous | **Livré** | Bouton calendrier dans la conversation : proposer (jour, heure, durée, lieu public), accepter, refuser, proposer un autre horaire, annuler, rappel (1 h / 24 h), « Nous nous sommes vus », retour facultatif, partage volontaire avec un proche (page publique sans compte, lien expirant et révocable) |
| Speed dating, appels audio/vidéo | Non démarré | Reste de la phase 3 |
| Paramètres d'engagement, mode pause | Non démarré | Phase 4 |

## Règles éthiques appliquées
Pas de faux profils, faux likes, faux messages ni faux compte à rebours ; pas de défilement infini ajouté ; aucune notification inventée ; les fonctions essentielles de sécurité (blocage, signalement) ne sont jamais conditionnées à un abonnement ; Free garde découvertes du jour, questions et likes commentés.

## Contrôle de l'administration
Tout est coupable (feature flags `profile_prompts`, `like_comments`, `daily_picks`) et réglable (Admin › Engagement) sans déploiement ; chaque changement est journalisé.

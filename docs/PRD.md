# DuoMatch — Product Requirements Document (v1)

> Slogan : **Deux cœurs, une belle histoire.** · Public : adultes (18+) d'Afrique francophone et au-delà · Langues : FR (défaut), EN.

## 1. Vision et objectifs

Une plateforme de rencontres moderne, mobile-first, qui privilégie les **relations sérieuses** et la **confiance** : matching fondé sur des critères choisis par l'utilisateur, profils vérifiés par un contrôle réel, messagerie privée, modération humaine, monétisation par abonnements (Premium / VIP).

| # | Objectif | Indicateur |
|---|---|---|
| 1 | Faciliter les rencontres sérieuses | taux de match / profil actif, conversations actives à 7 j |
| 2 | Matching intelligent et transparent | % de compatibilité affiché, critères documentés (§5) |
| 3 | Communication privée et sûre | signalements traités < 48 h, 0 conversation visible d'un tiers |
| 4 | Réduire faux profils et abus | % profils vérifiés, délai de traitement des signalements |
| 5 | Monétiser | conversion gratuit → payant, revenu / mois, rétention D7 |
| 6 | Expérience mobile exceptionnelle | Core Web Vitals, usage à une main (swipe + boutons) |

**Règle d'âge** : 18 ans minimum, contrôlé à l'inscription (schéma partagé web/API) et re-contrôlé côté serveur.

## 2. Personas

- **Aminata, 27 ans, Dakar** — cadre, cherche une relation sérieuse, peu de temps, méfiante vis-à-vis des faux profils. Besoin : badge vérifié, signalement rapide, discrétion.
- **Koffi, 31 ans, Abidjan** — entrepreneur, souhaite se marier. Besoin : filtres d'intention, voir qui l'a liké, paiement Mobile Money.
- **Inès, 28 ans, diaspora (Paris)** — cherche quelqu'un « du pays ». Besoin : filtres pays/ville/langues, FR/EN.
- **Modératrice (staff)** — traite signalements, photos, vérifications, contestations. Besoin : file claire, historique, audit.

## 3. Parcours utilisateur (voir aussi le schéma de flux fourni)

`Inscription → Profil + photos → Découverte → Likes réciproques → Match → Messagerie → (Premium / VIP)`

1. **Inscription** : prénom/pseudo, e-mail, mot de passe, date de naissance (≥ 18), genre, pays, ville, CGU. Consentement marketing **jamais requis**. E-mail à confirmer avant de liker / écrire.
2. **Onboarding (4 étapes)** : à propos (bio, profession, intention, langues) → centres d'intérêt → photos (recadrage, réorganisation) → critères de rencontre.
3. **Découverte** : cartes (swipe droite = like, gauche = passer, boutons équivalents, Super Like, retour arrière Premium), profil complet, bloquer / signaler.
4. **Match** : like réciproque → un seul match (transactionnel, idempotent) → animation + notification + conversation ouverte.
5. **Messagerie temps réel** : texte, émojis, images validées, indicateur de saisie, lecture configurable, recherche, suppression de ses messages, unmatch, blocage, signalement.
6. **Monétisation** : Premium (2 500 FCFA/mois) et VIP (5 000 FCFA/mois), annulables.

## 4. Périmètre fonctionnel

Voir [STATUS.md](STATUS.md) pour l'état exact (terminé / simulé / non implémenté).

### Formules et droits (source de vérité : `PLAN_LIMITS` dans `packages/types`, appliqué côté serveur)

| | Gratuit | Premium | VIP |
|---|---|---|---|
| Likes / jour | 20 | 100 | 1 000 (quasi illimité) |
| Super Likes / jour | 0 | 3 | 10 |
| Voir qui m'a liké | compteur seul (Super Likes visibles) | liste complète | liste complète |
| Filtres avancés (distance, langues, intérêts, vérifiés, activité) | non | oui | oui |
| Retour sur le dernier « passer » | non | oui | oui |
| Boosts de visibilité (1 h) | 0 | 0 | 4 / mois |
| Mode discret | non | non | oui |

## 5. Algorithme de recommandation (documenté, configurable)

Étapes : (1) profils éligibles → (2) filtres obligatoires → (3) exclusions (bloqués, déjà décidés, suspendus, masqués) → (4) score → (5) tri → (6) pagination.

**Filtres obligatoires (symétriques)** : genre recherché ↔ genre du candidat, **préférences réciproques** (le candidat doit accepter mon genre et mon âge), tranche d'âge, ≥ 1 photo non rejetée, profil visible, onboarding terminé, compte actif. Le mode discret (VIP) n'expose le profil qu'aux personnes qu'il a likées.

**Score de compatibilité (0–100, affiché)** — `backend/app/core/scoring.py` :

| Critère | Points max |
|---|---|
| Intention (identique 25, sérieux↔mariage 20, indécis 12, dating↔sérieux 10, dating↔amitié 8) | 25 |
| Centres d'intérêt communs (5 pts chacun, plafonné à 5) | 25 |
| Langue commune | 10 |
| Même ville 20 / même pays 10 | 20 |
| Proximité approximative (si position partagée) | 10 |
| Activité récente (≤ 1 j : 10, ≤ 7 j : 5, ≤ 30 j : 2) | 10 |
| Complétude du profil | 5 |
| Profil vérifié | 5 |

Le **boost** (+20) n'influence que l'**ordre**, pas le % affiché. **Aucun critère protégé** (origine, couleur de peau, religion, handicap…) ne sert au classement ; seuls des filtres *choisis par l'utilisateur* (âge, genre recherché, pays/ville, intention) restreignent les résultats.

## 6. Exigences non fonctionnelles

- **Mobile-first**, responsive, accessibilité WCAG 2.2 AA (contrôle axe automatisé sur les pages publiques, focus visibles, noms accessibles, `prefers-reduced-motion`).
- **Sécurité & vie privée** : voir [SECURITY.md](SECURITY.md).
- **Performance** : pagination par curseur, index SQL, images WebP redimensionnées, pages marketing statiques (SSG).
- **i18n** : next-intl, FR par défaut (sans préfixe), EN sous `/en`, repli sur le français pour toute clé manquante ; ajout d'une langue = un fichier `messages/<l>.json`.

## 7. Hors périmètre v1

Vidéo/appels intégrés, groupes/événements, application native, matching par IA/ML opaque, paiements récurrents automatiques Mobile Money (nécessitent un fournisseur contractualisé).

## 8. Risques principaux

| Risque | Mitigation |
|---|---|
| Arnaques sentimentales | signalement 1 geste, blocage, conseils (blog, aide), modération humaine, vérification par selfie |
| Mineurs | contrôle d'âge serveur, signalement « personne mineure », suspension immédiate |
| Contenus inappropriés | file de revue photos, rejet + suppression fichier ; **pas de détection automatique branchée** (à ajouter, voir STATUS) |
| Fraude au paiement | activation uniquement via webhook signé et idempotent |
| Conformité RGPD / lois locales | export, suppression, minimisation, textes légaux **à faire valider par un juriste** |
| Dépendance au fournisseur de paiement | interface `PaymentProvider` + adaptateurs |

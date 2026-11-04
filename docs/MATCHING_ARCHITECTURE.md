# Architecture du matching

## Principes
1. **Les critères obligatoires sont des filtres, pas des points** : genre recherché, tranche d'âge, réciprocité, pays et ville choisis, intentions choisies, blocages, suspensions, comptes masqués et mineurs sont exclus en SQL avant tout calcul (`discoverysvc._query`).
2. **Le score ordonne les candidats restants** ; il ne remplace jamais un filtre.
3. **Explicable** : chaque score est accompagné de ses raisons (`reasons`) et des centres d'intérêt communs. L'interface le présente comme une *estimation*, jamais comme une garantie de compatibilité amoureuse.
4. **Piloté par l'administration** : les pondérations sont des réglages (`matching.weights`), pas des constantes.
5. **Aucun critère protégé** : origine, couleur de peau, religion, etc. n'interviennent pas dans le score. Seules les informations choisies par la personne sont utilisées.

## Famille de critères et pondérations de départ (total 100)
Valeurs initiales à évaluer avec des données réelles ; ce ne sont pas des vérités scientifiques. Modifiables dans **Admin › Engagement › Réglages** (le total doit faire 100, validé côté serveur et affiché en direct).

| Famille | Poids | Calcul (0 à 1) |
|---|---|---|
| Intentions compatibles | 30 | même intention = 1 ; Sérieux/Mariage = 0,8 ; Incertain = 0,48 ; Rencontre/Sérieux = 0,4 ; Rencontre/Amitié = 0,32 ; sinon 0 |
| Préférences mutuelles | 25 | 0,4 (réciprocité déjà filtrée) + 0,6 × moyenne de la part des critères *facultatifs* satisfaits des deux côtés (intentions, langues, centres d'intérêt déclarés) |
| Centres d'intérêt | 20 | min(communs, 5) / 5 |
| Localisation approximative | 15 | même ville = 1 ; même pays = 0,5 ; la distance approximative (arrondie à 5 km) peut relever la valeur |
| Autres | 10 | 0,4 langue commune + 0,3 activité récente + 0,2 profil complet + 0,1 vérifié |

`compatibility = arrondi(Σ poids × valeur)`. Les poids sont normalisés (`normalize_weights`) pour que le score reste entre 0 et 100 même si la configuration était altérée.

**Boost payant** : ajoute 20 points au *rang* uniquement, jamais au pourcentage affiché ; les découvertes du jour l'ignorent (`boost=False`).

## Raisons affichées
`intent_same`, `intent_close`, `interests_common (n)`, `same_city`, `same_country`, `languages_shared`, `preferences_match`, `active_recently`, `verified` — au plus 4, triées par contribution. Libellés FR/EN dans `engagement.affinity.reasons`.

## Découvertes du jour
- Générées à la première consultation de la journée (`dailysvc`) à partir de la même file éligible que la découverte.
- Taille : `daily.count_free` / `daily.count_premium` (réglages admin). Pas de reproposition avant `daily.cooldown_days`. Historique conservé `daily.retention_days` puis purgé.
- Uniquement de vrais comptes ; un profil devenu inéligible (blocage, suspension) disparaît à l'affichage. Aucun compte à rebours.

## Données privées
Les cartes n'exposent ni e-mail, ni date de naissance, ni coordonnées ; la distance est arrondie à 5 km. L'explication d'affinité ne contient que des codes de raison et des centres d'intérêt déjà visibles sur le profil.

## Évolution vers l'apprentissage automatique
`score_candidate(viewer, cand, distance, weights, prefs)` est une fonction pure : un modèle appris peut la remplacer derrière la même signature, avec repli sur les règles. Prérequis avant de l'envisager :
1. volume suffisant de décisions (likes, matchs, conversations) collectées avec consentement explicite ;
2. audit d'équité (aucun critère protégé ni variable de substitution) ;
3. comparaison hors ligne puis test A/B contre les règles, sur les indicateurs de `ENGAGEMENT_METRICS.md` (taux de première réponse, conversations réciproques) et non sur le temps passé ;
4. explicabilité conservée (les raisons restent affichées).
Rien de cela n'est implémenté.

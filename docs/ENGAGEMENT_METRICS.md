# Indicateurs d'engagement

Source : **Admin › Engagement › Indicateurs** (`GET /api/admin/engagement/metrics`, ADMIN). Tout est calculé en SQL sur les données réelles ; une valeur inconnue s'affiche « — », jamais une estimation.

| Indicateur | Définition |
|---|---|
| Profils complétés | profils avec `onboardedAt` renseigné |
| Profils avec questions | membres ayant au moins `prompts.min` réponses ; taux = part des profils complétés |
| J'aime / avec commentaire | `Swipe` LIKE ou SUPER_LIKE ; part avec `comment` non nul |
| Matchs | `Match` actifs |
| Taux de match | 2 × matchs / J'aime (part des J'aime ayant abouti à un match) |
| Conversations démarrées | conversations ayant au moins un message non supprimé |
| Taux de première réponse | part de ces conversations où l'autre personne a aussi écrit |
| Conversations réciproques | nombre de conversations où les deux personnes ont écrit |
| Signalements | total et ouverts |
| Rétention J7 / J30 | parmi les comptes inscrits depuis au moins 7 (30) jours, part dont la dernière activité est postérieure à J+7 (J+30). **Approximation** fondée sur `lastActiveAt` ; la cohorte est affichée |
| Conversion Premium | part des membres actifs avec une formule autre que FREE |
| Découvertes du jour (30 j) | sélections générées ; part suivie d'une décision (J'aime ou Passer) |

## Limites à garder en tête
- Un commentaire de like devenu premier message compte comme message : le taux de première réponse inclut ces messages.
- La rétention exacte « actif le jour J7 » demanderait un journal d'activité quotidien ; il n'existe pas.
- Les premiers jours, les cohortes sont petites : lire le taux avec sa cohorte.

## Non mesuré (affiché comme tel dans l'admin)
Rendez-vous proposés et acceptés, satisfaction déclarée, rencontres réelles. Ces données ne seront collectées qu'à partir de déclarations **volontaires** des utilisateurs, quand les fonctionnalités correspondantes existeront (phase 3). Elles ne sont jamais déduites.

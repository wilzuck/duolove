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
| Rendez-vous proposés / acceptés / terminés | `DateProposal` par statut (acceptés = ACCEPTED + COMPLETED) ; taux d'acceptation = acceptés / propositions traitées (acceptées, refusées, reportées) |
| Satisfaction déclarée | moyenne des retours 1 à 5 donnés **volontairement** après un rendez-vous terminé ; effectif affiché ; jamais déduite |
| Membres en pause / avec période de repos | profils dont la pause est en cours ; préférences avec une période de repos renseignée (aucune donnée de comportement) |
| Découvertes du jour (30 j) | sélections générées ; part suivie d'une décision (J'aime ou Passer) |

## Limites à garder en tête
- Un commentaire de like devenu premier message compte comme message : le taux de première réponse inclut ces messages.
- La rétention exacte « actif le jour J7 » demanderait un journal d'activité quotidien ; il n'existe pas.
- Les premiers jours, les cohortes sont petites : lire le taux avec sa cohorte.

## Rencontres réelles et satisfaction
Un rendez-vous n'est « terminé » que si l'un des deux membres le déclare (après l'heure de début) ; le retour de satisfaction est facultatif et privé. Les propositions restées sans réponse après leur heure de début sont clôturées en « annulé » : le nombre d'annulations inclut donc ces expirations. Rien n'est déduit des conversations.

## Non mesuré
Speed dating et appels (fonctionnalités non démarrées).

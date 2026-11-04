# Guide administrateur

Accès : `/admin` (menu « Administration », visible pour le personnel). La console a sa propre barre latérale, groupée comme sur WaMarcket : **Pilotage** (vue d'ensemble, modération, journal d'audit), **Membres** (utilisateurs, signalements), **Revenus** (abonnements, paiements), **Paramètres** (feature flags). Les pastilles du menu comptent le travail en attente (signalements ouverts, vérifications et contestations). Rôles :

| Rôle | Peut |
|---|---|
| **MODERATOR** | utilisateurs (sans e-mail), signalements, photos, vérifications, contestations ; suspendre/bannir des membres |
| **ADMIN** | + vue d'ensemble, abonnements/paiements, job d'expiration, feature flags, journal d'audit, e-mails des membres |
| **SUPER_ADMIN** | + changer les rôles (USER/MODERATOR/ADMIN) |

Règles : on ne sanctionne pas un membre du personnel ni soi-même. **Toute action est journalisée** (Paramètres & audit).

## Traiter un signalement
1. *Signalements* → file « Ouverts » (les plus anciens d'abord). Lire le motif, les détails et le nombre total de signalements contre la personne.
2. *Prendre en charge* pour marquer « en cours », ouvrir la fiche (*Utilisateurs*) pour voir bio, photos et historique.
3. Sanctionner si nécessaire : **Suspendre** (durée en jours, motif **visible par le membre**) ou **Bannir** (sessions révoquées, profil masqué).
4. Clore : *Résolu* ou *Rejeter*.

## Vérifier un profil (badge)
*Modération → Vérifications* : comparer le selfie aux photos du profil. *Approuver* donne le badge et **supprime le selfie** ; *Rejeter* aussi. Le badge ne doit jamais être attribué sans contrôle réel.

## Photos
*Modération → Photos* : parcourir les dernières photos ; *Rejeter* supprime le fichier et promeut la photo suivante.

## Contestations
Un membre suspendu peut contester depuis l'écran de suspension. *Modération → Contestations* : lire la sanction et l'argumentaire, *Accepter* (compte réactivé) ou *Rejeter*. Idéalement, un modérateur différent de celui qui a sanctionné.

## Finances (ADMIN)
*Abonnements & paiements* : liste des abonnements et paiements (statut, facture, échec). **Lancer le job d'expiration** exécute manuellement ce qui tourne déjà toutes les heures (expiration, rappels J-3).

## Feature flags
*Paramètres & audit* : créer/activer des drapeaux (clé `a-z0-9_.-`). Lecture publique : `GET /api/feature-flags`. Les drapeaux sont disponibles pour conditionner des fonctions ; aucun n'est branché par défaut.

## Premier administrateur en production
Voir DEPLOYMENT.md (promotion SQL contrôlée). Ne partagez jamais un compte staff.

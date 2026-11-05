# Feuille de route — engagement

| Phase | Contenu | Statut |
|---|---|---|
| 0 — Audit | `ENGAGEMENT_AUDIT.md` | **Terminé** |
| 1 — Profils et matching | score pondéré configurable et explicable, questions de personnalité, likes avec commentaire, découvertes du jour + historique, pilotage admin (réglages, questions, flags), indicateurs réels | **Terminé et vérifié** (pytest 134, Playwright 40) |
| 2 — Communication | réactions, réponses ciblées, brise-glace par modèles FR/EN, accusés de lecture réservés aux abonnés, indicateur de saisie facultatif, emoji au curseur | **Terminé et vérifié** (pytest 145, Playwright 47). **Non fait** : messages vocaux, GIF contrôlés |
| 3 — Rencontres | proposition de rendez-vous (statuts proposé/accepté/refusé/reporté/annulé/terminé), speed dating textuel puis audio/vidéo, appels WebRTC | **Partiel** : mode rendez-vous **terminé et vérifié** (pytest 154, Playwright 62). **Non démarrés** : speed dating, appels audio/vidéo |
| 4 — Fidélisation | préférences d'engagement, mode pause, notifications regroupées et heures de repos, conseils de profil | **Terminé et vérifié** (pytest 166, Playwright 68). Non fait : e-mail récapitulatif quotidien, notifications push |
| 5 — Administration et monétisation | quotas Premium des nouvelles fonctions, analytics rencontres/satisfaction (sur déclaration volontaire) | Partiel : réglages et indicateurs de la phase 1 |
| 6 — Qualité | performance, accessibilité, sécurité, préparation production | Continu |

## Ordre recommandé pour la suite
2. **Speed dating textuel** puis **appels audio/vidéo** (reste de la phase 3) : le mode rendez-vous fournit déjà les règles de consentement et de sécurité sur lesquelles s'appuyer.
3. **Messages vocaux** (stockage, limites de durée, contrôle des pièces jointes) et **GIF contrôlés** (nécessitent un fournisseur externe et sa clé : à décider).

## Points de vigilance avant production
- Valider les pondérations sur des données réelles ; ne pas les présenter comme scientifiques.
- Ajouter une détection de contenus à risque (numéros, demandes d'argent) dans les commentaires et messages.
- Redis pour le limiteur de débit et la présence si plusieurs instances.
- Aucune fonctionnalité de cette feuille de route n'est déployée sans autorisation explicite.

# Feuille de route — engagement

| Phase | Contenu | Statut |
|---|---|---|
| 0 — Audit | `ENGAGEMENT_AUDIT.md` | **Terminé** |
| 1 — Profils et matching | score pondéré configurable et explicable, questions de personnalité, likes avec commentaire, découvertes du jour + historique, pilotage admin (réglages, questions, flags), indicateurs réels | **Terminé et vérifié** (pytest 134, Playwright 40) |
| 2 — Communication | réactions, réponses ciblées, brise-glace par modèles FR/EN, accusés de lecture réservés aux abonnés, indicateur de saisie facultatif, emoji au curseur | **Terminé et vérifié** (pytest 145, Playwright 47). **Non fait** : messages vocaux, GIF contrôlés |
| 3 — Rencontres | proposition de rendez-vous (statuts proposé/accepté/refusé/reporté/annulé/terminé), speed dating textuel puis audio/vidéo, appels WebRTC | Non démarré |
| 4 — Fidélisation | préférences d'engagement, mode pause, notifications regroupées et heures de repos, conseils de profil | Non démarré |
| 5 — Administration et monétisation | quotas Premium des nouvelles fonctions, analytics rencontres/satisfaction (sur déclaration volontaire) | Partiel : réglages et indicateurs de la phase 1 |
| 6 — Qualité | performance, accessibilité, sécurité, préparation production | Continu |

## Ordre recommandé pour la suite
1. **Mode pause et préférences d'engagement** avant d'ajouter d'autres notifications (phase 4, la plus utile pour la fidélisation éthique).
2. **Rendez-vous** (statuts, consentement, partage volontaire avec un proche) avant le speed dating et les appels (phase 3).
3. **Messages vocaux** (stockage, limites de durée, contrôle des pièces jointes) et **GIF contrôlés** (nécessitent un fournisseur externe et sa clé : à décider).

## Points de vigilance avant production
- Valider les pondérations sur des données réelles ; ne pas les présenter comme scientifiques.
- Ajouter une détection de contenus à risque (numéros, demandes d'argent) dans les commentaires et messages.
- Redis pour le limiteur de débit et la présence si plusieurs instances.
- Aucune fonctionnalité de cette feuille de route n'est déployée sans autorisation explicite.

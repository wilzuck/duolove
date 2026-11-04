# DuoMatch — instructions permanentes

Les règles communes à tous les agents (stack, commandes, conventions, sécurité) sont dans [`AGENTS.md`](AGENTS.md). Lis-le avant toute modification.

Rappels propres à Claude Code :

- Avant de déclarer une tâche terminée : `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (et `pnpm test:e2e` si un parcours utilisateur change). Rapporte les résultats réels.
- Distingue toujours **terminé / simulé / non implémenté** dans tes comptes rendus et mets à jour `docs/STATUS.md`.
- Ne commite et ne pousse que sur demande explicite ; indexe les fichiers par nom.

# DuoMatch — guide pour les agents IA et contributeurs

Plateforme de rencontres (18+), **mobile-first** : juge toute interface d'abord sous 768 px. Voir `README.md`, `docs/ARCHITECTURE.md`, `docs/STATUS.md`.

## Stack et commandes

| Couche | Techno |
|---|---|
| Web (`apps/web`) | Next.js 16 (App Router, `proxy.ts`), React 19, Tailwind 4, `next-intl`, TanStack Query, Zustand |
| API (`apps/api`) | NestJS 12 (**ESM** : imports relatifs en `.js`), Prisma 7 (`prisma/schema.prisma` à la racine), PostgreSQL |
| Partagé | `packages/types` (Zod + constantes, **compilé** : relancer `pnpm --filter @duomatch/types build` après modification), `packages/ui` (design system, source) |

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # avant toute livraison
pnpm test:e2e                                            # parcours complets (navigateur réel)
node apps/web/scripts/i18n-check.mjs                     # clés de traduction
```

> Ce n'est pas le Next.js de ton entraînement (v16) : lis le guide concerné dans `apps/web/node_modules/next/dist/docs/` avant d'écrire du code Next.

## Règles non négociables

1. **Aucun texte en dur** : tout passe par `apps/web/messages/fr.json` **et** `en.json` (`useTranslations()` avec **clé complète**, sans espace de noms, pour que `i18n-check` la détecte). Le nom du site s'écrit « DuoMatch ».
2. **Aucune couleur en dur** : variables CSS de `packages/ui/src/tokens.css` (`bg-brand-strong`, `text-brand-ink`…). `#E91E63` est décoratif ; les boutons pleins sous texte blanc utilisent `brand-strong` (contraste AA).
3. **Dates : toujours `DatePicker`** (`packages/ui`, react-day-picker adapté de WaMarcket) — jamais `<input type="date">`. `dropdowns` pour une date de naissance.
4. **Composants d'abord** : cherche dans `packages/ui` (`Button`, `Field`, `Input`, `Card`, `Dialog`, `Badge`, `Avatar`, `Switch`, `EmptyState`…) avant d'écrire du JSX ; un bloc utilisé deux fois s'extrait.
5. **Droits côté serveur uniquement** : quotas, filtres Premium, mode discret, boosts se vérifient dans l'API (`EntitlementsService`). Le frontend n'est qu'un reflet. Jamais d'activation d'abonnement sur un retour de navigateur : seul le **webhook signé** active.
6. **Sécurité à chaque tâche** : qui peut appeler l'endpoint (garde, rôle, appartenance de la ressource), ce qu'un anonyme peut y injecter, limite de débit, aucune donnée sensible dans URL/logs/erreurs. Les entrées passent par un schéma Zod (`@duomatch/types`).
7. **Vie privée** : jamais de position précise (arrondie à 0,1° avant stockage), jamais d'e-mail d'un autre membre dans une réponse, fichiers `private/` jamais servis publiquement.
8. **Aucune erreur avalée** sans commentaire « Silence assumé : … ». Messages d'erreur = **codes stables** (`AppError(status, 'CODE')`) traduits côté web (`errors.<CODE>`).
9. **Migrations** : jamais éditer une migration appliquée ; jamais `migrate reset` / drop sur la base `duomatch`. Seules `duomatch_test` (et bases `*_test`) sont jetables.
10. **Aucun secret dans un commit** (`.env*` est ignoré ; `.env.example` sans valeur réelle).
11. **Tests** : toute fonction métier ajoutée = un test (intégration API sur PostgreSQL réel pour la logique serveur ; E2E pour un parcours). Ne jamais inventer un résultat de test. Documenter honnêtement ce qui est simulé ou non implémenté (`docs/STATUS.md`).
12. Pas de refactoring gratuit, pas de fonctionnalité non demandée ; commentaires = le *pourquoi* non évident seulement.
13. Accessibilité : nom accessible pour chaque bouton-icône, focus visible, usage clavier, `prefers-reduced-motion`, textes qui changent de longueur (FR/EN) sans débordement.

## Où est quoi

- `apps/api/src/<module>/` : `*.controller.ts` (+ `*.service.ts`, module déclaré en bas du contrôleur). Garde global : `common/auth.ts` (`@Public`, `@Roles`, `@RequireVerified`, `@AllowSuspended`).
- `apps/api/test/flows.spec.ts` : intégration (helpers `seedMember`, `login`) · `apps/web/e2e/` : Playwright.
- `apps/web/src/app/[locale]/(marketing|auth|app)/…` : routes ; `(app)/admin` : back-office ; `src/components/app/` : composants métier ; `src/hooks/` : requêtes et temps réel.

## Environnement local

- Chemin du projet avec un espace (`Github /DuoMatch`) : le lanceur `preview_start` échoue (`EPERM uv_cwd`) → démarrer l'API (`node apps/api/dist/main.js` depuis `apps/api`) et le web (`next dev --webpack`) via le shell.
- Pas de Docker ni de Redis sur la machine de développement d'origine : voir `docs/STATUS.md`.

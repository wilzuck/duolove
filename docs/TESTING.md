# Tests et qualité

## Commandes

```bash
pnpm lint          # ESLint (API, web, ui, types)
pnpm typecheck     # tsc strict sur les 6 paquets
pnpm test          # API (Vitest + PostgreSQL réel) + web (Vitest) ; applique les migrations sur duomatch_test
pnpm build         # types → ui → api → web
pnpm test:e2e      # Playwright (lance API + web si absents ; base duomatch_test)
pnpm audit:deps    # pnpm audit --prod
node apps/web/scripts/i18n-check.mjs   # cohérence FR/EN et clés utilisées
```

Prérequis : PostgreSQL local, bases `duomatch` (dev) et `duomatch_test` (créer avec `createdb`). `TEST_DATABASE_URL` / `E2E_DATABASE_URL` pour changer l'URL. Les tests **n'utilisent jamais** la base de développement.

## Couverture (résultats du 2026-11-03)

| Couche | Fichiers | Tests | Résultat |
|---|---|---|---|
| API · unitaires (`src/**/*.spec.ts`) | scoring, complétude, distance, anti-spam, schéma d'inscription | 10 | ✅ 10/10 |
| API · intégration (`test/flows.spec.ts`) | auth, profil/photos, découverte, match, messagerie, quotas, paiements/webhook, RBAC, export/suppression | 16 | ✅ 16/16 |
| API · Match en direct (`test/live.spec.ts`) | critères purs, réciprocité, jetons offerts à 100 %, essais gratuits + délai, invitations (en ligne/compatible/non bloqué), plafond anti-harcèlement, parcours payé en jetons, concurrence | 11 | ✅ 11/11 |
| Web · unitaires | formatage, client API/erreurs, cohérence i18n | 6 | ✅ 6/6 |
| E2E · parcours (`e2e/journey.spec.ts`) | 12 scénarios, 2 membres, navigateur réel | 6 | ✅ 6/6 |
| E2E · Match en direct (`e2e/live.spec.ts`) | critères → invitation → acceptation → conversation avec 1 jeton, axe sur `/match` | 4 | ✅ 4/4 |
| E2E · accessibilité (axe WCAG A/AA/2.2) | `/`, `/login`, `/register`, `/pricing`, `/help`, `/en` | 6 | ✅ 6/6 (0 violation) |
| E2E · smoke | pages publiques FR/EN, sitemap/robots, 404, redirection login | 1 | ✅ |

### Les 12 scénarios demandés → tests

| # | Scénario | Où |
|---|---|---|
| 1 | Inscription d'un adulte | `journey` 1-4 + intégration (refus d'un mineur, doublon, mot de passe faible) |
| 2 | Vérification e-mail | `journey` 1-4 (lien lu dans la boîte dev) + intégration |
| 3 | Complétion du profil | `journey` 1-4 (4 étapes d'onboarding) |
| 4 | Ajout de photos | `journey` 1-4 (recadrage) + intégration (EXIF, image invalide) |
| 5 | Découverte d'un profil | `journey` 5-6 + intégration (filtres mutuels, blocages, suspendus, discret) |
| 6 | Envoi d'un like | `journey` 5-6 + quotas |
| 7 | Match réciproque | `journey` 7-8 + intégration (**likes simultanés → 1 seul match**) |
| 8 | Envoi d'un message | `journey` 7-8 (temps réel entre deux navigateurs) |
| 9 | Blocage | `journey` 9 + intégration (conversation fermée) |
| 10 | Souscription Premium | `journey` 10-11 (checkout → webhook signé) + intégration |
| 11 | Annulation | `journey` 10-11 |
| 12 | Suppression du compte | `journey` 12 + intégration (export + anonymisation) |

## Ce que les tests ne couvrent pas (à faire)

- Pages authentifiées avec axe ; lecteurs d'écran ; tests manuels sur appareils Android d'entrée de gamme.
- Charge / performance (découverte sur de gros volumes, WebSocket multi-instances).
- Fournisseurs externes réels (Google, SMTP, paiement).
- Test d'intrusion.

- Promos et parrainage : `apps/api/test/promo.spec.ts` (14 tests : calcul serveur, unicité par membre, plafond sous concurrence, remboursement, récompense unique, plafond de parrain) et `apps/web/e2e/promo.spec.ts` (parcours lien d'invitation → récompense, création de codes en admin, remise en boutique, jetons offerts ; axe sur `/referral`, `/admin/promos`, `/shop`). L'E2E promeut un compte en ADMIN par `psql` sur `duomatch_test`.

## Bugs trouvés et corrigés grâce à ces tests (exemples)

- Miniatures de photos en 404 (le suffixe `_t` était refusé par la validation de nom de fichier) → test de non-régression.
- Fusion de repli FR→EN qui transformait les tableaux en objets (pages légales/blog cassées en anglais).
- Préférences de découverte non préremplies à l'onboarding (membres de tous pays affichés).
- Comptes staff redirigés vers l'onboarding de rencontre.

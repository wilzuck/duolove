# État réel des fonctionnalités

Vérifié le 2026-11-03 : `pnpm lint`, `pnpm typecheck`, `pnpm test` (API 26 + web 6), `pnpm build`, E2E Playwright 13/13, `pnpm audit --prod` sans vulnérabilité. Détails dans [TESTING.md](TESTING.md).

**Terminé = implémenté, branché au backend réel (PostgreSQL) et couvert par au moins un test automatisé.**

## ✅ Terminé

| Domaine | Détail |
|---|---|
| Fondations | monorepo pnpm/Turborepo, Next 16, NestJS 12, Prisma 7, PostgreSQL, design system, i18n FR/EN, thème clair/sombre |
| Pages publiques | accueil, comment ça marche, tarifs, à propos, blog (3 articles), contact, aide, CGU, confidentialité, cookies, règles — SEO, Open Graph, sitemap, robots |
| Auth | inscription (18+), connexion, déconnexion, e-mail à confirmer, mot de passe oublié/réinitialisation, changement de mot de passe, verrouillage, sessions actives, Google (code prêt) |
| Profil | onboarding 4 étapes, photos (recadrage, ordre, principale, suppression, suppression EXIF), complétude, préférences, vérification par selfie (revue humaine), boost VIP |
| Découverte | swipe (glisser/boutons/clavier), Super Like, retour arrière, filtres gratuits + Premium (serveur), score + % de compatibilité, exclusion bloqués/suspendus/masqués, mode discret, position arrondie |
| Likes / matchs | quotas par formule, match transactionnel idempotent (verrou de paire), animation, likes reçus (verrouillés en gratuit) |
| Messagerie | temps réel Socket.IO, texte/émojis/images, frappe, lecture configurable, historique paginé, recherche, suppression, unmatch, blocage, signalement, anti-spam |
| Notifications | in-app + temps réel + e-mail (préférences), page de réglages |
| Abonnements | plans, checkout, **webhook signé idempotent**, factures, historique, annulation/reprise, expiration, droits côté serveur |
| Calendrier | composant `DatePicker` (react-day-picker, repris de WaMarcket) avec menus mois/année, utilisé pour la date de naissance ; à réutiliser pour toute date |
| Monétisation | offres, prix par durée (1/3/6/12 mois), quotas et remises **configurables** (`/admin/plans`), Charme+ (boutique de boosts, packs de Super Likes et jetons), portefeuille de crédits idempotent — voir [MONETISATION.md](MONETISATION.md) |
| Match en direct | menu `/match` : critères (âge, genre, pays, enfants, animaux, vie, taille, origine), invitation des personnes **en ligne** compatibles et réciproques, acceptation en direct (Socket.IO), conversation ouverte contre **1 jeton** (2 personnes au plus par recherche), recherche active 24 h relançable toutes les 15 min, **3 jetons offerts une fois** à 100 % de profil + e-mail vérifié, packs de jetons en boutique, essais gratuits pour le plan Gratuit — voir [MONETISATION.md](MONETISATION.md) §8 |
| Administration | console dédiée (barre latérale groupée, pastilles de travail en attente), RBAC (modérateur/admin/super-admin), stats, utilisateurs (suspendre/bannir/lever/rôle), signalements, photos, vérifications, contestations, abonnements/paiements, feature flags, journal d'audit |
| Vie privée | export JSON, suppression/anonymisation, visibilité, accusés de lecture, consentement marketing |
| Qualité | ESLint, TypeScript strict, tests unitaires + intégration (PostgreSQL réel) + E2E + axe (WCAG 2.2 AA), audit dépendances |

## 🟡 Simulé ou partiel

| Élément | Réalité |
|---|---|
| **KKiaPay** | adaptateur écrit (widget + vérification serveur + webhook), testé avec une **API KKiaPay simulée** ; **jamais exécuté contre le vrai bac à sable** (pas de clés). Le format (en-têtes, champs, statuts) est repris de WaMarcket, où KKiaPay fonctionne en production ; à valider au premier test sandbox de DuoMatch (voir DEPLOYMENT.md). |
| **Paiement (mock)** | fournisseur `mock` : même chemin que la production (checkout → webhook HMAC → activation) mais **aucun argent réel**. La page `/checkout/mock` et `POST /payments/mock/:ref/complete` sont désactivées en production. |
| Google OAuth | flux serveur (vérification du jeton d'identité, audience) écrit mais **non testé** sans `GOOGLE_CLIENT_ID` réel |
| E-mail | SMTP via nodemailer **non testé** avec un vrai serveur ; en dev les e-mails vont dans une boîte mémoire (`/api/dev/outbox`) |
| Images « après validation » | validation technique (décodage, format, taille, nettoyage) ; **pas de modération automatique du contenu** |
| Docker / Compose / CI | écrits, **non exécutés** (Docker indisponible localement ; la CI n'a pas tourné sur GitHub) |
| Textes légaux | brouillons à faire valider par un juriste |
| Distance | calculée uniquement si les deux membres ont partagé une position approximative |

## ⛔ Non implémenté

- Match en direct : présence **en mémoire d'un seul processus** (plusieurs instances → adaptateur Redis de Socket.IO) ; pas de dotation mensuelle de jetons par formule (à ajouter dans les fonctionnalités de formule) ; pas de remboursement de jetons ; pas de tableau de bord admin dédié
- Stripe, CinetPay (non demandés pour l'instant) ; KKiaPay couvre déjà MTN/Moov/Wave côté widget · Apple Sign In (compte développeur requis)
- Redis, BullMQ (limiteur, files, expiration en `setInterval`), stockage S3/R2 (interface prête, pilote local seulement)
- Notifications **push PWA** (le manifeste existe ; pas de service worker ni VAPID) — l'interface l'indique « Bientôt »
- Détection automatique NSFW / mineurs / comportements suspects
- Job de purge RGPD différée, politique de rétention appliquée
- Monitoring (Sentry, métriques, alertes), logs JSON structurés, sauvegardes automatisées (documentées seulement)
- CSP côté web, 2FA, notifications de connexion inhabituelle
- Mesure Lighthouse / Core Web Vitals en environnement déployé ; audit d'accessibilité des pages authentifiées (axe n'est lancé que sur les pages publiques)
- Témoignages : volontairement absents (aucun témoignage authentique disponible)

## Jetons Match mensuels (livré)
- **Terminé** : clé de formule `match_tokens_monthly` (Premium 5, VIP 15, réglable dans `/admin/plans`) ; crédit à l'activation × mois, idempotent ; repris au remboursement ; affiché sur la page Tarifs. Testé (API : 68/68).
- **Limites** : crédité d'un bloc (pas de distribution mensuelle ni d'expiration) ; pas de rétroaction sur les abonnés déjà actifs.

## Promos et parrainage (livré)
- **Terminé** : codes promo (remise % ou jetons offerts) créés et désactivés en admin, appliqués au paiement côté serveur, plafonds et unicité testés en concurrence ; parrainage avec lien d'invitation, récompense unique 5/2 jetons, plafond de 20 ; page `/referral`, champ à l'inscription, saisie de code dans Charme+ et sur Premium ; migration `20261104150000_promos_referral`.
- **Tests** : API 82/82 (14 nouveaux), E2E 22/22 sur le dernier passage (5 nouveaux). Deux passages précédents avaient échoué sur des tests Match/admin déjà verts seuls et n'ont pas été reproduits en 3 relances : cause non identifiée.
- **Corrigé au passage** : contraste de `--success-ink` (4,4:1 → ≥ 7:1) détecté par axe sur l'admin.
- **Non implémenté** : parrainage via Google, détection d'abus par IP/appareil, réglage admin des montants de récompense.

## Feature flags (livré)
- **Terminé** : catalogue FERMÉ de 8 interrupteurs (`FEATURE_FLAGS`, `packages/types`) : inscriptions, paiements, codes promo, boosts, Match en direct, Super Likes, photos dans les messages, parrainage. Page `/admin/flags` : fonctions groupées (Accès / Argent / Rencontres), badge « Coupure d'urgence », état réel (valeur par défaut = actif), icône « i » qui explique à quoi sert la fonction, ce qui se passe activée/coupée et quand l'utiliser.
- **Appliqué côté serveur** (jamais seulement masqué) : garde `@RequireFlag` (503 `FEATURE_DISABLED`) + contrôles dans les services ; changements audités (avant → après) et pris en compte immédiatement (cache 10 s invalidé).
- **Garde-fous métier** : une coupure des paiements laisse terminer un paiement déjà lancé et n'empêche pas les remboursements ; la coupure des inscriptions ne bloque pas la connexion des membres existants ; les filleuls en attente sont récompensés à la réactivation du parrainage.
- **Tests** : API `flags.spec.ts` (7) ; E2E `flags.spec.ts` (2, axe inclus).
- **Limites** : l'interface des membres ne masque pas encore les menus d'une fonction coupée (elle affiche l'erreur « temporairement indisponible ») ; pas de flags par pourcentage ou par groupe de membres ; les clés libres ont été supprimées (catalogue fermé).

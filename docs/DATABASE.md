# Base de données (PostgreSQL 17 · SQLAlchemy 2 + Alembic)

Modèles : [`backend/app/models/models.py`](../backend/app/models/models.py) · migrations : `backend/alembic/versions/` (une seule tête). Les noms de tables et de colonnes (casse conservée) sont ceux créés à l'origine par Prisma ; la migration `0001_baseline` les recrée sur une base vide et ne fait rien sur une base existante. Les identifiants et `updatedAt` sont produits par l'application (pas de défaut SQL).

## Entités

| Groupe | Modèles | Points clés |
|---|---|---|
| Comptes | `User`, `Account`, `Session`, `VerificationToken` | e-mail unique ; `passwordHash` Argon2id (nul pour OAuth) ; session = hash SHA-256 du jeton opaque ; jetons e-mail/mot de passe hachés, à usage unique, avec expiration |
| Profils | `Profile`, `ProfilePhoto`, `Preference`, `Interest`, `UserInterest`, `VerificationRequest` | `Profile.approxLat/Lng` **arrondis à 0,1°** ; photo : clé de stockage, ordre, `isPrimary`, statut de modération ; vérification = demande + selfie privé |
| Rencontres | `Swipe`, `Match`, `Conversation`, `Message`, `MessageAttachment` | `Swipe` unique `(giverId,targetId)` ; `Match` unique `(userAId,userBId)` avec `userAId < userBId` ; message supprimé = `deletedAt` + corps vidé |
| Sécurité | `Block`, `Report`, `ModerationAction`, `AuditLog` | blocage unique par paire ; actions de modération avec contestation (`appealStatus`) ; audit des actions admin |
| Monétisation | `SubscriptionPlan` (accroches `taglineFr`/`taglineEn` modifiables), `Subscription`, `Payment`, `Invoice`, `Entitlement`, `WebhookEvent` | `Payment` unique `(provider, providerRef)` ; `Invoice` 1-1 avec le paiement ; `WebhookEvent` unique `(provider,eventId)` = idempotence ; `Entitlement` = droits matérialisés côté serveur |
| Match en direct | `LiveSearch`, `LiveInvite` | recherche = critères JSON + `expiresAt` (24 h) ; invitation unique `(searchId, inviteeId)` ; statuts `PENDING → ACCEPTED → CHOSEN` ; jetons = `CreditWallet`/`CreditTransaction` (type `MATCH_TOKEN`, cadeau unique `(userId, GRANT_PROFILE, 'profile100')`) ; `Profile` : `hasChildren`, `likesPets`, `living`, `heightCm`, `originCountry`, `liveOptIn` |
| Blog | `BlogPost` | une ligne par langue ; unique `(locale, slug)` ; `status` DRAFT/PUBLISHED ; image de couverture (`coverKey`, fichier `blog/<hex>.webp` + miniature `_t`) obligatoire pour publier ; corps en Markdown restreint |
| Engagement | `ProfilePrompt`, `ProfilePromptAnswer`, `DailyRecommendation` (+ colonnes `comment`, `targetKind`, `targetRef` sur `Swipe`) | questions bilingues gérées par l'admin ; réponse unique par `(userId, promptId)` ; sélection du jour unique par `(userId, targetId, day)`, purgée après `daily.retention_days` ; réglages dans `SystemSetting` (clés `matching.weights`, `daily.*`, `prompts.*`, `likes.comment_max`) |
| Messagerie enrichie | `MessageReaction`, `IcebreakerTemplate` (+ `Message.replyToId`, `Profile.typingIndicator`) | réaction unique par `(messageId, userId)`, emoji validé côté serveur ; modèles de brise-glace bilingues par type (INTEREST / INTENT / GENERIC) gérés par l'admin ; citation = `replyToId` (SET NULL si le message est supprimé définitivement) |
| Rendez-vous | `DateProposal`, `DateReminder`, `DateShare` | statuts PROPOSED/ACCEPTED/DECLINED/RESCHEDULED/CANCELED/COMPLETED ; lieu public = catégorie fermée + nom (aucune localisation de membre) ; une proposition reportée garde `previousId` ; rappel unique par `(dateId, userId)` ; lien de partage : seul le hash du jeton est stocké, expiration et révocation |
| Rythme | `Profile.pausedAt/pauseEndsAt`, `NotificationPreference.quietStart/quietEnd/tzOffsetMinutes/dateReminders`, `Notification.emailedAt` | pause toujours bornée (`pause.max_days`) ; période de repos en minutes locales avec décalage UTC, éventuellement à cheval sur minuit ; `emailedAt` sert au plafond quotidien et à l'e-mail unique par heure et par conversation |
| Divers | `Notification`, `NotificationPreference`, `FeatureFlag` | notifications indexées `(userId, readAt, createdAt desc)` |

## Contraintes et index importants

- Unicité : `User.email`, `Session.tokenHash`, `VerificationToken.tokenHash`, `Swipe(giverId,targetId)`, `Match(userAId,userBId)`, `Block(blockerId,blockedId)`, `Payment(provider,providerRef)`, `Invoice.number`, `WebhookEvent(provider,eventId)`, `Interest.slug`.
- Index de lecture : `Profile(country,city)`, `Profile(gender,birthDate)`, `Profile(visibility,boostedUntil)`, `Swipe(targetId,action)`, `Message(conversationId,createdAt desc)`, `Report(status,createdAt)`, `Subscription(currentPeriodEnd,status)`.
- **Pagination par curseur** : messages, notifications, listes admin (`orderBy [createdAt desc, id desc]` + `cursor`). La découverte pagine par décalage dans la liste *classée* (le score est calculé en mémoire sur ≤ 200 candidats).

## Transactions

- Match : `$transaction` + `pg_advisory_xact_lock(hashtextextended('<idA>:<idB>'))` → lecture du like inverse → `upsert` du match et de la conversation. Rejouer un swipe est sans effet (idempotent).
- Webhook paiement : création `WebhookEvent` (unique) → mise à jour paiement + facture + abonnement + droits dans une transaction.
- Suppression de compte : une transaction (statut, anonymisation, révocation sessions, suppression photos/intérêts, messages vidés, matchs clos, abonnements annulés).

## Stratégies de suppression

- Contenu d'un utilisateur : `onDelete: Cascade` depuis `User` (profil, photos, swipes, matchs, messages, notifications…) pour une purge physique ultérieure.
- **Suppression fonctionnelle** : le compte passe en `DELETED`, l'e-mail devient `deleted+<id>@duomatch.invalid`, le profil est anonymisé, les fichiers sont effacés. Une purge physique différée (30 jours) est recommandée mais **non implémentée** (voir STATUS).
- `AuditLog.actorId` → `SetNull` ; `Report.resolvedById`, `ModerationAction.moderatorId` conservés pour la traçabilité.

## Migrations

```bash
make -C backend revision m="message"   # crée une migration depuis les modèles (relire le script !)
pnpm db:migrate                         # applique les migrations (alembic upgrade head)
make -C backend check                   # aucune migration en attente + une seule tête
```
| Promos et parrainage | `PromoCode`, `Referral` | code en MAJUSCULES unique ; `kind` PERCENT (1–90 %, figé sur `Payment.discountXof`/`promoCodeId`) ou TOKENS (crédit unique `(userId, PROMO, 'promo:<id>')`) ; `User.referralCode` unique ; `Referral.refereeId` unique (un seul parrain par filleul), statut `PENDING → REWARDED`, crédits `(userId, REFERRAL, 'referral:<filleul>' ou 'referral-bonus')` |

Ne jamais éditer une migration déjà appliquée ; ne jamais lancer `migrate reset` sur une base qui contient des données utiles. Les tests utilisent une base dédiée `duomatch_test`.

## Données de développement

`pnpm db:seed` (refuse de tourner en production) : plans, centres d'intérêt, 3 comptes staff et 24 membres de démonstration en `@duo.test`. Mot de passe de développement affiché à la fin de la commande.

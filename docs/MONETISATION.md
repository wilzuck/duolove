# Monétisation et administration — audit, architecture, avancement

Ce document répond au cahier des charges « DuoMatch — Monétisation, abonnements, paiements, administration ». Il distingue ce qui est **terminé et testé**, **partiel**, et **non commencé**.

## 1. Audit de l'existant (début de cette phase)

| Domaine | État constaté |
|---|---|
| Offres | 3 formules figées dans le code (`PLAN_LIMITS`), prix en constantes ; une seule durée (30 jours) |
| Droits | `EntitlementsService` lisait les constantes ; quotas journaliers de Super Likes |
| Paiement | mock + KKiaPay (widget, vérification serveur, webhook) pour des abonnements d'un mois |
| Achats ponctuels | inexistants (un champ `boostCredits` sur `Entitlement`) |
| Admin | console dédiée (modération, utilisateurs, abonnements, paiements, flags, audit) ; rôles USER/MODERATOR/ADMIN/SUPER_ADMIN |
| Contraintes | PostgreSQL + Prisma 7, NestJS 12 ESM, aucune dépendance Redis ; paiement Mobile Money = **pas de prélèvement récurrent** |

## 2. Architecture retenue

- **Configuration d'abord** : `SubscriptionPlan.features` (JSON validé par `planFeaturesSchema`) porte les 8 clés `daily_likes_limit`, `super_likes_weekly`, `can_see_likes`, `advanced_filters`, `boosts_monthly`, `incognito_mode`, `rewind_enabled`, `ads_enabled`. **Aucune logique ne lit une formule en dur** : `EntitlementsService` dérive les droits de cette configuration (cache 15 s, invalidé à chaque modification admin).
- **Prix par durée** (`PlanPrice` : 1/3/6/12 mois) : total = `tarif mensuel × mois × (1 − remise)` calculé **côté serveur** à partir du tarif réellement configuré, avec prix forcé optionnel. Défauts : 0 / 10 / 20 / 30 %.
- **Valeurs initiales** créées uniquement si absentes (`PlanConfigService.ensureDefaults`) : une modification d'administrateur n'est jamais écrasée au redémarrage.
- **Achats ponctuels** : `Product` (boosts 30 min / 2 h / 24 h à 300 / 700 / 1 500 FCFA ; packs 5 / 15 / 30 Super Likes à 500 / 1 200 / 2 000 FCFA), prix modifiables.
- **Crédits** : `CreditWallet` (solde) + `CreditTransaction` (journal). Contrainte unique `(userId, reason, refId)` : le journal est écrit **en premier** (`ON CONFLICT DO NOTHING`) → un paiement, un swipe ou un boost ne s'applique jamais deux fois. Consommation dans la **même transaction** que l'action : si elle échoue, rien n'est débité.
- **Paiement unifié** : `POST /api/checkout` (`subscription` + durée, ou `product`). Le client n'envoie jamais de montant. `applySuccess` (webhook signé ou vérification serveur KKiaPay) active l'abonnement, accorde les crédits, crée la facture, de façon atomique et idempotente.
- **Contrats existants préservés** : le montant est figé sur `Payment`, la période sur `Subscription` ; changer un prix ne touche que les achats futurs (testé).

### Schéma ajouté (migration `monetization`)
`PlanPrice`, `Product`, `CreditWallet`, `CreditTransaction`, `Boost`, `SystemSetting` ; colonnes `SubscriptionPlan.featured/sortOrder`, `Subscription.months`, `Payment.kind/months/productId/quantity` ; enums `CreditType`, `CreditReason`, `PaymentKind`, `ProductKind`. Écart assumé avec la liste du cahier : `PlanFeature` est un JSON validé (pas une table), `SuperLikePack` est généralisé en `Product` (boosts + packs).

## 3. Avancement par rapport aux critères d'acceptation

| # | Critère | État |
|---|---|---|
| 1 | Gratuit utilisable avec quotas | ✅ 20 likes/jour (configurable), messagerie gratuite après match |
| 2 | Consulter et acheter Premium/VIP | ✅ page `/pricing` + `/premium` (durées, prix total et mensuel équivalent, remises, conditions de renouvellement) |
| 3 | Droits activés après confirmation serveur | ✅ webhook signé / vérification KKiaPay |
| 4 | Paiement répété ≠ plusieurs abonnements | ✅ testé (rejeu, transaction à usage unique) |
| 5 | Acheter un boost ou un pack de Super Likes | ✅ `/shop`, testé (achat → crédits → utilisation) |
| 6 | Admin modifie offres et prix | ✅ `/admin/plans` (ADMIN), audité, validé par schéma |
| 7 | Modifications sans casser l'existant | ✅ testé |
| 8 | Modérateur traite un signalement | ✅ (existant : file, sanctions) — workflow de dossiers avancé ⛔ |
| 9 | Contestation d'une sanction | ✅ (existant) |
| 10 | Actions sensibles auditées | ✅ pour modération, plans, produits, flags ; 🟡 pas encore pour tout (ex. accès de lecture) |
| 11 | Rôles empêchent les accès non autorisés | 🟡 USER/MODERATOR/ADMIN/SUPER_ADMIN testés ; rôles **Support / Finance / Analyste**, **MFA** et double validation ⛔ |
| 12 | Statistiques financières sur données réelles | 🟡 revenus cumulés/30 j, conversion, rétention, répartition des formules ; **MRR/ARR, remboursements, résiliation** ⛔ |
| 13-14 | Tests critiques, build, typecheck | ✅ voir TESTING.md |
| 15 | Mobile et desktop | ✅ (E2E desktop ; vérification visuelle mobile) |

## 4. Règles métier implémentées

- **Super Likes** : quota **hebdomadaire** inclus (Premium 5, VIP 15, configurable) ; au-delà, crédits achetés ; sinon `NO_SUPER_LIKES` (proposition d'achat ou de Premium).
- **Boosts** : crédits (achetés, ou accordés par la formule — VIP : 2/mois × nombre de mois payés) ; activation = 1 crédit ; un boost actif est **prolongé** ; le boost modifie l'**ordre** des recommandations, pas le % de compatibilité affiché.
- **Likes illimités** : plafonnés à 1 000/jour (anti-abus).
- **Renouvellement** : manuel (paiement ponctuel), clairement annoncé ; rappel avant échéance. Jamais de prélèvement supposé pour Mobile Money.

## 5. Reste à faire (non commencé — phases suivantes du plan)

| Phase | Éléments |
|---|---|
| 3 Paiements | Stripe et autres adaptateurs ; remboursements **partiels** ; litiges ; historique des webhooks consultable ; rapprochement/détection de doublons ; export CSV |
| 4 Administration | rôles **Support / Finance / Analyste** avec permissions fines (`AdminRole`/`AdminPermission`) ; **MFA obligatoire** ; sessions admin courtes ; double validation ; filtres de période/pays sur le tableau de bord ; recherche globale ; actions groupées ; KPI MRR/ARR/DAU/MAU/taux de match/résiliation ; création de **nouvelles** offres (le code d'offre est un enum : passage en chaîne à prévoir) |
| 5 Modération | dossiers (`ModerationCase`, preuves, priorités, assignation/transfert), procédures d'urgence, restrictions de fonctionnalités, accès encadré et tracé aux messages signalés, **support client (tickets)** |
| 6 Croissance | **codes promotionnels** (modèle, règles, anti-abus, stats), **parrainage**, **campagnes de notifications** (segmentation, programmation, désinscription), offres de réactivation, analytics avancés, publicité (phase ultérieure) |
| Transverse | essais gratuits, avantages temporaires accordés par l'admin, multidevise effective (l'architecture porte `currency` mais seul XOF est actif), OpenAPI détaillé des nouveaux endpoints |

## 6. Dépendances et intégrations nécessaires
KKiaPay (clés bac à sable puis production, à valider — voir DEPLOYMENT.md) ; fournisseur e-mail (SMTP) pour reçus et campagnes ; Redis/BullMQ pour campagnes programmées et rappels d'échéance à l'échelle ; bibliothèque TOTP pour la MFA ; stockage S3 pour justificatifs de modération.

## 7. Remboursements (livrés)

- **Modèle `Refund`** (migration `refunds`) : remboursement **intégral** d'un paiement réussi ; statuts `REQUESTED → PROCESSING → COMPLETED | FAILED`, ou `REJECTED`.
- **Demande du membre** (`POST /api/payments/:id/refund-request`, délai de 7 jours réglable via `SystemSetting refund_window_days`) : un administrateur approuve.
- **Demande d'un administrateur** (`POST /api/admin/refunds`) : **double validation** — l'approbateur doit être une autre personne (`SELF_APPROVAL`, testé).
- **Exécution** : le fournisseur est appelé d'abord (KKiaPay : `POST /api/v1/transactions/revert`, clé privée) ; en cas de refus la demande passe en `FAILED` et **rien ne change** (paiement et droits intacts). Option « remboursé manuellement » si l'opération a été faite dans le tableau de bord du fournisseur.
- **Effets atomiques** : paiement `REFUNDED`, abonnement résilié et droits recalculés, crédits **restants** repris (ce qui a déjà été consommé ne se reprend pas ; un boost déjà activé reste actif).
- **Garanties** : une approbation rejouée ou simultanée ne rembourse qu'une fois (prise en charge atomique + journal de crédits unique) ; une seule demande active par paiement (verrou) ; tout est audité (`refund.request/approve/reject`) ; le membre est notifié.
- **Interface** : `/admin/refunds` (file, approbation, rejet, note), bouton « Rembourser » dans `/admin/payments`, demande depuis Paramètres → Paiements.
- **Limites connues** : pas de remboursement partiel ; pas d'avoir/note de crédit générée (la facture d'origine est conservée) ; un remboursement resté `PROCESSING` après un arrêt brutal du serveur demande une reprise manuelle ; le rôle « Finance » dédié n'existe pas encore (ADMIN).

## 8. Match en direct et jetons (livré)

**Principe.** Le membre valide ses critères ; la plateforme invite les personnes **en ligne** qui y répondent *et* qui acceptent son genre et son âge (réciprocité). Celles qui acceptent s'affichent ; il en choisit une ou deux. Chaque conversation ouverte coûte **1 jeton** (réglable : `LIVE` dans `packages/types`). La conversation reste ensuite (c'est un match ordinaire).

| Règle | Valeur par défaut | Où |
|---|---|---|
| Accès | Premium/VIP : illimité ; Gratuit : **2 essais** (`live_match_trials`) | fonctionnalités de formule (`live_match_enabled`, `live_match_trials`), modifiables dans `/admin/plans` |
| Délai entre deux lancements | 15 min | `LIVE.COOLDOWN_MINUTES` (verrou en base, pas seulement côté interface) |
| Durée d'une recherche | 24 h : une personne qui se connecte plus tard reçoit l'invitation | `LIVE.SEARCH_HOURS`, `LiveService.onPresence` |
| Conversations par recherche | 2 au plus | `LIVE.MAX_CHOICES` (verrou par recherche : deux choix simultanés ne dépassent jamais la limite) |
| Jetons offerts | **3, une seule fois**, à 100 % de profil **et** e-mail vérifié | `giftTokensIfEligible` ; unicité par le journal `(userId, GRANT_PROFILE, 'profile100')` |
| Jetons inclus dans la formule | Premium **5**/mois, VIP **15**/mois, Gratuit 0 ; crédités **à l'activation × nombre de mois achetés** (3 mois Premium = 15), une seule fois par paiement | clé `match_tokens_monthly` (`/admin/plans`) ; journal `(userId, GRANT_PLAN, '<paiement>:tokens')` ; repris au remboursement (hors jetons déjà dépensés) |
| Achat de jetons | 5 → 1 000 FCFA, 15 → 2 500, 30 → 4 500 | produits `TOKENS_5/15/30` (éditables dans l'admin, montant toujours calculé côté serveur) |
| Anti-harcèlement | 3 invitations en attente au plus par personne ; invitation expirée après 30 min ; refus sans pénalité ; désactivation possible (`liveOptIn`) | `LIVE.MAX_PENDING_PER_INVITEE`, `LIVE.INVITE_MINUTES` |

**Garanties.** Le jeton est consommé **dans la même transaction** que l'ouverture de la conversation : jeton insuffisant, personne bloquée ou plus disponible ⇒ rien n'est débité ; un double clic ne débite qu'une fois ; une personne déjà en relation n'est pas facturée ; une relation rompue n'est jamais rouverte par ce biais. Les critères sont stricts : une information non renseignée sur le profil n'est jamais supposée.

**Non fait / limites.** Présence en mémoire (un processus) ; les jetons inclus sont crédités d'un bloc à l'activation (pas de distribution mois par mois, ni d'expiration) et ne rétroagissent pas sur les abonnements déjà actifs ; pas de remboursement de jetons consommés ; l'origine est un pays (liste restreinte), pas une ethnie — donnée facultative, jamais exigée.

## 9. Codes promo et parrainage (livré)

### Codes promo (administrables dans `/admin/promos`)
| Règle | Comportement |
|---|---|
| Types | **PERCENT** : remise de 1 à 90 % sur un abonnement ou un achat (jetons, boosts…) ; **TOKENS** : jetons Match offerts |
| Calcul | Toujours côté serveur (`PromoService`) : le client n'envoie ni montant ni remise. Le paiement stocke le montant remisé (`Payment.amountXof`), la remise (`discountXof`) et le code ; remboursement = montant réellement payé |
| Limites | Une utilisation par membre ; plafond global optionnel ; dates de début/fin ; désactivation à tout moment |
| Concurrence | Verrou consultatif par code : deux paiements simultanés ne dépassent jamais le plafond. Un paiement en attente réserve le code 1 h ; un échec le libère |
| Erreurs | Code inconnu, désactivé ou hors période → même réponse `PROMO_INVALID` (pas d'énumération) ; `lookup` limité à 10 essais/min |
| Immutabilité | Le type et la valeur d'un code ne changent jamais (on le désactive et on en crée un autre) ; création/modification auditées |

### Parrainage (`/referral`)
- Chaque membre a un code à 8 caractères sans ambiguïté (créé à la première visite) et un lien `/register?ref=CODE` qui pré-remplit le champ d'inscription.
- Récompense **unique** quand le filleul a un profil à 100 % **et** un e-mail vérifié (même condition que le cadeau de profil) : parrain **+5 jetons**, filleul **+2 jetons**. Plafond : **20 filleuls récompensés** par parrain (au-delà, le filleul reçoit son bonus mais pas le parrain). Parrain suspendu : pas de jetons.
- Un code de parrainage inconnu est ignoré silencieusement à l'inscription ; un compte ne peut avoir qu'un seul parrain.
- Réglages : constante `REFERRAL` (`packages/types`).

### Non fait / limites
- Le parrainage n'est pas pris en compte pour l'inscription **via Google** (code non transmis).
- Pas de détection d'abus par adresse IP ou appareil (seuls les garde-fous ci-dessus : e-mail vérifié, profil complet, plafond).
- Les valeurs de récompense (5/2/20) ne sont pas encore modifiables depuis l'administration.
- Pas de remise sur les abonnements déjà payés ni de cumul de plusieurs codes sur un même paiement.

## 10. Photos dans les messages
- **Règle** : l'envoi d'une photo dans une conversation est réservé aux formules qui l'incluent (**Premium et VIP** par défaut, pas le Gratuit). Écrire et **recevoir** des photos reste gratuit.
- **Réglage** : fonctionnalité de formule `chat_images_enabled`, modifiable dans `/admin/plans` (comme les autres). Les formules déjà enregistrées reçoivent la valeur par défaut au démarrage, sans écraser les réglages de l'administrateur.
- **Application** : côté serveur uniquement (`POST /conversations/:id/images` → 403 `PLAN_REQUIRED`) ; le flag `chat_images` (coupure d'urgence, 503) s'applique avant. Côté interface, le bouton affiche un cadenas et ouvre l'invitation à s'abonner.

## Gestion des accusés de lecture (« vu »)
Fonctionnalité de formule `read_receipts_control` : **Premium et VIP** peuvent désactiver l'envoi de leurs accusés ; le gratuit les envoie toujours (le réglage est affiché verrouillé avec un lien vers Premium). Réglable par plan dans Admin › Offres et tarifs. Appliquée par le serveur : après une résiliation, les accusés redeviennent actifs sans perdre le réglage de la personne. Aucun prix n'a été modifié.

## Découvertes du jour par formule
Fonctionnalité de formule `daily_picks_count` (1 à 30) : **Gratuit 5, Premium 10, VIP 10** par défaut, réglable par plan dans Admin › Offres et tarifs et affichée sur la page Tarifs (« N découvertes du jour »). Elle remplace les anciens réglages `daily.count_free` et `daily.count_premium`, retirés pour ne pas dupliquer la source de vérité ; l'historique et le délai avant reproposition restent des réglages d'engagement. Les bases existantes reçoivent la clé au démarrage sans écraser une modification d'administrateur. La sélection reste la même pour tous les niveaux (jamais de classement payant).

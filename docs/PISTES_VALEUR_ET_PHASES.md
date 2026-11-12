# Rendre Crushduo « indispensable » : analyse et phases de mise en place

Analyse faite le 2026-11-12 à partir de [STATUS.md](STATUS.md) (ce qui existe vraiment) et de la logique d'un produit payant pour l'Afrique francophone (Bénin, Côte d'Ivoire, Togo, Sénégal, Niger, Burkina Faso). Ce sont des **recommandations de produit, pas des faits mesurés** : aucune donnée d'usage réel n'existe encore, donc chaque piste dit comment la vérifier.

## 1. Ce que l'application a déjà (et qui est solide)

- **Rencontre** : swipe, Super Likes, likes reçus, visiteurs du profil, matching explicable, duos du jour, question du jour, rendez-vous, appels, Speed dating, Match en direct (jetons), Soirées Duo.
- **Confiance** : vérification par selfie (revue humaine), signalement/blocage, modération, mode pause et période de repos.
- **Argent** : Premium/VIP, boosts, Super Likes, jetons, codes promo (dont l'offre fondateur), parrainage, essai gratuit, réduction « profil vérifié », accès payant optionnel.
- **Exploitation** : console d'administration complète, pays de lancement, sauvegardes R2, blog, e-mails.

Le produit est **large**. Le risque n'est plus « il manque des fonctions » : c'est que le premier membre payant **ne rencontre personne** ou **ne fasse pas confiance**.

## 2. Pourquoi les gens paient (et regrettent) dans ce marché

| Cause de regret | Ce que le membre pense | Ce qui y répond |
|---|---|---|
| **Désert** | « Il n'y a personne dans ma ville » | Lancement ville par ville, compteurs réels, soirées à heure fixe |
| **Méfiance** | « C'est un faux profil / un arnaqueur » | Vérification visible, détection d'arnaque, signalement rapide |
| **Rien ne se passe** | « J'ai payé, aucun duo » | Garantie de résultat, visibilité garantie, rapport hebdomadaire |
| **Friction de paiement** | « Mon paiement a échoué » | Mobile money fiable, formules courtes, reçus clairs |
| **Oubli** | « Je n'ouvre plus l'app » | Notifications push, WhatsApp/e-mail, rendez-vous à heure fixe |

## 3. Pistes, classées par effet sur la rétention payante

### A. Confiance et sécurité (priorité n°1)
1. **Badge « Vérifié » plus fort** : vérification par courte vidéo (clignement/phrase), badge bien visible sur les cartes, filtre « vérifiés seulement » gratuit pour tous (la confiance ne doit pas être un luxe).
2. **Détection d'arnaque dans la messagerie** : avertissement automatique (demande d'argent, de recharge, lien externe, passage immédiat à WhatsApp) + bouton « signaler » en un geste. Règles simples d'abord, pas d'IA coûteuse.
3. **Délai de traitement affiché** pour les signalements (ex. « traité sous 24 h ») et suivi côté admin.
4. **Sécurité du compte** : double authentification, alerte de connexion inhabituelle (déjà listé « non implémenté »).
5. **Ancienneté visible** : « membre depuis », « actif récemment » (pas l'heure exacte).

### B. Éviter le désert (liquidité)
1. **Ouverture par vagues** : n'activer qu'une ville à la fois quand le seuil (par ex. 150 membres actifs dont assez de femmes) est atteint ; liste d'attente sinon. Le seuil de femmes et les pays de lancement existent déjà.
2. **Soirées Duo à jour et heure fixes** (ex. jeudi 20 h) : tout le monde est en ligne en même temps ; la bannière et les rappels existent.
3. **Parrainage récompensé par des jours offerts** plutôt que seulement des jetons.
4. **Compteurs honnêtes** sur la page d'arrivée (déjà amorcé : membres dans la ville / actifs cette semaine). Ne jamais gonfler les chiffres.

### C. Valeur Premium perceptible dès les 24 premières heures
1. **« Garantie Duo »** : si un abonné n'obtient aucun duo en 30 jours alors qu'il a complété son profil et liké régulièrement, ajouter automatiquement des jours. Le remboursement n'existe plus : cette garantie le remplace sans sortir d'argent.
2. **Rapport hebdomadaire** par e-mail/notification : « 14 personnes ont vu votre profil, 3 vous ont liké » (le compteur de visiteurs existe).
3. **Message avec le Super Like** et **priorité dans la découverte** pendant les soirées.
4. **Coach de premier message** : suggestions personnalisées (les idées de brise-glace existent ; les adapter au profil de l'autre).
5. **Remise à plat des formules** : que chaque ligne de Premium soit une raison d'achat claire (aujourd'hui la liste est longue ; le bouton « Afficher tous les avantages » aide, mais il faut 3 avantages phares).

### D. Revenir sans effort
1. **Notifications push (PWA)** : service worker + VAPID. C'est l'écart le plus coûteux aujourd'hui (l'interface écrit « Bientôt »).
2. **WhatsApp** pour les rappels importants (soirée, nouveau duo) : très utilisé dans la région ; coût par message à chiffrer avant de s'engager.
3. **Résumé e-mail hebdomadaire** sobre, avec désinscription facile.
4. **Série d'actions saines** (jours d'activité), jamais punitive.

### E. Paiement adapté au marché
1. **Valider KKiaPay en vrai** (bac à sable puis production) : c'est le **risque n°1 avant ouverture** — le code n'a jamais tourné contre le vrai service.
2. **Formules courtes** (7 jours, 1 mois) à petit prix : beaucoup de membres paient au mobile money, pas par abonnement ; un essai court réduit le regret. Les durées 1/3/6/12 mois existent.
3. **Offre fondateur à délai réel** (en cours : 24 h après l'inscription, fixé par le serveur) + places restantes. Jamais de compte à rebours qui se réinitialise.
4. **Rappel avant la fin** de l'abonnement (existe) et **reçu/facture** (existent).

### F. Du virtuel au réel (ce qui fait payer et recommander)
1. **Partenariats lieux** (cafés, restaurants, hôtels de Cotonou/Abidjan/Lomé/Dakar) : avantage « Duo » sur présentation du profil, premier rendez-vous mis en avant.
2. **Rendez-vous sécurisés** : lieu public suggéré, partage d'itinéraire avec un proche (le mode rendez-vous existe).
3. **Soirées physiques** occasionnelles par ville, réservées aux vérifiés.

### G. Qualité technique propre à ce public
1. **Léger et rapide** sur Android d'entrée de gamme et en 3G : images compressées, mode économie de données, chargement progressif.
2. **Surveillance** (erreurs, lenteurs, alertes) avant d'inviter du monde.
3. **Montée en charge** : Redis pour la présence temps réel (le Match en direct est limité à un seul processus), files de tâches.
4. **Test de restauration** d'une sauvegarde (les sauvegardes existent, la restauration n'a pas été rejouée devant témoin).
5. **Textes légaux validés** par un juriste local.

### H. Mesurer pour ne pas deviner
Entonnoir à suivre dès le premier jour : inscription → profil complet → premier like → premier duo → premier message → paiement → réabonnement. Un tableau de bord admin existe pour les statistiques ; il faut y ajouter **ces étapes** et le **taux de duo par ville**.

## 4. Phases de mise en place

| Phase | Durée indicative | Contenu | Critère de sortie |
|---|---|---|---|
| **0. Avant d'inviter du monde** | 1 à 2 semaines | KKiaPay validé (sandbox puis un vrai paiement), textes légaux relus, surveillance d'erreurs, test de restauration, e-mails vérifiés, articles de blog publiés (images à ajouter) | Un paiement réel de bout en bout sans intervention |
| **1. Lancement fermé** | 4 semaines | 1000 fondateurs (code FONDATEUR + délai réel), une ville ou deux, soirée Duo hebdomadaire, parrainage, support réactif | ≥ 150 membres actifs par ville ouverte ; 1ᵉʳ duo en moins de 48 h pour la majorité |
| **2. Confiance** | 4 à 6 semaines | Vérification renforcée, détection d'arnaque, délai de traitement des signalements, double authentification, ancienneté visible | Signalements traités < 24 h ; part de profils vérifiés suivie |
| **3. Rétention** | 6 semaines | Notifications push, résumé hebdomadaire, formules courtes, rapport « qui m'a vu », rappels de soirée | Taux de retour à J7 et J30 mesuré, en hausse |
| **4. Valeur Premium** | 6 à 8 semaines | Garantie Duo, message avec Super Like, priorité en soirée, coach de premier message, 3 avantages phares | Taux de réabonnement et motifs d'arrêt mesurés |
| **5. Du virtuel au réel** | 2 à 3 mois | Lieux partenaires, rendez-vous sécurisés, soirées physiques de ville | Partenaires actifs ; nombre de rendez-vous déclarés |
| **6. Échelle** | en continu | Redis/files, modération assistée, mode économie de données, Apple Sign In, nouveaux pays par vagues, version anglaise du blog et des pages | Pas d'incident à pic de charge ; ouverture d'une ville sans intervention technique |

## 5. À décider ensemble

- Faut-il une **garantie** (jours offerts) ou rester sur « satisfait ou non, pas de remboursement » ? La garantie coûte du temps d'abonnement, pas de l'argent.
- **WhatsApp** : budget par message à valider avant la phase 3.
- **Prix des formules courtes** : à fixer après quelques semaines de données réelles, pas avant.

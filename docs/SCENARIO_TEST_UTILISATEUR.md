# Scénario de test — un utilisateur qui essaie tout DuoMatch

Parcours manuel de bout en bout, de l'inscription à la suppression du compte. Durée : 1 h 30 à 2 h.
Il complète les tests automatisés (`docs/QA_REPORT.md`) : il sert à **voir et ressentir** l'application, pas à remplacer Playwright.

## 0. Préparation

| Élément | Valeur |
|---|---|
| Environnement | Local (`pnpm dev`, web `:3000`, API `:4000`) ou site déployé |
| Navigateurs | 1 fenêtre normale (testeur A) + 1 fenêtre privée (testeur B, pour le match et le chat) |
| Appareils | Ordinateur + téléphone (ou mode mobile 375 px) |
| Comptes à créer | **A** « Aya » (le testeur principal), **B** « Koffi » (le partenaire de match) |
| Comptes existants | Modérateur et administrateur de démonstration : identifiants dans les fichiers locaux non versionnés, **ne pas les recopier ici** |
| E-mail | En local, le code de confirmation s'affiche dans les journaux de l'API (pas de SMTP). En ligne, il faut un SMTP configuré |
| Paiement | Mode simulé (page `checkout/mock`) tant que KKiaPay n'est pas branché |
| Appels | Désactivés (`CALL_PROVIDER=mock`) : le bouton d'appel ne doit **pas** apparaître |

Légende des résultats : ✅ conforme · ❌ défaut (noter l'écran, l'heure, ce qui s'est passé) · ⚠️ simulé.

---

## 1. Découverte du site public (visiteur anonyme)

1. Ouvrir `/fr`. Vérifier : page d'accueil, découvertes du jour, Match en direct, speed dating présentés.
2. Basculer FR ↔ EN (sélecteur de langue) : les textes changent, l'URL aussi.
3. Basculer thème clair ↔ sombre : lisibilité correcte, bouton Google lisible.
4. Parcourir : **Comment ça marche** (menu collant : la puce active suit le défilement), **Tarifs** (3 cartes, largeur max ≈ 400 px), **À propos**, **Blog** (ouvrir un article), **Aide** (utiliser la recherche), **Contact**.
5. Sur mobile : l'en-tête devient un menu, aucune barre horizontale parasite, les puces du sommaire défilent en carrousel.
6. Pages légales : conditions, confidentialité, cookies, charte. Noter qu'elles sont des brouillons.
7. Bannière cookies : refuser le non essentiel → elle ne réapparaît pas au rechargement.
8. Tenter d'ouvrir `/fr/discover` sans être connecté → redirection vers la connexion.

## 2. Contact (visiteur)

1. `/fr/contact` : envoyer le formulaire vide → messages d'erreur clairs par champ.
2. Remplir (nom, e-mail, sujet, message) → confirmation d'envoi.
3. Plus tard (étape 14), retrouver ce message dans l'administration.

## 3. Inscription

1. `/fr/register`. Essayer d'abord les **cas refusés** :
   - date de naissance de moins de 18 ans → refus ;
   - mot de passe faible (court, sans majuscule ou sans chiffre) → refus ;
   - conditions non acceptées → refus.
2. Créer **Aya** : pseudo, e-mail valide, mot de passe conforme (10+ caractères, majuscule, minuscule, chiffre), âge ≥ 18, genre, pays, ville.
3. Réessayer avec le même e-mail → refus sans révéler trop d'informations.
4. Arrivée sur la confirmation d'e-mail : saisir un mauvais code → refus ; saisir le bon code → compte confirmé.
5. Tester aussi **Renvoyer le code**.
6. (Si l'ID client Google est configuré) bouton « Continuer avec Google ⚠️ ».

## 4. Onboarding et profil

1. Parcourir les 4 étapes : à propos, centres d'intérêt, photos, critères de rencontre.
2. Photos : ajouter 3 images (JPEG/PNG), recadrer avant l'envoi ; essayer un fichier non image ou trop lourd → refus.
3. Écrire une biographie, choisir au moins 3 intérêts.
4. Terminer, recharger la page : **tout est conservé**.
5. Ouvrir **Profil** : modifier la bio, réordonner/supprimer une photo, voir le taux de complétion monter.
6. **Questions de personnalité** et **conseils de profil** : répondre, vérifier l'enregistrement.
7. **Vérification par selfie** (Profil → Vérification) : envoyer un selfie → statut « en attente ».
8. **Mode pause** : activer → le profil disparaît de la découverte ; désactiver.

## 5. Découverte et matchs (compte gratuit)

1. **Découvrir** : liker (❤ / glisser à droite), passer (✕ / ←), ouvrir ⓘ pour le profil complet. Vérifier le pourcentage de compatibilité.
2. ★ Super Like et ↺ retour arrière : doivent inviter à passer Premium.
3. Compter les likes : la limite gratuite est **20 par jour** ; au-delà, message clair.
4. **Découvertes du jour** : carrousel, jauge Duo, phrase d'intention, question du jour (répondre).
5. **Likes** : le nombre de personnes intéressées est visible, les profils sont **floutés** en gratuit.
6. Filtres avancés : verrouillés en gratuit.
7. **Match en direct** (Live Match) : choisir des critères, voir les jetons, envoyer/recevoir une invitation.
8. **Speed dating** (texte) : s'inscrire à une session, jouer un tour.

## 6. Match réciproque (A + B)

1. Dans la fenêtre privée, créer **Koffi** (étapes 3 et 4 rapides, 1 photo suffit).
2. Koffi like Aya, puis Aya like Koffi (ou l'inverse) → écran **« C'est un match »** chez les deux.
3. Une notification apparaît chez le premier qui a liké (page **Notifications**, pastille).
4. Ouvrir **Messages** : la conversation existe chez A et B.

## 7. Messagerie (A ↔ B en temps réel)

1. Aya écrit → le message apparaît chez Koffi **sans recharger**.
2. Utiliser : émojis, **réaction** sur un message, **réponse** à un message, brise-glace suggéré.
3. Envoyer une **photo** : refusé en gratuit avec invitation à s'abonner.
4. Accusé de lecture : visible seulement pour les abonnés ; désactivable dans Paramètres → Confidentialité.
5. Supprimer un de ses propres messages.
6. **Rendez-vous** : Aya propose un rendez-vous, Koffi accepte/refuse ; programmer un rappel ; partager avec un proche.
7. Bouton d'appel audio/vidéo : **absent** (appels désactivés). ⚠️ Le son/l'image réels n'ont jamais été testés.
8. Réseau coupé puis rétabli : la conversation se resynchronise.

## 8. Sécurité entre membres

1. Aya **signale** Koffi (choisir un motif, ajouter un texte libre) → confirmation. Le signalement sera traité à l'étape 14.
2. Aya **ferme** la conversation / **met fin au match** → disparaît des deux côtés.
3. Refaire un match puis Aya **bloque** Koffi → conversation disparue, profil introuvable.
4. Paramètres → **Comptes bloqués** : débloquer Koffi.

## 9. Abonnements et paiements (simulé ⚠️)

1. **Tarifs** / **Premium** : comparer Gratuit, Premium (2 500 FCFA/mois) et VIP (5 000 FCFA/mois).
2. Saisir un **code promo** invalide → message ; un code valide → prix réduit.
3. Souscrire Premium → page `checkout/mock` → confirmer le paiement simulé.
4. Vérifier que les avantages ne s'activent **qu'après** confirmation : likes illimités (page Tarifs), 5 Super Likes par semaine, likes reçus nets, filtres avancés, retour arrière, photos dans le chat, accusés de lecture.
5. Paramètres → **Paiements** : la facture apparaît.
6. **Boutique** : acheter un boost/jeton simulé.
7. **Parrainage** : copier son lien, l'ouvrir en navigation privée, créer un compte filleul, vérifier le crédit.
8. Annuler l'abonnement (Paramètres → Abonnement) : les avantages durent jusqu'à la fin de la période.
9. (Facultatif) passer VIP : mode discret, boosts.

## 10. Paramètres, confidentialité et compte

1. **Confidentialité** : masquer le profil, position arrondie, accusés de lecture.
2. **Sécurité** : changer le mot de passe (ancien refusé si faux), déconnecter un autre appareil.
3. **Notifications** : réglages par catégorie.
4. **Langue** et thème conservés après rechargement.
5. Déconnexion, puis **mot de passe oublié** (code/lien reçu), puis **lien magique**.
6. Connexion avec « Restez connecté » : fermer et rouvrir le navigateur → toujours connecté.
7. **Exporter mes données** : le fichier JSON se télécharge et contient profil et messages.

## 11. Accessibilité et mobile

1. Navigation entièrement au clavier (Tab, Entrée, Échap) sur : connexion, découverte, messages.
2. Focus visible, textes lisibles en thème sombre.
3. Zoom à 200 % : aucune perte de contenu.
4. Mobile 375 px : aucune barre de défilement horizontale, boutons faciles à toucher.

## 12. Droits et accès interdits

1. Connecté en gratuit, ouvrir `/fr/admin` → refus / redirection.
2. Appeler une page réservée (ex. `/fr/premium` après annulation) : comportement cohérent.
3. Ouvrir la conversation d'un autre couple par son identifiant → refus.

## 13. Suppression du compte (à faire en dernier pour Koffi)

1. Paramètres → Confidentialité → **Supprimer mon compte**, confirmer avec le mot de passe.
2. Vérifier : déconnexion immédiate, impossible de se reconnecter, profil introuvable pour Aya.

---

## 14. Côté équipe (modérateur puis administrateur)

Utiliser les comptes de démonstration (voir §0). Un même compte ne cumule pas les droits : tester chaque rôle.

**Modérateur**
1. **Modération** : file des selfies → approuver celui d'Aya → badge « vérifié » visible sur son profil.
2. **Signalements** : traiter le signalement de l'étape 8 (avertir, suspendre, rejeter). ⚠️ Le modérateur **ne voit pas** le contenu de la conversation signalée (décision de confidentialité en attente).
3. Vérifier que les pages d'administration réservées aux administrateurs lui sont refusées.

**Administrateur**
1. **Tableau de bord** : chiffres cohérents avec ce qui vient d'être fait (nouveaux comptes, matchs, paiement).
2. **Utilisateurs** : retrouver Aya, la suspendre puis la réactiver.
3. **Offres**, **Codes promo**, **Paiements**, **Abonnements**, **Remboursements** : modifier un tarif, créer un code, rembourser le paiement simulé.
4. **Drapeaux** : couper une fonctionnalité (ex. speed dating) → côté membre, message « temporairement indisponible » ; la rétablir.
5. **Engagement**, **Speed dating**, **Question du jour** : créer/modifier une session ou une question.
6. **Blog** : créer un article avec image, le publier, le voir sur `/fr/blog`.
7. **Messages de contact** : retrouver le message de l'étape 2, le marquer lu, répondre (ouvre le client mail), archiver.
8. **Journal d'audit** : chaque action ci-dessus y est tracée (qui, quoi, quand).

---

## 15. Critères de réussite

- Aucune erreur affichée en rouge sans raison, aucune page blanche, aucune fuite de message technique.
- Les limites gratuites (20 likes/jour, photos du chat, likes floutés) et les avantages Premium/VIP sont respectés.
- Aucun avantage payant sans paiement confirmé.
- Les données personnelles d'un membre ne sont jamais visibles d'un autre (e-mail, date de naissance exacte, position précise).
- Les actions d'administration sont journalisées.

## 16. Ce que ce scénario ne couvre pas

- Envoi d'e-mails réels (SMTP), vrai paiement KKiaPay, vrais appels LiveKit.
- Charge élevée et plusieurs instances (Redis non implémenté).
- Relecture juridique des textes.

## Fiche de résultats

| Section | Résultat | Remarques / captures |
|---|---|---|
| 1 Site public | | |
| 2 Contact | | |
| 3 Inscription | | |
| 4 Profil | | |
| 5 Découverte | | |
| 6 Match | | |
| 7 Messagerie | | |
| 8 Sécurité | | |
| 9 Abonnements | | |
| 10 Paramètres | | |
| 11 Accessibilité / mobile | | |
| 12 Droits | | |
| 13 Suppression | | |
| 14 Équipe | | |

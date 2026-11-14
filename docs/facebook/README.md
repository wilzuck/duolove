# Page Facebook Crushduo — kit de création

Tout ce qu'il faut pour créer la page professionnelle Facebook de Crushduo (crushduo.com), prêt à copier-coller.

**À copier : uniquement le texte à l'intérieur des cadres gris** (blocs `text`). Il est en texte brut, comme Facebook l'attend : Facebook n'interprète ni le gras ni les citations.

| Fichier | Contenu |
|---|---|
| [01-fiche-page.md](01-fiche-page.md) | nom, @, catégories, présentation courte, « À propos », coordonnées, bouton d'action, réglages de départ |
| [02-visuels.md](02-visuels.md) | photo de profil, couverture, visuels des publications : dimensions, zones sûres, cahier des charges, régénération |
| [03-premieres-publications.md](03-premieres-publications.md) | 10 premières publications (lancement, comment ça marche, profils vérifiés, sécurité, Soirées Crush, conseils, mode discret) |
| [03-first-posts-en.md](03-first-posts-en.md) | les mêmes 10 publications en anglais, avec le vocabulaire anglais du site (Duo, Crush Night, Crush tab, Incognito mode) |
| [04-messenger-faq.md](04-messenger-faq.md) | message de bienvenue, questions fréquentes, réponses par mots-clés, message d'absence, FAQ |
| [05-moderation.md](05-moderation.md) | règles affichées, filtres et mots bloqués, conduite à tenir par type de commentaire |
| [images/](images/) | `profil-crushduo-1080.png`, `couverture-crushduo-1640x624.jpg`, `post-01` à `post-08` (1080 × 1350) en français, et leur version anglaise dans `images/en/` ; les `_apercu-*` ne servent qu'au contrôle |
| [outils/generer_visuels.py](outils/generer_visuels.py) | script qui régénère toutes les images |

## Ordre de création

1. Créer la page avec le nom, les catégories et la présentation courte ([01](01-fiche-page.md)).
2. Ajouter la photo de profil, puis la couverture ; vérifier l'aperçu sur téléphone et ordinateur.
3. Remplir « À propos », les coordonnées, le bouton « S'inscrire » ; régler la restriction d'âge 18+ et un deuxième administrateur.
4. Configurer les filtres de commentaires ([05](05-moderation.md)) et les réponses Messenger ([04](04-messenger-faq.md)).
5. Publier et **épingler** la publication 1, puis suivre le calendrier de [03](03-premieres-publications.md).
6. Renseigner l'adresse de la page dans **Admin › Réseaux sociaux** de Crushduo.

## Fidélité au produit

Les textes ne décrivent que des fonctionnalités marquées terminées dans [`docs/STATUS.md`](../STATUS.md) : vérification par selfie avec revue humaine, signalement confidentiel, blocage, position arrondie, mode discret (VIP et Gold), double authentification, Soirées Crush dans l'onglet Crush avec rappel, Crush en direct, blog, français et anglais, installation depuis le site. Ils **n'annoncent pas** les appels audio/vidéo (simulés), une détection automatique des faux profils (inexistante) ni de témoignages. **Aucun montant** n'est écrit.

Points qui dépendent de réglages de l'administration et sont à relire avant publication :
- « Inscription gratuite » : vraie tant que l'accès payant obligatoire est désactivé (réglage par défaut).
- Liste des pays : réglage par défaut d'Admin › Pays de lancement.
- Publicités : autorisation écrite préalable de Meta obligatoire pour les services de rencontre.

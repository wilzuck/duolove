# 2. Photo de profil, couverture et visuels

Tous les fichiers sont dans [`images/`](images/). Ils sont **générés** par [`outils/generer_visuels.py`](outils/generer_visuels.py) à partir des ressources du dépôt : la marque `apps/web/public/brand/crushduo-mark-light.webp`, la photo du couple de `apps/web/public/og.jpg` (déjà publiée par le site), les couleurs de `packages/ui/src/tokens.css` et la police du site, DM Sans. Les fichiers dont le nom commence par `_apercu` servent seulement au contrôle : **ne pas les publier**.

## Photo de profil

| Fichier | `images/profil-crushduo-1080.png` |
|---|---|
| Format | 1080 × 1080 px, PNG, carré (Facebook l'affiche en rond, autour de 170 à 200 px) |
| Contenu | les deux cœurs de la marque, sans texte, sur fond rose très pâle `#FFF0F5` avec halos rose clair |
| Contrôle | `images/_apercu-profil-rond.png` : la marque tient entièrement dans le cercle |

Pourquoi sans texte : à 170 px, le mot « Crushduo » serait illisible, et le nom de la page est écrit juste à côté. La charte interdit aussi la marque sur aplat rose vif (perte de lecture).

## Photo de couverture

| Fichier | `images/couverture-crushduo-1640x624.jpg` |
|---|---|
| Format | 1640 × 624 px, JPEG qualité 92 (le double de l'affichage ordinateur 820 × 312) |
| Contenu | dégradé rose d'action `#D81B60` → `#E91E63`, logo négatif (marque sur pastille blanche, mot « Crushduo » en blanc), « Rencontres sérieuses en Afrique francophone », « Profils vérifiés par selfie · Modération humaine · Soirées Crush », pastille « Inscription gratuite sur crushduo.com », photo du couple dans le cœur à droite |
| Zone sûre | tout le texte est entre x = 300 et x = 890 : visible sur téléphone (recadrage central) et à l'écart de la photo de profil qui recouvre le bas-gauche sur ordinateur |
| Contrôle | `images/_apercu-couverture-ordinateur.png` (cercle jaune = emplacement approximatif de la photo de profil) et `images/_apercu-couverture-mobile.png` |

Après l'envoi, vérifiez l'aperçu sur téléphone **et** sur ordinateur : Facebook modifie régulièrement ses recadrages. Si la pastille « Inscription gratuite » ne doit plus être vraie (accès payant activé), régénérez la couverture après avoir remplacé le texte dans `cover()`.

## Visuels des publications (1080 × 1350, format portrait 4:5 du fil)

| Fichier | Publication | Contenu |
|---|---|---|
| `post-01-lancement.jpg` | Lancement | « Deux cœurs, une belle histoire. », trois atouts, couple, crushduo.com, 18+ |
| `post-02-comment-ca-marche.jpg` | Comment ça marche | 3 étapes : profil, profils compatibles, « C'est un Duo ! » |
| `post-03-profils-verifies.jpg` | Profils vérifiés | ce que prouve le badge (selfie comparé par un modérateur, jamais automatique, selfie supprimé, filtre) |
| `post-04-securite.jpg` | Sécurité | « Ne versez jamais d'argent… » + 4 réflexes |
| `post-05-soirees-crush.jpg` | Soirées Crush | thème sombre, 3 étapes dans l'onglet Crush |
| `post-06-premier-message.jpg` | Conseil | mauvais / bon premier message |
| `post-07-premier-rendez-vous.jpg` | Conseil | 5 réflexes de premier rendez-vous |
| `post-08-mode-discret.jpg` | Vie privée | ce que fait le mode discret, et ce qui est gratuit pour tous |

**Version anglaise** : les huit mêmes visuels, textes traduits, dans `images/en/` (`post-01-launch.jpg`, `post-02-how-it-works.jpg`, `post-03-verified.jpg`, `post-04-safety.jpg`, `post-05-crush-nights.jpg`, `post-06-first-message.jpg`, `post-07-first-date.jpg`, `post-08-incognito.jpg`). Les traductions sont dans le dictionnaire `EN` du script ; il s'arrête en erreur si un texte français n'a pas de traduction.

Contrastes : texte blanc sur `#D81B60` / `#C2185B` (4,95 et 5,87:1), texte `#22212B` sur fond rose pâle (≥ 15:1), texte secondaire `#6B6A76` (≥ 4,8:1) : conformes au chapitre 3 de la charte.

## Régénérer les images

```bash
python3 -m venv /tmp/fbvenv && /tmp/fbvenv/bin/pip install pillow fonttools brotli
```

Convertir la police du site (ou télécharger « DM Sans » sur Google Fonts) :

```bash
/tmp/fbvenv/bin/python -c "from fontTools.ttLib import TTFont; f=TTFont('apps/web/.next/static/media/13971731025ec697-s.p.woff2'); f.flavor=None; f.save('/tmp/DMSans.ttf')"
```

Le nom du fichier `.woff2` change à chaque build : prendre celui dont la famille est « DM Sans » et qui contient les accents. Puis :

```bash
/tmp/fbvenv/bin/python docs/facebook/outils/generer_visuels.py --font /tmp/DMSans.ttf
```

`--lang fr` ne refait que les images françaises (profil, couverture, publications), `--lang en` que les publications anglaises ; par défaut, tout.

## Cahier des charges pour les visuels suivants

Pour un graphiste ou un outil de création (Canva, Figma) :

- **Formats** : 1080 × 1350 (fil), 1080 × 1920 (Stories, garder 250 px libres en haut et en bas), 1200 × 628 (lien partagé).
- **Couleurs** : rose d'action `#D81B60`, rose foncé `#C2185B`, rose de marque `#E91E63` (décor seulement, jamais sous du petit texte blanc), rose clair `#FF6B81`, rose pâle `#FFF0F5`, texte `#22212B`, texte secondaire `#6B6A76`, nuit `#14121A` / `#1D1A25` avec rose d'encre `#FF8FAE` pour les Soirées Crush.
- **Police** : DM Sans, 800 pour les titres, 500–700 pour le texte.
- **Logo** : ne pas redessiner ni déformer ; sur rose plein, utiliser la version négative (marque sur pastille blanche + mot blanc).
- **Photos** : adultes manifestement majeurs, tenues de ville, scènes chaleureuses et sobres ; jamais de contenu suggestif. Une photo de banque d'images ou générée **ne doit jamais être présentée comme un vrai membre ou un vrai couple formé sur Crushduo**, et pas de faux témoignage (le site n'en affiche volontairement aucun).
- **Mentions obligatoires** : crushduo.com et « 18 ans et plus » sur chaque visuel promotionnel.
- **Interdits** : aucun montant d'abonnement ; aucune promesse de résultat (« trouvez l'amour en 48 h ») ; pas de fonctionnalité non disponible (par exemple les appels vidéo, encore simulés).

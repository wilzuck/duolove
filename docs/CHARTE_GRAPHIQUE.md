# Charte graphique DuoMatch

Référence unique pour créer ou faire créer tout support aux couleurs de DuoMatch : site, application, administration, e-mails, réseaux sociaux, présentations, campagnes.

**Statut du document.** Il décrit ce qui est **réellement implémenté** dans le code (`packages/ui/src/tokens.css`, `apps/web/src/app/globals.css`, `packages/ui/src/*`), avec les rapports de contraste **calculés** (formule WCAG 2.1). Ce qui relève d'une recommandation et n'existe pas encore dans le produit est signalé **[Recommandation]** ; les écarts connus sont listés au chapitre 15. La charte n'a pas été relue par un designer de marque : c'est une base de travail, pas une identité validée.

**Public.** Designers, intégrateurs, community managers, rédacteurs, prestataires (impression, vidéo).

---

## Sommaire

1. [Identité de marque](#1-identité-de-marque)
2. [Logo](#2-logo)
3. [Couleurs](#3-couleurs)
4. [Typographie](#4-typographie)
5. [Formes, ombres, espacement, grille](#5-formes-ombres-espacement-grille)
6. [Iconographie](#6-iconographie)
7. [Photographie et illustration](#7-photographie-et-illustration)
8. [Composants d'interface](#8-composants-dinterface)
9. [Mouvement](#9-mouvement)
10. [Thèmes clair et sombre](#10-thèmes-clair-et-sombre)
11. [Accessibilité (obligations)](#11-accessibilité-obligations)
12. [Voix et ton](#12-voix-et-ton)
13. [Déclinaisons par support](#13-déclinaisons-par-support)
14. [Créer une charte dérivée (modèle de fiche)](#14-créer-une-charte-dérivée-modèle-de-fiche)
15. [Écarts connus et dette de design](#15-écarts-connus-et-dette-de-design)
16. [Annexes](#16-annexes)

---

## 1. Identité de marque

| Élément | Valeur |
|---|---|
| Nom | **DuoMatch** (un seul mot, deux majuscules : « Duo » + « Match ») |
| Signature | « Deux cœurs, une belle histoire. » (balise `<title>` et manifeste de l'application) |
| Secteur | Rencontres, **réservées aux majeurs (18 ans et plus)** |
| Cibles | Adultes francophones, avec un accent sur l'Afrique francophone ; interface en français et en anglais |
| Monnaie | Franc CFA (FCFA), affiché avec séparateur d'espace insécable (ex. 2 500 FCFA) |

**Positionnement.** Un service de rencontres sérieux, chaleureux et sûr, qui met la confiance (profils vérifiés, modération, consentement) avant la mécanique du « swipe ».

**Personnalité.** Chaleureuse · Rassurante · Directe · Respectueuse · Un peu joueuse (jamais vulgaire).

**Ce que la marque n'est pas.** Agressive, ambiguë sur l'âge, sexualisée, culpabilisante, ou promettant des résultats (« trouvez l'amour en 48 h »).

**Principes de design** (appliqués dans le produit) :
1. **Lisibilité d'abord** : chaque texte atteint au moins le contraste AA (chapitre 3).
2. **Le rose est une couleur d'action, pas un décor** : on réserve les aplats roses aux actions principales et aux éléments de marque.
3. **Doux mais net** : grandes surfaces arrondies, ombres légères teintées de rose.
4. **Pas de surprise** : un seul style de bouton principal par écran ; les actions dangereuses sont rouges et jamais seules en couleur.
5. **Même rendu en clair et en sombre** : tout jeton de couleur a une valeur sombre.

---

## 2. Logo

### 2.1 Composition

Le logo est composé de :
- une **marque** (symbole) : deux cœurs entrelacés (dessin original, composant `LogoMark`), le cœur de gauche en dégradé rose clair → rose, celui de droite en dégradé rose → rose foncé, qui se recouvrent ;
- un **mot-symbole** : « Duo » en couleur de texte (`--fg`) puis « Match » en rose d'encre (`--brand-ink`), police **Plus Jakarta Sans, graisse 800 (extra-bold)**, interlettrage serré (`tracking-tight`).

Source de vérité : `packages/ui/src/logo.tsx`. Ne pas redessiner : réexporter le SVG depuis ce composant.

| Élément | Valeurs (hex) |
|---|---|
| Cœur gauche | dégradé `#FF6B81` → `#E91E63` (diagonale haut-gauche → bas-droite), opacité 95 % |
| Cœur droit | dégradé `#E91E63` → `#B0124F` (diagonale haut-droite → bas-gauche), opacité 92 % |
| Proportions de la marque | boîte 48 × 44 (rapport ≈ 1,09:1) |

### 2.2 Versions

| Version | Usage | Remarques |
|---|---|---|
| Horizontale (marque + mot-symbole) | Défaut : en-têtes, e-mails, documents | Espace entre marque et texte = 0,5 em (gap 8 px à 20 px de corps) |
| Marque seule | Icône d'application, favicon, avatar de réseau social, tampon | `apps/web/public/icon.svg` |
| Monochrome **[Recommandation]** | Fax, gravure, impression 1 couleur, filigrane | Aplat unique `#C2185B` sur clair, blanc sur sombre ; à produire |
| Négatif **[Recommandation]** | Fonds photo ou fonds foncés saturés | Marque en dégradés, mot « DuoMatch » entièrement blanc |

### 2.3 Zone de protection et tailles minimales

- **Zone de protection** : laisser autour du logo un vide au moins égal à la **hauteur d'un cœur** (≈ 1/2 de la hauteur de la marque) sur les quatre côtés.
- **Taille minimale** : marque seule **16 px** (écran) / **6 mm** (impression) ; logo horizontal **96 px** de large (écran) / **25 mm** (impression). En dessous, utiliser la marque seule.
- **Taille par défaut dans l'interface** : marque 32 px (`size-8`), texte 20 px.

### 2.4 Fonds autorisés

| Fond | Autorisé | Notes |
|---|---|---|
| Blanc, rose pâle (`#FFF0F5`) | ✅ | Rendu de référence |
| Fond sombre (`#14121A`, `#1D1A25`) | ⚠️ | Le texte passe en clair automatiquement ; **le cœur droit s'assombrit** (voir écart E3, chapitre 15) |
| Photo | ⚠️ | Seulement si la zone sous le logo est uniforme et que le contraste texte/fond ≥ 4,5:1 |
| Rose plein `#E91E63` | ❌ | Perte de lecture de la marque : utiliser la version négative |

### 2.5 Interdits

- Ne pas étirer, incliner, pivoter, ajouter d'ombre portée ou de contour.
- Ne pas changer les couleurs des cœurs, ni inverser le sens des dégradés.
- Ne pas écrire « Duomatch », « DUOMATCH » ou « Duo Match » ; ne pas séparer « Duo » de « Match » sur deux lignes.
- Ne pas placer le logo sur un fond chargé ou un motif.
- Ne pas associer le logo à une photo de mineur ni à un contenu explicite.

---

## 3. Couleurs

Toutes les couleurs sont des **jetons** (variables CSS) définis dans `packages/ui/src/tokens.css` et exposés à Tailwind dans `apps/web/src/app/globals.css` (classes `bg-brand-strong`, `text-muted`, etc.). **On n'écrit jamais une valeur hexadécimale dans un composant : on utilise le jeton.**

### 3.1 Palette de marque

| Jeton | Hex | Rôle | Usage |
|---|---|---|---|
| `--brand` | `#E91E63` | Rose de marque | **Décor et grands éléments uniquement** (illustrations, icônes décoratives, dégradés, bordure de focus) : contraste blanc/rose = 4,35:1, insuffisant pour du texte courant |
| `--brand-2` | `#FF6B81` | Rose clair | Dégradés, avatars par défaut |
| `--brand-strong` | `#D81B60` | Rose d'action | Fond de bouton principal, interrupteur actif, accent du calendrier (blanc dessus : 4,95:1) |
| `--brand-strong-2` | `#C2185B` | Rose d'action foncé | Fin du dégradé du bouton principal (blanc dessus : 5,87:1) |
| `--brand-ink` | `#C2185B` (clair) · `#FF8FAE` (sombre) | Rose d'encre | **Texte et liens roses**, mot « Match » du logo |
| `--soft` | `#FFF0F5` (clair) · `#2A1A24` (sombre) | Rose très pâle | Fonds de sections, badges, boutons secondaires, survol |

**Dégradé de marque.** Boutons principaux : `from-brand-strong to-brand-strong-2` en diagonale (bas-droite). Avatar sans photo : `from-brand-2 to-brand-strong`. Halo d'accueil (`.hero-glow`) : deux halos radiaux (rose clair 35 % en haut à gauche, rose 22 % à droite) sur fond `--soft`.

### 3.2 Neutres

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#14121A` | Fond de page |
| `--card` | `#FFFFFF` | `#1D1A25` | Cartes, fenêtres |
| `--fg` | `#22212B` | `#F4F1F6` | Texte principal |
| `--muted` | `#6B6A76` | `#A9A4B3` | Texte secondaire, aides, placeholders |
| `--line` | `#EEE7EB` | `#2C2836` | Séparateurs et bordures de cartes |
| `--field` | `#FFFFFF` | `#110F16` | Fond des champs de saisie |
| `--field-line` | `#D9CFD5` | `#5A546A` | Bordure des champs |
| `--navy` | `#22212B` | `#3A3647` | Bouton « dark », barre d'administration |

### 3.3 Couleurs de statut

| Statut | Fond/aplat | Texte (clair) | Texte (sombre) | Usage |
|---|---|---|---|---|
| Succès | `--success` `#22C55E` | `--success-ink` `#166534` | `#4ADE80` | Confirmation, paiement réussi, badge « actif » |
| Erreur | `--danger` `#EF4444` · `--danger-strong` `#DC2626` | `--danger-ink` `#B91C1C` | `#FCA5A5` | Erreurs, actions destructrices (fond plein = `--danger-strong`) |
| Premium / or | `--gold` `#F5B301` | `--gold-ink` `#8A6400` | `#FCD34D` | Premium, VIP, avertissements doux |

Règle : **ne jamais utiliser la couleur seule** pour porter une information (ajouter une icône ou un texte).

### 3.4 Contrastes calculés (WCAG 2.1)

Seuils : texte courant ≥ **4,5:1** · grand texte (≥ 24 px, ou ≥ 18,7 px en gras) ≥ **3:1** · composants d'interface et graphiques ≥ **3:1**.

**Thème clair**

| Paire | Rapport | Verdict |
|---|---|---|
| Texte `#22212B` sur blanc | 15,90 | ✅ |
| Texte secondaire `#6B6A76` sur blanc | 5,32 | ✅ |
| Texte secondaire sur rose pâle `#FFF0F5` | 4,82 | ✅ |
| Blanc sur bouton `#D81B60` | 4,95 | ✅ |
| Blanc sur bouton `#C2185B` | 5,87 | ✅ |
| Lien `#C2185B` sur blanc | 5,87 | ✅ |
| Lien `#C2185B` sur rose pâle | 5,32 | ✅ |
| Succès `#166534` sur blanc | 7,13 | ✅ |
| Erreur `#B91C1C` sur blanc | 6,47 | ✅ |
| Or `#8A6400` sur blanc | 5,38 | ✅ |
| Blanc sur rose de marque `#E91E63` | **4,35** | ⚠️ grands éléments seulement |
| Bordure de champ `#D9CFD5` sur blanc | **1,52** | ❌ sous 3:1 (écart E1) |

**Thème sombre**

| Paire | Rapport | Verdict |
|---|---|---|
| Texte `#F4F1F6` sur `#14121A` | 16,58 | ✅ |
| Texte secondaire `#A9A4B3` sur `#14121A` | 7,65 | ✅ |
| Texte secondaire sur carte `#1D1A25` | 7,05 | ✅ |
| Lien `#FF8FAE` sur `#14121A` | 8,66 | ✅ |
| Lien `#FF8FAE` sur carte | 7,98 | ✅ |
| Succès `#4ADE80` sur carte | 9,82 | ✅ |
| Erreur `#FCA5A5` sur carte | 9,02 | ✅ |
| Or `#FCD34D` sur carte | 11,87 | ✅ |
| Bordure de champ `#5A546A` sur `#110F16` | **2,64** | ⚠️ sous 3:1 (écart E1) |

À toute nouvelle couleur : calculer le rapport avant de l'adopter, et l'ajouter à ce tableau.

### 3.5 Proportions d'usage **[Recommandation]**

Sur un écran type : ~70 % neutres (fonds, texte), ~20 % rose pâle `--soft`, ~10 % rose d'action (un bouton principal, un lien, un indicateur). Le rose plein ne couvre jamais une grande surface de texte.

### 3.6 Hors écran **[Recommandation]**

Conversion pour l'impression à valider avec l'imprimeur sur épreuve (les valeurs ci-dessous sont des approximations, pas des références Pantone) :

| Couleur | RVB | CMJN approx. |
|---|---|---|
| Rose de marque | 233 · 30 · 99 | 0 · 90 · 35 · 0 |
| Rose d'action | 216 · 27 · 96 | 0 · 90 · 30 · 15 |
| Texte | 34 · 33 · 43 | 20 · 20 · 0 · 90 |

---

## 4. Typographie

| Rôle | Police | Graisses utilisées | Source |
|---|---|---|---|
| Titres (`h1`–`h4`), logo, chiffres clés | **Plus Jakarta Sans** | 700, 800 | Google Fonts via `next/font` (auto-hébergée par Next, pas de requête vers Google au chargement) |
| Texte courant, interface | **Inter** | 400, 500, 600, 700 | idem |
| Secours | `ui-sans-serif, system-ui, sans-serif` | — | — |

Jeux de caractères chargés : `latin` et `latin-ext` (accents français, langues africaines latinisées). Affichage `swap` (texte visible immédiatement).

### 4.1 Règles

- Titres : interlettrage `-0.02em` (déjà appliqué à `h1`–`h4`).
- Casse : **phrase** (majuscule seulement au premier mot et aux noms propres), pas de TITRES EN MAJUSCULES, sauf étiquettes de section d'administration (11 px, majuscules, interlettrage large).
- Longueur de ligne : 45 à 75 caractères pour les textes longs.
- Interligne : 1,5 pour le texte courant, 1,2 à 1,3 pour les titres.
- Alignement : à gauche ; centrer seulement les titres courts, les cartes de confirmation et les états vides.

### 4.2 Échelle recommandée **[Recommandation]**

Le code utilise les tailles Tailwind par défaut ; on s'y tient.

| Niveau | Classe Tailwind | Taille | Usage |
|---|---|---|---|
| Titre de page | `text-3xl`/`text-4xl` + `font-extrabold` | 30–36 px | `h1` des pages publiques |
| Titre de section | `text-2xl` + `font-extrabold` | 24 px | `h2` |
| Sous-titre | `text-lg font-bold` | 18 px | `h3`, titres de cartes |
| Corps | `text-base` | 16 px | Texte courant (jamais en dessous sur mobile) |
| Secondaire | `text-sm` | 14 px | Aides, métadonnées |
| Étiquette | `text-xs font-semibold` | 12 px | Badges |

### 4.3 Hors du produit

Pour un document sans accès aux polices : Arial/Helvetica pour le texte, Georgia interdite (aucune police à empattement dans la marque). Intégrer les polices dans les PDF.

---

## 5. Formes, ombres, espacement, grille

### 5.1 Arrondis

La marque est **très arrondie**. Valeurs réelles du kit (`packages/ui`) :

| Élément | Arrondi |
|---|---|
| Boutons, badges, avatars, pastilles, interrupteurs | **Complet** (`rounded-full`) |
| Cartes et fenêtres | `rounded-3xl` (24 px) |
| Champs de saisie, listes déroulantes, zones de texte | `rounded-2xl` (16 px) |
| Squelettes de chargement | `rounded-2xl` |

Ne pas mélanger un bouton à angles droits avec ce kit.

### 5.2 Ombres

| Jeton | Valeur | Usage |
|---|---|---|
| `--shadow-soft` | `0 6px 24px -10px rgb(233 30 99 / .25)` (clair) · `… rgb(0 0 0 / .6)` (sombre) | Cartes, bouton principal : ombre légère teintée de rose |
| `--shadow-pop` | `0 24px 60px -20px rgb(34 33 43 / .45)` | Fenêtres modales, menus flottants |

### 5.3 Espacement

Échelle Tailwind (multiples de 4 px). Habitudes du produit : gouttière de page 16 px sur mobile, 32 px (`lg`) sur grands écrans ; padding de carte 20–28 px ; espacement vertical entre blocs 16–24 px.

### 5.4 Grille et largeurs

| Contexte | Largeur maximale |
|---|---|
| Pages publiques | 72 rem (≈ 1 150 px) sur le contenu principal |
| Console d'administration | `max-w-6xl` (72 rem) |
| Cartes de tarifs | 25 rem (≈ 400 px) |
| Formulaires d'authentification | carte centrée ≈ 28 rem |

Points de rupture : ceux de Tailwind (`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280). L'en-tête public se replie en **menu jusqu'à `xl`**. Conception **mobile d'abord** : tout doit fonctionner à **375 px** de large sans défilement horizontal.

### 5.5 Zones tactiles

Au moins **44 × 44 px** pour toute cible (boutons `md` : 44 px de haut ; icône seule : 44 px).

---

## 6. Iconographie

- **Bibliothèque** : [Lucide](https://lucide.dev) (`lucide-react`), trait 2 px, extrémités arrondies, sans remplissage.
- **Tailles** : 16 px (`size-4`) dans un bouton ou un texte ; 20 px (`size-5`) en navigation ; 24 px (`size-6`) en en-tête de carte ; 32 px dans les états vides.
- **Couleur** : `currentColor` (suit le texte). Icônes décoratives en `--brand` ou `--brand-ink` ; icônes d'état en couleur de statut.
- **Accessibilité** : une icône décorative porte `aria-hidden` ; une icône qui porte seule un sens (bouton sans texte) a un libellé (`aria-label`). Ne jamais laisser une icône seule sans nom accessible.
- **Exceptions de remplissage** : le badge « vérifié » est une coche pleine bleue (`fill-sky-500`, blanche dessus) ; c'est la **seule** couleur bleue de la marque et elle signifie exclusivement « profil vérifié par selfie ». **Ne jamais réutiliser ce bleu ni cette forme pour autre chose** (voir 8.9 pour le badge Premium).
- **Ne pas** mélanger une autre famille d'icônes ni utiliser d'émojis comme icônes d'interface (les émojis restent permis dans les messages des membres et les réactions).

---

## 7. Photographie et illustration

### 7.1 Photographies du site

Fichiers : `apps/web/public/images/` — portraits d'accueil (`hero-aicha.webp`, `hero-koffi.webp`, `hero-mina.webp`) et visuel d'authentification (`auth-couple.webp`) ; image de partage `public/og.png`.

Direction :
- **Personnes réelles, adultes, souriantes ou naturelles**, lumière douce, cadrage portrait (rapport **4:5**, comme les photos de profil de l'application).
- **Diversité réelle** de la clientèle visée (peaux, âges adultes, coiffures, tenues quotidiennes) ; éviter les clichés de banque d'images.
- **Aucune image suggestive**, aucun mineur, aucune personne dont on n'a pas l'autorisation écrite d'utiliser l'image. Garder les contrats de cession.
- **Pas de filtre lourd** ; au besoin une légère chaleur et un léger contraste.
- Texte alternatif **toujours** pour une image informative ; vide (`alt=""`) pour une image décorative.

### 7.2 Photos de profil (contenu des membres)

Recadrées en 4:5, sortie 1 000 × 1 250 px, ré-encodées en WebP (qualité 82, 1 600 px max) ; miniature 480 × 600. Les métadonnées (position GPS, appareil) sont supprimées. **Une charte ne remplace pas ces règles techniques** : tout visuel « profil » sur un support de communication doit être un portrait fictif ou autorisé, jamais un vrai profil de membre sans accord explicite.

### 7.3 Illustration **[Recommandation]**

Aucun système d'illustration n'existe aujourd'hui. Si l'on en crée un : formes très arrondies, palette limitée à la palette de marque et aux neutres, traits sans contour, mêmes dégradés roses que le logo.

### 7.4 Formats

| Usage | Format | Poids visé |
|---|---|---|
| Photos du site | WebP | < 150 Ko par image d'accueil |
| Logo, icônes | SVG | < 5 Ko |
| Image de partage (réseaux) | PNG, **1 200 × 630 px** | < 300 Ko |

---

## 8. Composants d'interface

Source : `packages/ui/src` (importable via `@duomatch/ui`). Règle : **ne pas recréer un composant qui existe**.

### 8.1 Boutons

| Variante | Apparence | Usage |
|---|---|---|
| `primary` | Dégradé `brand-strong → brand-strong-2`, texte blanc, ombre douce | **Une seule par écran** : l'action principale |
| `secondary` | Fond `--soft`, texte `--brand-ink` | Action de second plan |
| `outline` | Bordure `--line`, fond carte | Actions neutres |
| `ghost` | Sans fond | Actions discrètes, annuler |
| `danger` | Fond `--danger-strong`, texte blanc | Suppression, action irréversible |
| `dark` | Fond `--navy`, texte blanc | Contexte d'administration |

Tailles : `sm` 36 px, `md` 44 px (défaut), `lg` 52 px, `icon` 44 × 44 px. Texte en 600, sans retour à la ligne. État de chargement : pastille rotative, bouton inactif et `aria-busy`. Désactivé : 50 % d'opacité, sans pointeur. Appui : léger rétrécissement (98 %).

### 8.2 Champs de saisie

Hauteur 48 px, arrondi 16 px, bordure `--field-line`, fond `--field`, placeholder en `--muted`. Focus : bordure `--brand` + halo `brand/40`. Erreur : bordure `--danger`. Toujours dans un composant `Field` : étiquette visible (jamais le placeholder seul), aide ou erreur reliée par `aria-describedby`, `aria-invalid`.

### 8.3 Cartes

`rounded-3xl`, bordure `--line`, fond `--card`, ombre `--shadow-soft`. Padding 20–28 px.

### 8.4 Badges

Pastille arrondie, 12 px / 600. Tons : `brand` (rose pâle), `success`, `danger`, `neutral`, `gold`. Texte toujours en couleur « ink » sur fond teinté (jamais le rose de marque).

### 8.5 Messages en ligne (`Alert`)

`danger` (annoncé immédiatement par les lecteurs d'écran) ou `success` (annoncé poliment) ; variante encadrée ou texte simple sous un champ. Le rôle ARIA découle du ton : ne pas le choisir à la main.

### 8.6 États vides (`EmptyState`)

Disque `--soft` de 64 px avec une icône de 32 px en `--brand`, titre en police de titre, texte explicatif en `--muted` (largeur max 24 rem). Toujours proposer une action ou une piste.

### 8.7 Autres composants

Fenêtre modale (`Dialog`, avec bouton de fermeture nommé), onglets, interrupteur (`Switch`, 48 × 28 px, actif en `--brand-strong`), curseur à une ou deux poignées, case et bouton radio, sélecteur de date (calendrier aux couleurs de marque), tableau de données (`DataTable`), bulle d'aide (`Popover`), squelette de chargement, avatar (initiale sur dégradé rose si pas de photo).

### 8.8 Bandeaux de tarification

Trois cartes d'offres (Gratuit, Premium, VIP), largeur maximale 25 rem, l'offre mise en avant (`featured`) se distingue par une bordure rose et un badge ; ne pas multiplier les couleurs d'offre.

### 8.9 Badges de statut de membre

- **Vérifié** (selfie validé) : coche pleine bleue, **seule** utilisation du bleu. À conserver telle quelle.
- **Premium / VIP** **[Recommandation, non implémenté]** : badge discret `gold` (couronne ou étoile), **jamais de forme ni de couleur proche du badge « vérifié »**, désactivable par le membre, masqué pour un VIP en mode discret, affiché sur le profil détaillé et la liste des messages plutôt que sur les cartes de glisse.

---

## 9. Mouvement

- Transitions courtes (≈ 150 ms) sur couleur, ombre, échelle.
- Retour tactile : léger rétrécissement au clic (98 %).
- Chargement : squelettes pulsés (`animate-pulse`) plutôt que rotations plein écran.
- **Respect de `prefers-reduced-motion`** : toute animation est ramenée à ~0 ms par la feuille globale. Aucun effet ne doit être indispensable à la compréhension.
- Pas de clignotement (> 3 flashs par seconde) ni de défilement automatique infini.
- Animations de célébration (match) : brèves, sobres, jamais bloquantes.

---

## 10. Thèmes clair et sombre

- Clair par défaut ; le thème suit le système (`prefers-color-scheme`) tant que l'utilisateur n'a pas choisi ; le choix (clair/sombre) est mémorisé par le sélecteur.
- Les couleurs de **texte rose** changent entre thèmes (`--brand-ink` : `#C2185B` → `#FF8FAE`) : utiliser le jeton, jamais une valeur fixe.
- En sombre, les fonds s'étagent : page `#14121A` < carte `#1D1A25` ; les champs sont **plus foncés** que la carte qui les porte (`#110F16`).
- Tout nouveau visuel (illustration, capture) doit exister dans les deux thèmes ou fonctionner sur les deux fonds.
- Un composant tiers (ex. bouton Google) qui rend mal en sombre est isolé avec son propre schéma de couleurs (cas traité : `color-scheme: light` autour du bouton Google).

---

## 11. Accessibilité (obligations)

Niveau visé : **WCAG 2.1 AA**. Vérifié automatiquement par axe sur les pages publiques, les pages membre et les pages d'administration, en thème clair et sombre (`apps/web/e2e/a11y*.spec.ts`). **Cela ne remplace pas un test avec lecteur d'écran réel ni un audit externe : ils n'ont pas été faits.**

Obligations pour tout nouveau design :
1. Contraste texte ≥ 4,5:1 ; grands textes et composants ≥ 3:1 (voir 3.4).
2. Zone de focus visible : contour 2 px en `--brand`, décalé de 2 px (déjà global).
3. Navigation au clavier complète (Tab, Entrée, Échap), ordre logique, lien « Aller au contenu » en tête de page.
4. Aucun texte dans une image ; sinon, alternative textuelle équivalente.
5. Étiquettes visibles pour tous les champs ; erreurs décrites en texte, pas seulement en rouge.
6. Cibles tactiles ≥ 44 px ; zoom à 200 % sans perte de contenu ; pas de défilement horizontal à 375 px.
7. Langue de la page déclarée (`fr`/`en`) ; formulations simples.
8. Vidéo : sous-titres ; audio : transcription.

---

## 12. Voix et ton

### 12.1 Principes

- **Vouvoiement** partout dans le produit et les e-mails (« Vous avez utilisé tous vos likes… »), y compris en anglais courtois et direct.
- **Clair et bref** : phrases courtes, verbes d'action, pas de jargon (« feature flag » n'apparaît que dans l'administration).
- **Chaleureux sans excès** : un point d'exclamation au maximum, réservé aux bonnes nouvelles (« C'est un match ! »).
- **Honnête** : dire ce qui s'est passé et ce qui n'a pas eu lieu (« Le paiement a échoué. Aucun montant n'a été débité et rien n'a été activé. »).
- **Respectueux et inclusif** : pas d'injonction (« trouvez enfin »), pas de jugement sur l'apparence ou la situation familiale ; genres décrits par les choix proposés par l'application, formulations épicènes quand c'est possible.
- **Sécurité d'abord** : toujours préciser le caractère facultatif d'un champ ; jamais de promesse de résultat.

### 12.2 Exemples (repris du produit)

| Situation | À faire | À éviter |
|---|---|---|
| Titre d'inscription | « Créer mon compte » — « Gratuit, en moins de deux minutes. Pas de carte bancaire. » | « Rejoignez des millions de célibataires ! » |
| Erreur générique | « Une erreur est survenue. Réessayez. » | « Erreur 500 », trace technique |
| Limite atteinte | « Limite de likes atteinte. Revenez demain ou passez Premium pour en avoir davantage. » | « Vous êtes bloqué ! » |
| Annulation | « Annuler » | « Non, merci, je préfère rester seul » (culpabilisant) |
| Match | « C'est un match ! » | Messages cryptiques ou familiers |

### 12.3 Écriture

- **Nombres et monnaie** : « 2 500 FCFA » (espace insécable) ; 5 000 FCFA ; pourcentages « 20 % » (espace insécable avant %).
- **Dates** : « 10 novembre 2026 » (FR) / « 10 November 2026 » (EN) ; heures « 00:07 » ; ne jamais écrire une date seulement en chiffres ambigus.
- **Typographie française** : espaces insécables avant `: ; ! ? »` et après `«` ; guillemets « » ; apostrophe courbe (’) ; majuscules accentuées (« À propos »).
- **Termes constants** : « likes » (pas « j'aimes »), « match », « profil », « message », « Premium », « VIP », « Super Like », « jetons Match », « vérifié ». Garder la même orthographe de FR à EN quand le terme est repris tel quel.
- **Langues** : tout texte exige FR **et** EN, mêmes clés dans `apps/web/messages/fr.json` et `en.json` (un test automatique bloque l'écart).
- **Âge** : toujours rappeler « 18 ans et plus » dans les contextes publics (pied de page, publicités).

### 12.4 Messages sensibles

Signalement, suspension, suppression de compte, sécurité : ton calme, sans accusation, avec la suite à donner (« Votre signalement a été transmis à l'équipe de modération »). Aucun détail interne ni nom du modérateur.

---

## 13. Déclinaisons par support

### 13.1 Site et application

Suivre ce document tel quel ; composants dans `@duomatch/ui`.

### 13.2 Administration

Même kit, barre latérale sombre `#1B1A24` (texte blanc à 75 % d'opacité, élément actif blanc à 15 %), étiquettes de rubrique en majuscules 11 px, contenu sur fond `--soft` à 40 %. Aucune couleur de marque supplémentaire.

### 13.3 E-mails transactionnels

Actuellement en **texte brut** (code de confirmation, réinitialisation, lien magique). **[Recommandation]** pour une version HTML : largeur 600 px, fond blanc, logo horizontal en tête (hauteur 32 px), titre en police système (Plus Jakarta Sans n'est pas fiable en e-mail), bouton principal en `#C2185B` avec texte blanc (5,87:1) de 44 px de haut minimum, pied avec mention « Réservé aux personnes majeures (18 ans et plus) » et lien de contact. Toujours conserver la version texte.

### 13.4 Réseaux sociaux

- **Avatar** : marque seule sur fond blanc ou rose pâle, zone de protection respectée (carré de 400 px, marque ≈ 60 % de la largeur).
- **Bannière / couverture** : fond `--soft` + halo, logo horizontal, signature « Deux cœurs, une belle histoire. ».
- **Publications** : portraits autorisés, texte court sur fond uni de la palette (jamais sur photo chargée), contraste ≥ 4,5:1, mention 18+ pour toute publicité.
- **Ton** : voir chapitre 12 ; pas de promesse de rencontre garantie ; pas de contenu sexualisé.

### 13.5 Application installable (PWA) et partage

Nom « DuoMatch », couleur de thème `#E91E63`, fond `#FFFFFF`, icône `icon.svg`. Image de partage `og.png` en 1 200 × 630 px. (Voir écart E4 sur les icônes.)

### 13.6 Présentations et documents

Format 16:9, fond blanc ou `--soft`, titres Plus Jakarta Sans 800, texte Inter, un seul message par diapositive, logo en pied (marque seule), numérotation en `--muted`.

### 13.7 Impression

Logo vectoriel (SVG/PDF), marges de sécurité 5 mm, fonds perdus 3 mm, rose approché en CMJN à valider sur épreuve (3.6).

### 13.8 Publicité

Toujours : mention « 18 ans et plus », aucune image suggestive, aucun témoignage inventé, aucune promesse de résultat, respect des règles de la plateforme publicitaire pour les rencontres. Faire relire par un juriste avant la première campagne.

---

## 14. Créer une charte dérivée (modèle de fiche)

Utiliser cette fiche pour une campagne, un partenariat, un événement ou une déclinaison locale. Une charte dérivée **hérite de tout ce document** et ne déroge que sur les points listés.

```
CHARTE DÉRIVÉE : <nom>                         Version : <n>    Date : <jj/mm/aaaa>
Responsable : <nom>                            Validée par : <nom>   Date : <jj/mm/aaaa>

1. Objectif et cible (qui, quoi, pourquoi, durée) :
2. Message clé et promesse (vérifiable ? mention 18+ ?) :
3. Éléments hérités sans changement : logo / palette / typographie / ton
4. Dérogations demandées (et justification) :
     - couleur ajoutée : <hex> — rôle — contraste calculé avec <fond> : <x:1>
     - typographie : …
     - autre : …
5. Visuels : sources, droits d'utilisation, autorisations des personnes, diversité
6. Formats livrables : <liste avec dimensions et poids>
7. Accessibilité : contrastes, textes alternatifs, sous-titres
8. Langues : FR ☐  EN ☐  autres ☐
9. Contrôle avant diffusion : ☐ checklist 16.2  ☐ relecture juridique  ☐ validation responsable
```

### 14.1 Livrables d'un kit de marque complet **[Recommandation]**

À constituer et ranger dans un dossier partagé (ce dépôt n'en contient qu'une partie) :

| Livrable | Existe ? |
|---|---|
| Logo horizontal et marque seule (SVG) | ✅ (composant + `icon.svg`) |
| Logo monochrome et négatif (SVG, PNG) | ❌ |
| Jetons de couleur (CSS) | ✅ `tokens.css` |
| Palette exportée (ASE/Figma) | ❌ |
| Polices | ✅ (Google Fonts) |
| Modèle de diapositives | ❌ |
| Modèle d'e-mail HTML | ❌ |
| Gabarits de publications réseaux sociaux | ❌ |
| Icônes d'application PNG 192/512 et maskable | ❌ (voir E4) |
| Banque de photos autorisées avec contrats | ❌ à constituer (hors dépôt) |
| Bibliothèque de composants documentée (Storybook ou équivalent) | ❌ |

---

## 15. Écarts connus et dette de design

Constatés à la rédaction de ce document (non corrigés, sauf mention). À traiter avant de considérer la charte comme « verrouillée ».

| Réf. | Écart | Gravité | Piste |
|---|---|---|---|
| E1 | **Bordure des champs sous 3:1** : 1,52:1 en clair (`#D9CFD5` sur blanc), 2,64:1 en sombre. Le critère WCAG 1.4.11 (contraste des composants) peut ne pas être satisfait ; l'outil axe ne le détecte pas | Moyenne | Assombrir `--field-line` (≈ `#8F8590` en clair pour atteindre 3:1 sur blanc, ≈ `#7A7490` en sombre) puis revérifier tous les écrans |
| E2 | **Rose de marque `#E91E63` sur blanc à 4,35:1** : conforme seulement pour les grands éléments ; risque d'un usage en texte par un nouveau contributeur | Faible | Règle déjà documentée (3.1) ; ajouter une vérification automatique |
| E3 | **Logo en thème sombre** : le second cœur utilise un mélange `multiply` qui, sur fond sombre, le rend bordeaux très foncé (constaté dans le navigateur) ; la marque change d'aspect entre thèmes | Moyenne (identité) | Remplacer par des teintes fixes sans mode de fusion, validées sur fonds clair et sombre |
| E4 | **Icônes d'application** : seul `icon.svg` est déclaré dans le manifeste ; pas d'icônes PNG 192/512 ni d'icône « maskable ». L'installation sur certains appareils peut être dégradée **[à vérifier sur appareils réels]** | Faible | Produire les PNG et les déclarer |
| E5 | **Aucun logo monochrome ni négatif** | Faible | Dessiner et ajouter au kit (14.1) |
| E6 | **Badge Premium/VIP absent** : aucune distinction visible d'un abonné | À décider | Voir 8.9 |
| E7 | **E-mails en texte brut** : pas d'identité visuelle dans les messages | Faible | Voir 13.3 |
| E8 | **Pas de relecture par un designer de marque ni d'audit d'accessibilité externe** | — | À prévoir avant le lancement public |
| E9 | **Valeurs CMJN et Pantone non validées** | Faible | Épreuve chez l'imprimeur |

---

## 16. Annexes

### 16.1 Jetons à copier

Source : `packages/ui/src/tokens.css` (la copie ci-dessous peut dériver : le fichier fait foi).

```css
:root {
  --brand: #e91e63;           --brand-2: #ff6b81;
  --brand-strong: #d81b60;    --brand-strong-2: #c2185b;   --brand-ink: #c2185b;
  --soft: #fff0f5;            --bg: #ffffff;               --card: #ffffff;
  --fg: #22212b;              --muted: #6b6a76;            --line: #eee7eb;
  --field: #ffffff;           --field-line: #d9cfd5;       --navy: #22212b;
  --success: #22c55e;         --success-ink: #166534;
  --danger: #ef4444;          --danger-strong: #dc2626;    --danger-ink: #b91c1c;
  --gold: #f5b301;            --gold-ink: #8a6400;
  --shadow-soft: 0 6px 24px -10px rgb(233 30 99 / .25);
  --shadow-pop: 0 24px 60px -20px rgb(34 33 43 / .45);
}
[data-theme='dark'] {
  --bg: #14121a;  --card: #1d1a25;  --fg: #f4f1f6;  --muted: #a9a4b3;  --line: #2c2836;
  --field: #110f16;  --field-line: #5a546a;  --soft: #2a1a24;  --brand-ink: #ff8fae;
  --navy: #3a3647;  --success-ink: #4ade80;  --danger-ink: #fca5a5;  --gold-ink: #fcd34d;
  --shadow-soft: 0 6px 24px -10px rgb(0 0 0 / .6);
}
```

### 16.2 Liste de contrôle avant diffusion d'un visuel

- [ ] Logo : version autorisée, zone de protection, taille minimale, fond autorisé (2.3 et 2.4).
- [ ] Couleurs : uniquement des jetons ; contraste texte ≥ 4,5:1 mesuré (3.4).
- [ ] Typographie : Plus Jakarta Sans (titres), Inter (texte) ; aucune autre famille.
- [ ] Personnes : adultes, autorisation écrite, diversité, aucune image suggestive.
- [ ] Texte : vouvoiement, orthographe de la marque, typographie française, FR + EN si public bilingue.
- [ ] Mentions : « 18 ans et plus » pour tout support public ou publicitaire.
- [ ] Promesses : aucune promesse de résultat, aucun témoignage inventé.
- [ ] Accessibilité : texte alternatif, sous-titres, lisible en niveaux de gris.
- [ ] Formats et poids respectés (7.4).
- [ ] Droits : photos, polices, musiques ; contrats conservés.
- [ ] Validation : responsable de la marque (et juriste pour toute publicité).

### 16.3 Où se trouve quoi dans le code

| Besoin | Fichier |
|---|---|
| Jetons de couleur, ombres, thème sombre | `packages/ui/src/tokens.css` |
| Exposition à Tailwind, polices, focus, mouvement réduit | `apps/web/src/app/globals.css` |
| Chargement des polices | `apps/web/src/app/[locale]/layout.tsx` |
| Logo (marque et mot-symbole) | `packages/ui/src/logo.tsx` |
| Boutons, champs, cartes, badges, alertes | `packages/ui/src/button.tsx`, `field.tsx`, `misc.tsx`, `alert.tsx` |
| Icône, image de partage, portraits | `apps/web/public/` |
| Manifeste d'application | `apps/web/src/app/manifest.ts` |
| Textes FR / EN | `apps/web/messages/fr.json`, `en.json` |
| Tests d'accessibilité | `apps/web/e2e/a11y*.spec.ts` |

### 16.4 Historique

| Version | Date | Changement |
|---|---|---|
| 1.0 | 7 novembre 2026 | Première rédaction à partir du code existant ; contrastes calculés ; écarts E1 à E9 relevés |

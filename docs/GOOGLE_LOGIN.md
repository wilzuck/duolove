# Connexion avec Google

DuoMatch utilise **Google Identity Services** (comme WaMarket) : le navigateur obtient un *jeton d'identité* signé par Google, le serveur le **vérifie auprès de Google** avant d'ouvrir une session. Aucun mot de passe Google ne transite par DuoMatch et aucun *secret client* n'est nécessaire : seul l'**ID client** (public) sert.

Tant que l'ID client n'est pas configuré, le bouton **n'apparaît pas** (par conception) et l'API répond `501 OAUTH_NOT_CONFIGURED`.

## 1. Ce que vous devez faire dans la console Google (action humaine, une seule fois)

1. Ouvrez <https://console.cloud.google.com/> et créez un projet « DuoMatch ».
2. **API et services › Écran de consentement OAuth** : type *Externe*, nom de l'application « DuoMatch », e-mail d'assistance, e-mail du développeur. Ajoutez le domaine de production dans « Domaines autorisés » et les liens vers vos pages Confidentialité et Conditions (`/legal/privacy`, `/legal/terms`). Champs demandés : seulement `email`, `profile`, `openid` (rien de sensible).
   - En mode **Test**, seuls les comptes ajoutés comme *testeurs* peuvent se connecter. Passez en **Production** (« Publier l'application ») avant l'ouverture au public ; pour ces champs non sensibles, la validation Google n'est en général pas requise.
3. **API et services › Identifiants › Créer des identifiants › ID client OAuth** : type *Application Web*.
   - **Origines JavaScript autorisées** : `http://localhost:3000` (développement) et `https://votre-domaine` (production). Pas de `/` final, pas de chemin.
   - **URI de redirection autorisés** : aucun (le flux par jeton d'identité n'en utilise pas).
4. Copiez l'**ID client** (`1234-abc.apps.googleusercontent.com`).

## 2. Ce que vous devez configurer dans DuoMatch

| Où | Variable | Valeur |
|---|---|---|
| `backend/.env` | `GOOGLE_CLIENT_ID` | l'ID client |
| `apps/web/.env.local` | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | **le même** ID client |

- Redémarrez l'API. Pour le site : `pnpm dev` relit le fichier au démarrage ; en production, la variable est **intégrée à la compilation** (relancez `pnpm build`).
- Les deux valeurs doivent être identiques : le serveur refuse tout jeton dont l'audience ne correspond pas.

## 3. Parcours (tels que testés)

- **Compte Google déjà lié, ou même adresse e-mail confirmée** : connexion directe ; le compte est lié à Google.
- **Nouveau visiteur** : le clic sur le bouton de `/login` mène à `/register` avec « Compte Google reconnu » ; il ne reste à compléter que la date de naissance (18 ans révolus), le genre, le pays, la ville et l'acceptation des conditions. Pas de mot de passe, pas de code de confirmation (Google a confirmé l'adresse). Le jeton circule **en mémoire seulement** (jamais dans le stockage du navigateur).
- **Admin** : `registration_open` coupé = plus de création de compte (la connexion d'un compte existant reste possible).

## 4. Ce que le serveur vérifie (testé avec un jeton simulé, `backend/tests/test_google.py`)

audience = notre ID client · émetteur `accounts.google.com` · jeton non expiré · adresse **confirmée par Google** · identifiant Google présent · compte non supprimé ni banni · inscription : **majeur**, conditions acceptées, profil complet.

**Pré-détournement** : si une adresse a été utilisée pour un compte *jamais confirmé* (quelqu'un d'autre a pu choisir le mot de passe), la première connexion Google de la vraie personne **retire l'ancien mot de passe et révoque toutes les sessions** de ce compte.

## 5. Limites connues

- **Jamais exécuté avec de vrais comptes Google** : le serveur et le navigateur sont testés avec Google simulé ; le premier vrai essai reste à faire après la configuration ci-dessus.
- Chaque connexion appelle `oauth2.googleapis.com/tokeninfo` (suffisant à notre échelle ; une vérification locale de la signature avec les clés publiques de Google éviterait cet appel).
- Le script de Google (`accounts.google.com/gsi/client`) n'est chargé **que sur les pages de connexion et d'inscription** et seulement si l'ID client est défini ; la politique de cookies le mentionne déjà. Si une politique CSP est ajoutée plus tard, autorisez `accounts.google.com` (script, cadre, connexion).
- Le parrainage n'est pas pris en charge à l'inscription via Google.
- Safari et certains blocages de cookies tiers peuvent masquer le bouton (comportement de Google) ; la connexion par e-mail reste toujours disponible.

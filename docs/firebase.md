# Firebase — architecture, sécurité et mise en service

Ce document décrit le back-end de Krimossimo et **les opérations à faire dans la console Firebase**.
Aucun projet Firebase réel n'est configuré dans ce dépôt : tant que les étapes ci-dessous ne sont
pas faites, le site fonctionne avec son contenu local et l'administration indique que Firebase
n'est pas configuré.

## 1. Vue d'ensemble

```
Navigateur (GitHub Pages, React)
 ├─ lecture publique ──────────────► Firestore (règles : contenus publiés uniquement)
 ├─ administration (connexion) ───► Firebase Authentication (e-mail + mot de passe)
 │   ├─ contenus (écriture) ──────► Firestore (règles : claim admin + schéma validé)
 │   ├─ images (envoi) ───────────► Storage (règles : claim admin, images ≤ 5 Mo)
 │   └─ commandes, messages ──────► Firestore en LECTURE (claim admin)
 │                                   + Cloud Functions pour toute modification
 └─ commande, paiement, contact ──► Cloud Functions (prix relus serveur, PayPal, anti-abus)

Poste du propriétaire ── scripts/admin.ts (Admin SDK) ──► attribution du rôle administrateur
```

| Élément | Public ou secret | Où le placer |
| --- | --- | --- |
| Configuration web Firebase (`VITE_FIREBASE_*`) | **Public** par conception | `.env.local`, variables GitHub Actions |
| URL des fonctions, URL de contact, clé YouTube restreinte | Public | `.env.local`, variables GitHub Actions |
| Mot de passe SMTP | **Secret** | `firebase functions:secrets:set SMTP_PASSWORD` uniquement |
| Client ID PayPal | Public par conception | secret Firebase `PAYPAL_CLIENT_ID`, transmis au site par le serveur |
| Client secret PayPal | **Secret** | `firebase functions:secrets:set` uniquement |
| Clé de compte de service (si utilisée) | **Secret** | hors du dépôt, supprimée après usage |
| Mot de passe administrateur | **Secret** | saisi par vous, jamais écrit nulle part |

La configuration web Firebase n'est pas un secret : n'importe quel visiteur peut la lire. C'est
pourquoi **toute** la sécurité repose sur `firestore.rules`, `storage.rules` et les vérifications des
Cloud Functions, qui sont exécutées par Google et ne peuvent pas être contournées depuis le navigateur.

## 2. Rôle administrateur

- Un administrateur est un compte Firebase Authentication portant le **custom claim** `{ admin: true }`.
- Ce claim est signé par Firebase dans le jeton d'identité : il ne peut pas être modifié dans le navigateur.
- Il n'est posé que par `functions/scripts/admin.ts`, exécuté **sur votre ordinateur** avec vos identifiants
  Google. Aucune fonction HTTP ne permet de devenir administrateur.
- Les règles Firestore/Storage testent `request.auth.token.admin == true` ; les fonctions d'administration
  vérifient le jeton (signature, expiration, **révocation**) puis le même claim.
- L'interface `/admin` lit aussi ce claim, mais uniquement pour savoir quoi afficher. Une route cachée, un
  booléen local ou un champ « rôle » envoyé par le navigateur ne donnent aucun droit.
- Un compte connecté sans le claim est déconnecté immédiatement.
- La session d'administration est limitée à l'onglet (persistance `session`).

### Procédures

| Besoin | Procédure |
| --- | --- |
| Créer le compte initial | `npm --prefix functions run admin -- create <email> --project <id>` : le mot de passe est saisi deux fois, masqué, jamais affiché ni enregistré (12 caractères min., 3 types). Le compte reçoit le rôle. |
| Donner le rôle à un compte existant | `npm --prefix functions run admin -- grant <email ou UID> --project <id>` : le compte visé est affiché, il faut taper `OUI` pour confirmer ; les claims enregistrés sont relus et affichés. |
| Voir un compte et ses claims | `npm --prefix functions run admin -- show <email ou UID> --project <id>` |
| Retirer le rôle | `npm --prefix functions run admin -- revoke <email ou UID> --project <id>` (confirmation `OUI`) : claim retiré et sessions révoquées. Effet immédiat sur les fonctions, au plus tard 1 h sur les règles (durée de vie d'un jeton). Pour un effet immédiat partout, désactivez aussi le compte dans la console. |
| Lister les administrateurs | `npm --prefix functions run admin -- list --project <id>` |
| Changer le mot de passe | `/admin/account` : le mot de passe actuel est revérifié par Firebase ; les autres sessions sont fermées. |
| Mot de passe oublié | Lien « Mot de passe oublié ? » sur `/admin/login` : e-mail de réinitialisation Firebase (même réponse que le compte existe ou non). |
| Changer l'identifiant (e-mail) | `/admin/account` : après revérification du mot de passe, Firebase envoie un lien à la **nouvelle** adresse ; le changement n'a lieu qu'à son ouverture et l'ancienne adresse est prévenue. Le rôle est conservé (il est lié au compte, pas à l'adresse). |

Chaque action de rôle et chaque action d'administration côté serveur est inscrite dans la collection
`adminAudit` (lisible par les administrateurs uniquement).

### Identifiants pour le script

Le script utilise l'Admin SDK avec les *Application Default Credentials*. La connexion de la CLI Firebase
(`firebase login`) ne suffit pas. Deux possibilités :

1. **Recommandé** — Google Cloud CLI installée :
   ```bash
   gcloud auth application-default login
   gcloud auth application-default set-quota-project <id-projet>
   ```
2. **Clé de compte de service** — console Firebase > Paramètres du projet > Comptes de service >
   « Générer une nouvelle clé privée ». Enregistrez le fichier **hors du dépôt**, puis pour la session :
   ```powershell
   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\chemin\hors-du-depot\cle.json"   # PowerShell
   ```
   Supprimez la clé après usage (et révoquez-la dans Google Cloud > IAM > Comptes de service).
   Le script **refuse** une clé placée dans le dossier du projet, un fichier qui n'est pas une clé de
   compte de service, ou une clé d'un autre projet que `--project`.

## 3. Collections Firestore

| Collection | Lecture | Écriture | Contenu |
| --- | --- | --- | --- |
| `projects/{slug}` | publiés : tous ; tous : admin | admin, schéma validé | voir `src/types/content.ts` (`Project`) |
| `offers/{slug}` | publiés : tous ; tous : admin | admin, schéma validé | `Offer` ; `price` relu par `createOrder` ; `availability` : `available`, `out_of_stock` (rupture de stock), `unavailable` |
| `games/{slug}` | publiés : tous ; tous : admin | admin, schéma validé | `Game` |
| `videos/{youtubeId}` | tous | admin, schéma validé | `title`, `publishedAt`, `thumbnail?` |
| `orders/{id}` | admin | **serveur uniquement** | statut de paiement, montant figé, client, besoin, suivi |
| `contactMessages/{id}` | admin | **serveur uniquement** (`submitContact`) | message, statut `new`/`read`/`archived`, envoi de l'e-mail `pending`/`sent`/`failed` |
| `adminAudit/{id}` | admin | **serveur uniquement** | action, auteur, cible, date |
| `rateLimits/{clé}` | personne | **serveur uniquement** | compteur anti-abus (expiration TTL `expiresAt`) |
| tout le reste | personne | personne | refusé par défaut |

Champs communs des contenus : `createdAt` (date ISO ou Timestamp), `publication` (`draft`/`published`),
`order?`, et pour toute écriture depuis l'administration `updatedAt` (horodatage **serveur**) et
`updatedBy` (uid de l'auteur, vérifié par les règles). L'identifiant est celui du document
(minuscules, chiffres, tirets) ; il n'y a pas de champ `id`.

Les règles vérifient le schéma : champs autorisés, types, longueurs, liens `http(s)` uniquement, images
relatives ou `https`, catégories et devises connues, prix positif, `maxQuantity` entier de 1 à 20.

**Index** : `firestore.indexes.json` ne déclare aucun index composite (les requêtes du site n'en ont pas
besoin), désactive l'indexation des champs volumineux des commandes et messages, et active la
**politique TTL** sur `rateLimits.expiresAt` (suppression automatique des compteurs).

## 4. Storage

| Chemin | Lecture | Écriture |
| --- | --- | --- |
| `public/images/{projects\|games\|offers\|site}/{fichier}` | tous (fichier) ; liste : admin | admin : PNG, JPEG, WebP, AVIF, GIF, ≤ 5 Mo, nom de fichier sûr |
| tout le reste | personne | personne |

Le SVG est refusé (il peut contenir du script). Les futurs fichiers vendus seront distribués par des URL
signées générées côté serveur.

### Images gérées par le tableau de bord

- Un fichier est envoyé dans `public/images/<projects|games>/` **au moment de l'enregistrement**, avec un
  nom unique (date + suffixe aléatoire) : un envoi n'écrase jamais un fichier existant.
- Si l'enregistrement Firestore échoue, le fichier qui vient d'être envoyé est supprimé.
- L'ancienne image n'est supprimée qu'**après** un enregistrement réussi, et seulement si aucun projet,
  jeu ou offre ne la référence encore. Les images du site (`public/` du dépôt) et les adresses externes
  ne sont jamais supprimées.

## 5. Cloud Functions (région `europe-west1`)

| Fonction | Appelée par | Contrôles |
| --- | --- | --- |
| `createOrder`, `createPaypalOrder`, `capturePaypalOrder`, `cancelOrder`, `getOrder` | site (commande) | origine autorisée, prix relus dans Firestore, jeton propre à chaque commande, vérification PayPal |
| `paypalWebhook` | PayPal | signature vérifiée auprès de PayPal (corps brut), puis commande relue chez PayPal |
| `submitContact` | formulaire de contact | origine autorisée, validation, champ piège, délai de saisie, 3 liens max, 5 messages/heure/IP (IP jamais stockée) ; e-mail SMTP (secret `SMTP_PASSWORD`, voir docs/integrations.md) |
| `adminUpdateOrder` | `/admin/orders` | jeton Firebase vérifié + claim admin ; suivi de réalisation des commandes **payées** uniquement ; journalisé |
| `adminUpdateMessage` | `/admin/messages` | jeton Firebase vérifié + claim admin ; journalisé |

Anti-abus du contact : le compteur utilise la dernière adresse de l'en-tête `X-Forwarded-For`
(celle ajoutée par l'infrastructure Google). Après le premier déploiement, vérifiez dans les journaux
qu'elle varie bien d'un visiteur à l'autre ; si un CDN est placé devant les fonctions, adaptez `clientIp`
(`functions/src/contact.ts`).

Le statut de **paiement** d'une commande n'est jamais modifiable par l'administration : il ne provient
que de PayPal via le serveur.

## 6. Coûts et plans

| Service | Offre Spark (gratuite) | Offre Blaze (paiement à l'usage) |
| --- | --- | --- |
| Authentication (e-mail/mot de passe) | oui | oui |
| Firestore | oui (quotas gratuits) | oui |
| Storage (envoi d'images) | **non** : un bucket exige Blaze | oui (quota gratuit inclus) |
| Cloud Functions (commandes, PayPal, contact, administration) | **non** : le déploiement exige Blaze | oui (quota gratuit inclus) |

Sans Blaze, vous pouvez déjà : publier des contenus dans Firestore, vous connecter à `/admin`, publier
ou dépublier, consulter les données. L'envoi d'images, les commandes, le contact et les actions
d'administration côté serveur attendront le passage à Blaze, **quand vous le déciderez**. Si vous
l'activez, définissez une alerte de budget (Google Cloud > Facturation > Budgets et alertes).

## 7. Mise en service — étapes

### A. Dans la console Firebase (à faire par vous)

1. **Créer le projet** sur <https://console.firebase.google.com> (Google Analytics facultatif).
2. **Ajouter une application Web** (Paramètres du projet > Vos applications > `</>`) : copier les six
   valeurs de configuration dans `.env.local` (local) et dans les **variables** GitHub Actions
   (Settings > Secrets and variables > Actions > Variables). Pas besoin de Firebase Hosting.
3. **Authentication** > Commencer > Méthode de connexion : activer **Adresse e-mail/Mot de passe**
   (sans « lien par e-mail »).
   - Paramètres > **Domaines autorisés** : ajouter `<utilisateur>.github.io` (ou votre domaine).
   - Paramètres > **Actions des utilisateurs** : si l'option est proposée, **décocher la création de comptes
     (inscription)** : seuls les comptes créés par le script existeront. (Même sans cela, un compte créé
     par un tiers n'a aucun droit.)
   - Paramètres > **Règles relatives aux mots de passe**, si proposé : exiger 12 caractères minimum.
   - Vérifier que la **protection contre l'énumération des adresses e-mail** est active (par défaut sur les
     projets récents).
4. **Firestore Database** > Créer une base de données : mode **production**, emplacement européen
   (ex. `eur3` ou `europe-west1`). **Ce choix est définitif.**
5. *(Plus tard, avec Blaze)* **Storage** > Commencer, même région ; **Functions** : rien à faire dans la
   console, le déploiement s'en charge.

### B. En ligne de commande (sur votre PC, dans le dossier du projet)

```bash
npm install                                   # installe aussi firebase-tools (CLI) localement
npx firebase login
npx firebase use --add                        # choisir le projet ; crée .firebaserc (non versionné)

# Règles et index : déployables sans Blaze (Storage : seulement une fois le bucket créé)
npx firebase deploy --only firestore:rules,firestore:indexes
npx firebase deploy --only storage            # après l'activation de Storage

# Compte administrateur initial (voir §2 pour les identifiants Google)
npm --prefix functions install
npm --prefix functions run admin -- create votre-adresse@exemple.com --project <id-projet>
```

### C. Fonctions (quand Blaze sera activé)

```bash
npx firebase functions:secrets:set PAYPAL_CLIENT_ID       # valeur sandbox d'abord
npx firebase functions:secrets:set PAYPAL_CLIENT_SECRET
cp functions/.env.example functions/.env                  # PAYPAL_ENV, ALLOWED_ORIGINS, PAYPAL_WEBHOOK_ID (voir docs/paypal.md)
npx firebase deploy --only functions
```

Puis renseigner `VITE_FUNCTIONS_BASE_URL` (ex. `https://europe-west1-<id>.cloudfunctions.net`) et
`VITE_CONTACT_ENDPOINT` (`…/submitContact`) dans `.env.local` et les variables GitHub Actions.
`ALLOWED_ORIGINS` doit contenir l'adresse exacte du site (sans barre finale).

### D. Vérifier

- `/admin/login` : connexion avec le compte créé, puis tableau de bord.
- Console > Firestore > Règles > **Terrain de jeu des règles** : simuler une lecture de `orders/x` sans
  authentification → refusée.
- `npm run test:rules` (ci-dessous) avant chaque modification des règles.

## 8. Travailler sans projet réel : émulateurs

Les émulateurs Firebase tournent sur votre PC avec un projet fictif `demo-krimossimo` : aucun compte Google,
aucun coût, aucune donnée réelle. Prérequis : **Java 21** (ou plus récent).

```bash
npm run test:rules          # rejoue les 118 cas de rules-tests/cases.ts contre les émulateurs

npm --prefix functions run build
cp functions/.secret.local.example functions/.secret.local   # valeurs factices acceptées
npm run emulators           # Auth, Firestore, Storage, Functions + interface sur http://127.0.0.1:4000
```

`.env.local` pour utiliser les émulateurs avec `npm run dev` :

```env
VITE_FIREBASE_API_KEY=demo
VITE_FIREBASE_PROJECT_ID=demo-krimossimo
VITE_FIREBASE_APP_ID=demo
VITE_FIREBASE_STORAGE_BUCKET=demo-krimossimo.appspot.com
VITE_FIREBASE_EMULATORS=true
VITE_FUNCTIONS_BASE_URL=http://127.0.0.1:5001/demo-krimossimo/europe-west1
VITE_CONTACT_ENDPOINT=http://127.0.0.1:5001/demo-krimossimo/europe-west1/submitContact
```

Administrateur de test dans l'émulateur :

```bash
npm --prefix functions run admin -- create test@exemple.com --emulator
```

`VITE_FIREBASE_EMULATORS` est ignorée par `npm run build` : un site publié ne peut pas se connecter aux
émulateurs par erreur.

## 9. Avant d'ouvrir les paiements réels

- Conditions générales de vente, mentions légales, politique de confidentialité (données des commandes
  et messages : finalité, durée de conservation, droits) et e-mail de confirmation de commande.
- Recommandé : Firebase **App Check** (reCAPTCHA Enterprise) pour limiter les appels automatisés, et
  restriction de la clé d'API web aux domaines du site (Google Cloud > API et services > Identifiants).

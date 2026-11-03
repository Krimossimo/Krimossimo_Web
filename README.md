# Krimossimo Web

Site officiel de la marque Krimossimo : portfolio de développeur, création de contenu et gaming.
Frontend 100 % statique, hébergé sur GitHub Pages ; les opérations sensibles passent par Firebase.

## Stack

| Rôle | Outil |
| --- | --- |
| Interface | React 19, TypeScript, Vite 7 |
| Style | Tailwind CSS 4 (jetons de couleur dans `src/index.css`) |
| Navigation | React Router 7 (`BrowserRouter` + `404.html` pour GitHub Pages) |
| Langues | i18next + react-i18next (FR par défaut, EN), détection navigateur |
| Polices | Unbounded (titres) et Geist (texte), auto-hébergées via Fontsource |
| Backend | Firebase Auth, Firestore, Storage (chargés à la demande) — voir [docs/firebase.md](docs/firebase.md) |
| Serveur | Firebase Cloud Functions (`functions/`) : commandes, PayPal, contact, administration |
| Administration | `/admin` (chargée à la demande) : compte autorisé par custom claim `admin` |
| Paiement | PayPal JS SDK côté client, création/capture/validation côté Cloud Functions |

## Démarrer

Prérequis : Node.js 20.19+ (ou 22+).

```bash
npm install
npm run dev        # http://localhost:5173
```

Autres commandes :

```bash
npm run typecheck  # vérification TypeScript
npm run lint       # ESLint
npm test           # tests unitaires (Vitest) : modèles, sources de données, panier, commande, administration
npm run build      # build de production dans dist/ (+ 404.html et .nojekyll)
npm run preview    # sert le build localement
npm run test:rules # tests des règles Firestore/Storage dans les émulateurs (Java 21 requis)
npm run emulators  # émulateurs Firebase locaux (projet fictif demo-krimossimo)
```

Cloud Functions (dossier `functions/`, installées séparément) :

```bash
cd functions
npm install
npm test           # commandes, PayPal, contact, contrôle d'accès administrateur, gestion des rôles
npm run build      # compilation TypeScript dans functions/lib
npm run admin -- create <email> --project <id>   # compte administrateur initial (voir docs/firebase.md)
```

## Variables d'environnement

Copie `.env.example` en `.env.local`. Les variables `VITE_*` finissent dans le JavaScript public :
on n'y met que des valeurs publiques (config web Firebase, URL des fonctions, client ID PayPal).
Garde-fou : `vite.config.ts` refuse de démarrer ou de compiler si une variable `VITE_*` non vide
porte un nom de secret (`SECRET`, `PRIVATE`, `PASSWORD`, `TOKEN`, `CREDENTIAL`).

| Variable | Où | Nature | Rôle |
| --- | --- | --- | --- |
| `VITE_FIREBASE_*` (6 valeurs) | `.env.local` / variables GitHub | publique | Configuration web Firebase. Vides = contenu local, administration indisponible |
| `VITE_FIREBASE_EMULATORS` | `.env.local` | publique | `true` = émulateurs locaux, avec `npm run dev` uniquement |
| `VITE_CONTACT_ENDPOINT` | `.env.local` / variables GitHub | publique | URL de la fonction `submitContact`. Vide = aucun envoi |
| `VITE_YOUTUBE_API_KEY` | `.env.local` / variables GitHub | publique, **restreinte** | Clé YouTube Data API v3 (dernières vidéos). Vide = liste manuelle |
| `SMTP_PASSWORD` | secret Firebase | **secret** | Mot de passe SMTP (Gmail : mot de passe d'application) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `CONTACT_TO` | `functions/.env` | paramètres | Serveur d'envoi et adresse de réception des messages de contact |
| `VITE_FUNCTIONS_BASE_URL` | `.env.local` / variables GitHub | publique | URL des Cloud Functions (`https://…`). Vide = aucune commande créée |
| `PAYPAL_CLIENT_ID` | secret Firebase | serveur | Client ID de l'application PayPal (Sandbox ou Live) ; transmis au navigateur avec chaque commande (public par conception) |
| `PAYPAL_CLIENT_SECRET` | secret Firebase | **secret** | Jamais dans le site, jamais dans Git |
| `PAYPAL_ENV` | `functions/.env` | paramètre | `sandbox` (tests) ou `live` ; toute autre valeur désactive les paiements |
| `ALLOWED_ORIGINS` | `functions/.env` | paramètre | Origines autorisées (ex. `https://<utilisateur>.github.io`) ; en `live`, HTTPS uniquement |
| `PAYPAL_WEBHOOK_ID` | `functions/.env` | paramètre | Identifiant du webhook PayPal (recommandé) |

Aucune variable `VITE_PAYPAL_*` : le site reçoit le client ID et l'environnement du serveur
(d'anciennes valeurs `VITE_PAYPAL_CLIENT_ID` / `VITE_PAYPAL_CURRENCY` peuvent être supprimées).

```bash
firebase functions:secrets:set PAYPAL_CLIENT_ID
firebase functions:secrets:set PAYPAL_CLIENT_SECRET
cp functions/.env.example functions/.env   # puis PAYPAL_ENV, ALLOWED_ORIGINS, PAYPAL_WEBHOOK_ID
```

Fichiers `.env*` (sauf les `.example`), `functions/.env`, `functions/.secret.local`, `.firebaserc` et
clés de compte de service sont ignorés par Git (vérifié avec `git check-ignore`).

## Firebase et administration

Tout est détaillé dans **[docs/firebase.md](docs/firebase.md)** : architecture, collections et schémas,
règles, index, rôle administrateur, commandes Firebase CLI, étapes dans la console, émulateurs, coûts.

- **Rôle administrateur** : custom claim `{ admin: true }` posé uniquement par
  `functions/scripts/admin.ts` (exécuté par le propriétaire avec ses identifiants Google). Aucun mot
  de passe dans le code ; le compte initial est créé par ce script (mot de passe saisi masqué).
- **Règles** (`firestore.rules`, `storage.rules`) : lecture publique des contenus publiés uniquement ;
  écriture des contenus et envoi d'images réservés au claim admin, avec validation du schéma ;
  commandes, messages et journal lisibles par l'administrateur seulement, **jamais écrits par le
  navigateur** ; tout le reste refusé.
- **Opérations privilégiées** (suivi des commandes payées, statut des messages, contact, paiements) :
  Cloud Functions qui vérifient le jeton Firebase (signature, expiration, révocation) et le claim.
- **Tableau de bord** `/admin` (navigation latérale sur ordinateur, menu sur mobile, session limitée à
  l'onglet, page non indexée) :
  - *Vue d'ensemble* : chiffres lus dans Firestore, état de la configuration, import du contenu de
    `src/data` dans Firestore (sans jamais remplacer un document existant) ;
  - *Projets* et *Jeux vidéo* : création, modification, publication, suppression ; image envoyée dans
    Storage à l'enregistrement, remplacée ou retirée ; un fichier devenu inutile est supprimé seulement
    après l'enregistrement et seulement si aucun autre contenu ne l'utilise ;
  - *Boutique* : titre, description, prix (fixe, « à partir de », sur devis), devise, disponibilité
    (disponible, **rupture de stock**, indisponible), quantité maximale, conditions ;
  - *Commandes*, *Messages*, *Paramètres du compte* (mot de passe et identifiant, sans jamais afficher
    le mot de passe).
  Suppressions confirmées dans une boîte de dialogue ; boutons désactivés pendant un enregistrement
  (pas de double envoi) ; chaque erreur indique sa cause (règles de sécurité, réseau, quota…).
- **Tests des règles** : `rules-tests/cases.ts` (118 cas : visiteurs, comptes sans rôle, faux rôles,
  administrateur, schéma, Storage) exécutés contre les émulateurs par `npm run test:rules`.

## Panier et commande

Parcours : Boutique → Panier (`/cart`) → Commande (`/checkout`) → paiement PayPal.

- **Commandable en ligne** : offre publiée, disponible, avec un prix fixe (`price` > 0, sans `priceFrom`).
  Les offres sans prix ou « à partir de » restent sur devis (formulaire de contact).
- **Panier** : prestations (pas de stock). Une prestation est unique sauf si l'offre définit
  `maxQuantity` (2 à 20). Le navigateur ne mémorise que `{ offerId, quantity }` (clé
  `krimossimo-cart`, 30 jours) ; prix et titres sont relus dans le catalogue à chaque affichage.
  Une offre devenue indisponible, sur devis ou supprimée est signalée et bloque la commande.
- **Formulaire** : prénom, nom, e-mail, pays, description du besoin et consentement obligatoires ;
  téléphone, entreprise, lien et délai facultatifs. La saisie reste en mémoire (jamais stockée).
- **Vérification** : après envoi, le serveur renvoie la commande enregistrée (prestations, total
  figé, nom, prénom, e-mail) ; le client la relit avant de payer et peut la modifier.
- **Serveur** (`functions/src/payments.ts`, branché par `index.ts`, région `europe-west1`) :
  prix relus dans Firestore, commande PayPal créée et capturée par le serveur, capture vérifiée
  (montant, devise, références) avant le statut `paid`, protection contre les doubles paiements,
  webhook authentifié. Détail complet, autorisations et bascule Sandbox → Live : **[docs/paypal.md](docs/paypal.md)**.
- **Statuts** (toujours décidés par le serveur) : `created` (commande créée) →
  `payment_pending` (paiement en attente) → `paid` (paiement confirmé) ou `payment_failed`
  (paiement échoué, nouvel essai possible) ; `cancelled` (paiement abandonné, nouvel essai
  possible). Le panier n'est vidé qu'au statut `paid`.
- Tant que `VITE_FUNCTIONS_BASE_URL` est vide, le formulaire l'indique et **aucune commande
  n'est créée**. Si PayPal n'est pas configuré côté serveur, aucune commande n'est créée non plus.

### À fournir avant d'activer le paiement

1. Projet Firebase en offre **Blaze** (obligatoire pour déployer des Cloud Functions et appeler PayPal).
2. Application PayPal (developer.paypal.com) : client ID + secret **Sandbox** d'abord, puis Live
   (procédure : [docs/paypal.md](docs/paypal.md)).
3. Offres à prix fixe dans Firestore (`offers`, `publication: 'published'`), identiques aux tarifs voulus.
4. `ALLOWED_ORIGINS` = l'adresse publique du site ; `VITE_FUNCTIONS_BASE_URL` = l'URL des fonctions.
5. Webhook PayPal vers `<URL des fonctions>/paypalWebhook` (événements `CHECKOUT.ORDER.APPROVED`,
   `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DECLINED`), puis son
   identifiant dans `PAYPAL_WEBHOOK_ID`.
6. Avant le mode live : conditions générales de vente, mentions légales, politique de
   confidentialité et e-mail de confirmation de commande (non fournis ici).

## Déploiement GitHub Pages

1. Pousse le dépôt sur GitHub (branche `main`), avec le fichier `package-lock.json` (requis par `npm ci`).
2. Settings > Pages > Source : **GitHub Actions**.
3. Settings > Secrets and variables > Actions > **Variables** : ajoute les `VITE_*` (valeurs publiques).
4. Si tu utilises un domaine personnalisé ou un dépôt `<utilisateur>.github.io`, ajoute la variable `BASE_PATH` = `/`.

Le workflow `.github/workflows/deploy.yml` lint, teste, build et publie à chaque push sur `main`.
Les règles, index et fonctions Firebase se déploient séparément avec la CLI (voir docs/firebase.md).

## Structure

```
src/
  components/
    home/        Hero, sélecteur de mode, aperçu des projets
    layout/      Layout, Header, MobileMenu, Footer
    projects/    ProjectCard (accueil + page Projets)
    shop/        OfferCard (ajout au panier, devis, indisponible)
    cart/        CartLink (accès au panier dans le header)
    checkout/    CheckoutForm, OrderPanel (statut serveur), PayPalPayment (chargé à la demande)
    games/       GameCard
    activities/  VideoCard
    contact/     ContactForm (validation, envoi via lib/contact.ts)
    ui/          BrandLogo, ButtonLink, PageHeader, EmptyState, CoverImage, ThemeToggle,
                 LanguageSwitcher, PixelMark, Icons
  admin/         Administration (chargée à la demande) : authService (connexion, mot de passe,
                 identifiant), AdminAuthProvider, RequireAdmin, adminStore (Firestore),
                 adminApi (fonctions), forms (formulaires), contentActions (enregistrement avec
                 image, suppression, import), images (nettoyage Storage sûr), upload,
                 components/ (barre latérale, ImageField, ContentList, ConfirmDialog),
                 pages/ (Login, Overview, Projects, Shop, Games + éditeurs, Orders, Messages, Account)
  cart/          Panier : règles pures (cart.ts), CartProvider (stockage), useCart
  config/site.ts Liens de navigation et réseaux sociaux
  content/       Services de données (sans React) : validation, requêtes, sources locale/Firestore
  data/          Contenu local réel : projects, offers, games, videos
  data/demo/     ⚠ Données de DÉMONSTRATION (badge « Démo », jamais en production par défaut)
  types/         Modèle de contenu (Project, Offer, Game, Video) partagé avec Firestore
  hooks/         useContent (chargement/erreur), useLocale (langue, prix, dates), useDocumentTitle
  i18n/          Configuration i18next + traductions fr.json / en.json
  lib/           contact.ts, youtube.ts (dernières vidéos, cache 6 h), checkout.ts (formulaire de commande),
                 orders.ts (client des fonctions),
                 envGuard.ts (garde-fou des secrets), firebase.ts (accès paresseux)
  pages/         Home, About, Projects, ProjectDetail, Shop, Cart, Checkout, Games, Activities,
                 Contact, NotFound
  theme/         ThemeProvider (clair/sombre, mémorisé, suit le système)
functions/       Cloud Functions (non déployées)
  src/index.ts   Points d'accès : commandes, PayPal, contact, administration
  src/payments.ts  Service de commande et de paiement, sans Firebase (+ tests de bout en bout)
  src/firestoreStore.ts  Stockage Firestore du service de paiement (transactions)
  src/orders.ts  Règles pures : validation, prix, statuts, vérification des captures (+ tests)
  src/config.ts  Lecture stricte de PAYPAL_ENV et des origines autorisées (+ tests)
  src/testkit/   Simulateur de l'API PayPal Sandbox et stockage en mémoire (tests, jamais déployés)
  scripts/paypal-sandbox.ts  Test manuel des identifiants Sandbox (npm run paypal:sandbox)
  src/admin.ts   Contrôle d'accès administrateur, suivi des commandes, messages (+ tests)
  src/adminRoles.ts  Attribution / retrait du rôle (+ tests) ; scripts/admin.ts = CLI locale
  src/contact.ts Validation, anti-spam et e-mail du formulaire de contact (+ tests)
  src/contactService.ts  Envoi du formulaire : contrôles, enregistrement, e-mail SMTP (+ tests)
  src/mailer.ts  Transport SMTP (nodemailer), configuration stricte
  src/paypal.ts  Client REST PayPal (Orders v2, vérification des webhooks)
firestore.rules  Règles Firestore (refus par défaut, schéma validé, claim admin)
firestore.indexes.json  Index (aucun composite requis) et TTL des compteurs anti-abus
storage.rules    Images publiques en lecture, envoi réservé aux administrateurs
rules-tests/     Cas de test des règles + exécution dans les émulateurs
docs/firebase.md Mise en service Firebase pas à pas
docs/paypal.md   Paiement PayPal : fonctions, autorisations, variables, Sandbox, passage en Live
docs/integrations.md  Vidéos YouTube, envoi des messages de contact, réseaux sociaux
```

## Données et services

Les pages ne lisent jamais les données directement : elles passent par `contentService`
(`src/content/index.ts`), qui choisit la source automatiquement.

| Situation | Source | Démonstration |
| --- | --- | --- |
| Firebase non configuré, `npm run dev` | locale (`src/data/`) | oui (badge « Démo ») |
| Firebase non configuré, build de production | locale | non |
| Variables `VITE_FIREBASE_*` renseignées | Firestore | non |

- `VITE_CONTENT_SOURCE=local` force la source locale ; `VITE_DEMO_CONTENT=true|false` force la démo.
- Chaque document est revalidé à l'exécution (`src/content/validation.ts`) : liens http(s)
  uniquement, images relatives ou https, textes bornés, catégories connues. Un document
  invalide est écarté, sans casser la page.
- Seuls les contenus `publication: 'published'` sont affichés ; `firestore.rules` impose la même règle.
- Chargement : cartes fantômes statiques (après 250 ms), jamais de spinner. Erreur réseau ou délai
  dépassé (12 s) : message clair et bouton « Réessayer ».
- Les prix affichés sont indicatifs : une commande relit toujours le prix côté serveur
  (`functions/`, collection `offers`). Aucune donnée sensible n'est stockée dans le navigateur
  (seuls le thème, la langue et le contenu du panier — identifiants et quantités — sont mémorisés).

## Gérer le contenu local (sans Firebase)

| Contenu | Fichier | Images |
| --- | --- | --- |
| Projets | `src/data/projects.ts` | `public/images/projects/` |
| Offres (prix facultatif, `maxQuantity` facultatif) | `src/data/offers.ts` | — |
| Jeux vidéo | `src/data/games.ts` | `public/images/games/` |
| Vidéos (sans clé YouTube) | `src/data/videos.ts` | miniatures YouTube automatiques |

Chaque fichier contient un exemple commenté et suit le modèle de `src/types/content.ts`
(identifiant, titre, description, date de création, statut de publication...).
Une liste vide affiche un état vide propre.
Avec `VITE_YOUTUBE_API_KEY`, la page Activités affiche automatiquement les dernières vidéos des
trois chaînes YouTube. Le formulaire de contact valide la saisie mais n'envoie rien tant que
`VITE_CONTACT_ENDPOINT` n'est pas configuré ; il l'indique clairement au visiteur. Détails et
configurations externes : **[docs/integrations.md](docs/integrations.md)**. Une fois Firebase configuré, les contenus
viennent de Firestore et se gèrent depuis `/admin`.

## Règles de design

- Logo officiel : `public/images/krimossimo-logo.jpg` (original 1080 px, non retouché),
  versions web `krimossimo-logo-128/256.webp`, favicons dans `public/` (recadrés sur le K).
- Couleurs : blanc, noir vrai, bleu Krimossimo `#1748D0` (`#5B8CFF` en sombre),
  surfaces sombres bleu nuit. Toutes les couleurs sont des jetons dans `src/index.css`.
- Motif : le « pixel bleu » (lien actif, statut, puces) et les pixel-marks générés par projet.
- Aucune barre de progression, aucun spinner, aucune icône de rotation pour un changement d'état.
- Animations courtes, déclenchées par l'utilisateur ; `prefers-reduced-motion` respecté.

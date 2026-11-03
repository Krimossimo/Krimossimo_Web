# Paiement PayPal

Ce document décrit le paiement en ligne de Krimossimo : parcours, fonctions serveur,
autorisations, variables, configuration PayPal Developer, tests Sandbox et passage en Live.

> **État actuel.** Le code est terminé et testé hors ligne (simulateur de l'API Sandbox, voir
> « Tests »). **Aucun paiement réel n'est opérationnel** tant que les étapes ci-dessous ne sont pas
> faites : offre Blaze, secrets PayPal, déploiement des fonctions et des règles, tests dans le
> vrai Sandbox, puis bascule Live. Le site reste hébergé sur GitHub Pages ; tout ce qui touche
> à l'argent est fait par les Cloud Functions (`functions/`).

## 1. Parcours

```
Navigateur (GitHub Pages)                Cloud Functions (europe-west1)             PayPal
─────────────────────────                ──────────────────────────────             ──────
panier : { offerId, quantity }
formulaire : prénom, nom, e-mail…  ──►  createOrder
                                         relit les offres dans Firestore,
                                         calcule et FIGE le total (centimes),
                                         enregistre orders/{id} (status created)
◄── commande : lignes, total, nom/prénom/e-mail, jeton d'accès, { env, clientId }
le client vérifie sa commande
clic « Payer » (SDK chargé avec le
client ID et l'env. fournis)       ──►  createPaypalOrder
                                         relit l'éventuelle commande PayPal précédente,
                                         relit les offres (prix inchangés ?),
                                         crée la commande PayPal au montant figé ─────────► POST /v2/checkout/orders
fenêtre PayPal : l'acheteur approuve ◄───────────────────────────────────────────────────► (approbation)
onApprove                          ──►  capturePaypalOrder
                                         capture la commande PayPal ENREGISTRÉE ─────────► POST …/capture
                                         vérifie statut, montant, devise, références
                                         → paid / payment_failed / en attente
◄── statut réel
                                         paypalWebhook ◄──────────────────────────────────── événement signé
                                         signature vérifiée, commande RELUE chez PayPal
```

Le navigateur n'envoie jamais de prix et n'affiche que des statuts renvoyés par le serveur.
Une redirection, un retour du SDK ou un message du navigateur ne prouvent rien : seule la
réponse de PayPal, vérifiée par le serveur, fait passer une commande à `paid`.

## 2. Fonctions serveur

Code : `functions/src/payments.ts` (logique), `paypal.ts` (client REST), `orders.ts` (règles
pures), `firestoreStore.ts` (Firestore), `index.ts` (points d'accès).

| Fonction | Appelée par | Reçoit | Effet |
| --- | --- | --- | --- |
| `createOrder` | site | offres + quantités, coordonnées, besoin | Revalide tout, relit les prix dans `offers` (publiée, disponible, prix fixe), fige le total, crée `orders/{id}`. Renvoie le jeton d'accès, le récapitulatif et `{ env, clientId }`. 503 si PayPal n'est pas configuré, 429 au-delà de 10 commandes par heure et par IP. |
| `createPaypalOrder` | site | `orderId`, `accessToken` | Régularise la commande PayPal précédente (encaissée → `paid`, approuvée → capturée, en cours → réutilisée), refuse si un prix a changé (`price_changed`), si une offre n'est plus disponible ou si la commande a plus de 24 h. Sinon crée une commande PayPal (10 au maximum par commande). |
| `capturePaypalOrder` | site | `orderId`, `accessToken`, `paypalOrderId` | Capture uniquement la commande PayPal enregistrée sur cette commande, puis vérifie la réponse. |
| `cancelOrder` | site | `orderId`, `accessToken` | Note l'abandon (`cancelled`), sauf si PayPal a déjà encaissé (→ `paid`). Un nouvel essai reste possible. |
| `getOrder` | site | `orderId`, `accessToken` | Renvoie le statut ; si un paiement est en attente, le relit chez PayPal (et capture une commande approuvée). |
| `paypalWebhook` | PayPal | événement signé | Vérifie la signature, relit la commande chez PayPal, régularise. |

Réponses d'erreur explicites (champ `error`) : `invalid_request`, `offer_unavailable`,
`price_changed`, `order_expired`, `order_not_found`, `invalid_state` (avec le `status` réel),
`not_approved`, `paypal_order_mismatch`, `env_mismatch`, `payments_unavailable`,
`payment_unconfirmed`, `paypal_unreachable`, `paypal_error`, `rate_limited`,
`too_many_attempts`, `server`. Aucun détail interne n'est renvoyé au navigateur.

### Statuts

| Statut | Signification | Suite possible |
| --- | --- | --- |
| `created` | commande enregistrée, montant figé | `payment_pending`, `cancelled` |
| `payment_pending` | commande PayPal en cours (ou capture en examen chez PayPal) | `paid`, `payment_failed`, `cancelled` |
| `payment_failed` | capture refusée, rien encaissé | nouvel essai, ou `paid` si PayPal confirme plus tard |
| `cancelled` | paiement abandonné | nouvel essai sur la même commande, ou `paid` si PayPal confirme |
| `paid` | capture COMPLETED vérifiée | définitif |

`paid` n'est écrit qu'à un seul endroit (`settle()` dans `payments.ts`), après `verifyCapture()`.

## 3. Doubles paiements, nouvelles tentatives et erreurs

- **Clés d'idempotence PayPal** (`PayPal-Request-Id`) : création `‹commande›-create-‹n›`, capture
  `‹commande›-capture-‹commande PayPal›-‹n›`. Un appel rejoué (double clic, nouvel essai réseau)
  reçoit la même réponse sans nouvel encaissement. La clé de capture ne change qu'après un refus
  **sans** encaissement ; jamais après une issue inconnue.
- **Une seule commande PayPal active** : avant d'en créer une autre, le serveur relit la
  précédente chez PayPal. Encaissée → la commande passe à `paid` ; approuvée → elle est
  capturée ; encore valable → elle est réutilisée. Une seconde commande PayPal n'est créée que
  si la première est refusée, annulée ou expirée chez PayPal.
- **Issue inconnue** (réseau coupé, délai dépassé, erreur 5xx de PayPal pendant la capture) : la
  commande reste `payment_pending` (jamais `payment_failed`), le site affiche « ne payez pas une
  seconde fois » et masque le bouton PayPal ; « Vérifier le statut du paiement » relit PayPal.
- **Refus** (HTTP 422) : `INSTRUMENT_DECLINED` → l'acheteur choisit un autre moyen dans la même
  fenêtre (`actions.restart()`) ; `ORDER_NOT_APPROVED` → rien n'est encaissé ;
  `ORDER_ALREADY_CAPTURED` → relecture ; autres refus → `payment_failed`, nouvel essai possible.
- **Capture en examen** (`PENDING`) : ni payée ni échouée ; le webhook ou une vérification la
  confirme ensuite. Aucun nouveau paiement n'est proposé pendant l'examen.
- **Transactions Firestore** pour chaque changement de statut : deux requêtes simultanées ne
  peuvent pas écrire deux résultats contradictoires.
- **Anomalies** enregistrées dans `paymentAlerts` et affichées dans l'administration :
  second encaissement pour une même commande (à rembourser dans PayPal), montant encaissé
  différent du montant figé (jamais `paid`). Un paiement confirmé après un abandon est marqué
  « paiement tardif ».
- **Webhooks rejoués** : chaque événement traité est noté dans `paypalWebhookEvents/{id}` ;
  une seconde livraison est acquittée sans nouveau traitement.

## 4. Autorisations

- **Commandes** : `orders`, `rateLimits` et `paypalWebhookEvents` ne sont ni lisibles ni
  modifiables depuis le navigateur (`firestore.rules`). Les administrateurs (claim
  `{ admin: true }`) lisent `orders` ; ils ne peuvent jamais modifier un paiement.
- **Jeton d'accès** : chaque commande a un jeton aléatoire de 256 bits, remis une seule fois au
  navigateur et gardé en mémoire (jamais dans `localStorage`). Le serveur n'en stocke que
  l'empreinte SHA-256 et compare en temps constant. Mauvais jeton → « commande introuvable ».
- **Origine** : seules les origines de `ALLOWED_ORIGINS` sont acceptées (en Live, HTTPS
  uniquement). Ce n'est qu'un filtre pour les navigateurs : la sécurité repose sur les contrôles
  serveur ci-dessus.
- **Secrets** : `PAYPAL_CLIENT_SECRET` n'existe que dans Secret Manager et dans les fonctions qui
  le déclarent. Il n'est ni renvoyé, ni journalisé (les journaux ne contiennent ni secret, ni
  jeton, ni e-mail : vérifié par les tests).
- **Webhook** : pas de contrôle d'origine (appel de PayPal), mais signature vérifiée par l'API
  `verify-webhook-signature` avec le corps **brut** de la requête, URL de certificat limitée aux
  domaines `paypal.com`, puis commande relue chez PayPal : le contenu de l'événement n'est
  jamais cru sur parole.

## 5. Variables

| Nom | Où | Nature |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID` | `npx firebase functions:secrets:set PAYPAL_CLIENT_ID` | client ID de l'app PayPal (public par conception, transmis au site par le serveur) |
| `PAYPAL_CLIENT_SECRET` | `npx firebase functions:secrets:set PAYPAL_CLIENT_SECRET` | **secret** |
| `PAYPAL_ENV` | `functions/.env` | `sandbox` ou `live`, rien d'autre (sinon paiements désactivés) |
| `PAYPAL_WEBHOOK_ID` | `functions/.env` | identifiant du webhook du même environnement |
| `ALLOWED_ORIGINS` | `functions/.env` | origines du site, séparées par des virgules |
| `VITE_FUNCTIONS_BASE_URL` | `.env.local` / variables GitHub | URL publique des fonctions (seule variable côté site) |

Aucun identifiant PayPal n'est nécessaire côté site : pas de `VITE_PAYPAL_*`.
`functions/.env`, `functions/.secret.local` et `.env.local` sont ignorés par Git.

**Séparation Sandbox / Live** : identifiants, webhook et `PAYPAL_ENV` changent ensemble.
Chaque commande enregistre l'environnement dans lequel elle a été créée (`paymentEnv`) : une
commande Sandbox ne peut jamais être payée ni capturée en Live (`env_mismatch`), et elle est
marquée « Test (Sandbox) » dans l'administration. Le site affiche un bandeau « Mode test »
tant que le serveur est en Sandbox.

## 6. Configuration PayPal Developer (Sandbox)

Prérequis : projet Firebase en offre **Blaze** (obligatoire pour déployer les fonctions).

1. Connectez-vous à [developer.paypal.com](https://developer.paypal.com) avec votre compte PayPal.
2. **Testing Tools > Sandbox Accounts** : PayPal crée un compte *Business* (vendeur) et un compte
   *Personal* (acheteur) fictifs. Notez l'e-mail et le mot de passe du compte *Personal* : c'est
   avec lui que vous paierez pendant les tests.
3. **Apps & Credentials**, onglet **Sandbox** > *Create App* (type *Merchant*, lié au compte
   Business Sandbox). Copiez le *Client ID* et le *Secret*.
4. Dans le dossier du projet :
   ```bash
   npx firebase functions:secrets:set PAYPAL_CLIENT_ID      # coller le Client ID Sandbox
   npx firebase functions:secrets:set PAYPAL_CLIENT_SECRET  # coller le Secret Sandbox
   cp functions/.env.example functions/.env
   ```
   Dans `functions/.env` : `PAYPAL_ENV=sandbox`,
   `ALLOWED_ORIGINS=https://<utilisateur>.github.io,http://localhost:5173` (adresse réelle du site).
5. Facultatif mais conseillé : `cd functions && npm run paypal:sandbox` vérifie les identifiants,
   crée une commande de test de 1,00 EUR, vous fait payer avec le compte acheteur Sandbox,
   capture et vérifie. `npm run paypal:sandbox -- --mock INSTRUMENT_DECLINED` simule un refus.
6. Déploiement (après votre validation) :
   ```bash
   npx firebase deploy --only firestore:rules,functions
   ```
   Notez l'URL des fonctions affichée (ex. `https://europe-west1-krimossimo-1111.cloudfunctions.net`).
7. **Webhook** : dans l'app Sandbox > *Webhooks* > *Add Webhook* : URL
   `<URL des fonctions>/paypalWebhook`, événements `CHECKOUT.ORDER.APPROVED`,
   `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DECLINED`.
   Copiez le *Webhook ID* dans `PAYPAL_WEBHOOK_ID`, puis redéployez les fonctions.
8. Site : `VITE_FUNCTIONS_BASE_URL=<URL des fonctions>` dans `.env.local` et dans les variables
   GitHub Actions. Les offres payables en ligne doivent être publiées dans Firestore, avec un prix
   fixe, la disponibilité « disponible » et la bonne devise.

### Scénarios à valider dans le Sandbox

| Scénario | Comment | Attendu |
| --- | --- | --- |
| Paiement réussi | payer avec le compte acheteur Sandbox | « Paiement confirmé » ; dans l'admin : payée, « Test (Sandbox) », n° de capture ; transaction visible dans le compte Business Sandbox |
| Annulation | fermer la fenêtre PayPal | « Paiement abandonné » ; nouvel essai possible sur la même commande |
| Échec | `npm run paypal:sandbox -- --mock TRANSACTION_REFUSED` | refus classé « échec définitif » |
| Carte refusée | `npm run paypal:sandbox -- --mock INSTRUMENT_DECLINED` | refus classé « autre moyen de paiement » |
| Montant modifié | modifier la requête `createOrder` dans les outils du navigateur (prix, total) | total inchangé, calculé par le serveur |
| Prix changé | modifier le prix de l'offre dans l'admin entre la commande et le clic PayPal | message « le prix a changé », rien envoyé à PayPal |
| Répétition | double-cliquer, recharger, renvoyer un webhook (*Resend* dans le tableau de bord) | une seule capture, événement rejoué ignoré |
| Erreur réseau | outils du navigateur > *Offline* juste après l'approbation, puis *Online* et « Vérifier le statut » | « ne payez pas une seconde fois », puis « Paiement confirmé », une seule capture |
| Webhook | payer puis fermer l'onglet immédiatement après l'approbation | la commande passe à « payée » grâce au webhook |

Les événements envoyés par le *Webhook simulator* de PayPal sont fictifs : leur signature
n'est pas vérifiable, ils sont donc refusés (réponse 400). C'est le comportement attendu ; testez
le webhook avec de vrais paiements Sandbox.

## 7. Passage en production (Live)

À faire uniquement quand tous les scénarios Sandbox sont validés :

1. Compte PayPal **Business** vérifié ; conditions générales de vente, mentions légales et
   politique de confidentialité publiées (non fournies par ce projet).
2. **Apps & Credentials**, onglet **Live** > *Create App* : nouveaux Client ID et Secret.
3. Remplacer les secrets (les deux, ensemble) :
   ```bash
   npx firebase functions:secrets:set PAYPAL_CLIENT_ID      # Client ID LIVE
   npx firebase functions:secrets:set PAYPAL_CLIENT_SECRET  # Secret LIVE
   ```
4. Créer le webhook **Live** (mêmes URL et événements) ; dans `functions/.env` :
   `PAYPAL_ENV=live`, `PAYPAL_WEBHOOK_ID=<id du webhook Live>`, `ALLOWED_ORIGINS` en HTTPS uniquement.
5. `npx firebase deploy --only functions` (après validation). Le bandeau « Mode test » disparaît.
6. Premier achat réel avec votre propre compte, vérification dans l'admin et dans PayPal, puis
   remboursement depuis PayPal.

Retour en arrière : remettre les identifiants Sandbox et `PAYPAL_ENV=sandbox`, puis redéployer.
Pour suspendre toute commande en ligne, vider `VITE_FUNCTIONS_BASE_URL` et redéployer le site.

## 8. Tests automatisés

```bash
cd functions && npm test        # dont payments.test.ts : 39 scénarios de paiement de bout en bout
```

`payments.test.ts` exécute le vrai service et le vrai client REST contre
`src/testkit/paypalSandbox.ts`, un simulateur de l'API Sandbox (OAuth, Orders v2, idempotence,
refus 422, captures PENDING/DECLINED, pannes réseau avant ou après traitement, signatures de
webhook). Scénarios couverts : paiement réussi, annulation, échecs et refus de carte, montant
modifié par le client, commande PayPal étrangère, prix modifié ou offre retirée, commande
expirée, répétitions concurrentes, webhooks rejoués ou falsifiés, erreurs réseau et 5xx,
renouvellement du jeton OAuth, séparation Sandbox / Live, absence de secrets dans les journaux.

Ce simulateur n'est **pas** le vrai Sandbox PayPal : il reproduit son comportement documenté.
Les scénarios du § 6 dans le vrai Sandbox restent indispensables avant toute mise en production.

## 9. Limites connues

- Remboursements et litiges se gèrent dans PayPal ; le statut de la commande n'est pas modifié
  automatiquement par un remboursement (`PAYMENT.CAPTURE.REFUNDED` n'est pas traité).
- Le site n'envoie pas d'e-mail de confirmation : PayPal envoie son reçu à l'acheteur, et la
  commande apparaît dans l'administration.
- Le jeton d'accès vit en mémoire : après un rechargement de la page, le client ne voit plus sa
  commande (le paiement, lui, reste correctement suivi par le serveur et le webhook).
- Une commande se paie dans les 24 h suivant sa création ; au-delà, il faut la recommencer.

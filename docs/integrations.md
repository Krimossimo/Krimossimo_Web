# Intégrations : vidéos YouTube, formulaire de contact, réseaux sociaux

Ce document décrit le fonctionnement des intégrations des pages **Mes activités** et **Contact**,
et les configurations externes qui restent à faire. Rien ici ne nécessite de secret dans le site :
le seul identifiant côté navigateur est une clé d'API Google **restreinte**, qui n'est pas un secret.

## 1. Dernières vidéos YouTube (page Activités)

### Fonctionnement

- Chaînes (fichier `src/config/site.ts`, `youtubeChannels`) :

  | Chaîne | Identifiant | Adresse |
  | --- | --- | --- |
  | YouTube | `UCynAEWeQTWW38HHo8MFX9_g` | https://www.youtube.com/@Krimossimo |
  | YouTube Replay | `UCmllvEeosCaoSpDjsvuuWBQ` | https://www.youtube.com/@KrimossimoReplay |
  | YouTube Tech | `UCeTlLisyYaXQYPklmgJhN0w` | https://www.youtube.com/@KrimossimoTech |

  Les identifiants `UC…` ont été relevés sur les pages publiques des chaînes ; ils ne changent pas
  si le nom `@…` change. Vérification : YouTube Studio > Paramètres > Chaîne > Paramètres avancés.
- Le site interroge la **YouTube Data API v3** (`src/lib/youtube.ts`) : `channels.list` (les 3 chaînes),
  `playlistItems.list` (liste « uploads » de chaque chaîne), `videos.list` (détails). Soit **5 unités**
  de quota par actualisation, sur 10 000 gratuites par jour. `search.list` (100 unités) n'est pas utilisé.
- Seules les vidéos **publiques et déjà publiées** sont affichées (ni privées, ni programmées, ni en
  direct), 6 au maximum par chaîne, avec miniature (servie par `i.ytimg.com` uniquement), titre, date
  et lien `https://www.youtube.com/watch?v=…` ouvert dans un nouvel onglet.
- **Mise à jour** : le résultat est gardé **6 heures** dans le navigateur du visiteur (données publiques
  uniquement : identifiants, titres, dates, miniatures ; jamais la clé). Si YouTube est injoignable,
  la dernière copie de moins de 7 jours est affichée avec la mention de sa date.
- **Erreurs** : quota atteint, clé refusée, réseau, chaîne introuvable ou sans vidéo ont chacun un
  message explicite ; une erreur sur une chaîne n'empêche pas l'affichage des autres ; un bouton
  « Réessayer » et les liens vers les chaînes restent toujours disponibles.
- **Sans clé** (`VITE_YOUTUBE_API_KEY` vide) : la page garde son comportement d'origine (liste
  manuelle de `src/data/videos.ts` ou Firestore, sinon état vide) et ne contacte pas YouTube.

### Configuration à faire : clé d'API restreinte

1. [console.cloud.google.com](https://console.cloud.google.com) > projet `krimossimo-1111` (ou un
   autre) > **APIs & Services > Library** > *YouTube Data API v3* > **Enable**.
2. **APIs & Services > Credentials > Create credentials > API key**.
3. Modifier la clé :
   - *Application restrictions* : **Websites**, ajouter `https://<utilisateur>.github.io/*` (ou votre
     domaine) et, pour le développement, `http://localhost:5173/*` ;
   - *API restrictions* : **Restrict key** > uniquement *YouTube Data API v3*.
4. Ajouter la clé :
   - en local : `VITE_YOUTUBE_API_KEY=…` dans `.env.local` ;
   - en ligne : GitHub > Settings > Secrets and variables > Actions > **Variables** >
     `VITE_YOUTUBE_API_KEY` (le workflow `deploy.yml` la transmet au build).

Cette clé est visible dans le JavaScript du site : c'est normal pour une clé de navigateur. Les
restrictions empêchent son usage depuis un autre site et pour une autre API. Une personne
malveillante pourrait au pire consommer le quota gratuit : les vidéos afficheraient alors l'erreur
« quota atteint » jusqu'au lendemain, sans coût ni risque pour le compte. Ne réutilisez pas cette clé
ailleurs et n'activez pas la facturation sur ce projet Google Cloud pour elle.

## 2. Formulaire de contact

### Fonctionnement

- Champs : nom, prénom, e-mail, sujet (liste), message (20 à 2 000 caractères, 3 liens au plus).
  Validation dans le navigateur (`src/lib/contact.ts`), **refaite côté serveur**
  (`functions/src/contact.ts`).
- Envoi : Cloud Function `submitContact` (`functions/src/contactService.ts`) :
  1. **anti-spam** : champ piège invisible (robot → réponse neutre, rien n'est enregistré ni envoyé),
     délai minimal de saisie de 3 secondes, 3 liens au plus, aucun lien ni balise dans les noms,
     caractères de contrôle refusés (pas d'injection d'en-têtes), **5 messages par heure et par
     adresse IP** (IP jamais stockée en clair) ;
  2. message enregistré dans `contactMessages` (lisible par les administrateurs uniquement) ;
  3. **e-mail envoyé par SMTP** à `krimossimo.contact@gmail.com` (paramètre `CONTACT_TO`), en
     texte brut, avec « Répondre à » = l'adresse du visiteur ;
  4. la réponse « envoyé » n'est donnée **que si le serveur SMTP a accepté l'e-mail**. Sinon :
     erreur explicite pour le visiteur, et le message reste visible dans `/admin/messages` avec le
     badge « E-mail non envoyé ».
- Le site n'affiche « Message envoyé » que si la fonction répond `{ ok: true, delivered: true }`.
  Service non configuré, requête en échec, délai dépassé, limite atteinte : message d'erreur précis,
  saisie conservée, jamais de fausse confirmation.
- Aucun identifiant SMTP dans React : le mot de passe est un secret Firebase lu par la fonction.

### Configuration à faire : envoi par Gmail

Prérequis : offre Blaze (déploiement des Cloud Functions).

1. Compte Google `krimossimo.contact@gmail.com` : activer la **validation en deux étapes**
   (myaccount.google.com > Sécurité).
2. Créer un **mot de passe d'application** (myaccount.google.com > Sécurité > Mots de passe des
   applications), nommé par exemple « Site Krimossimo ». Il ne sert qu'à l'envoi SMTP et peut être
   révoqué à tout moment sans changer le mot de passe du compte.
3. Dans le dossier du projet :
   ```bash
   npx firebase functions:secrets:set SMTP_PASSWORD     # coller le mot de passe d'application
   ```
4. Dans `functions/.env` (voir `functions/.env.example`) :
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=krimossimo.contact@gmail.com
   CONTACT_TO=krimossimo.contact@gmail.com
   ```
   et l'adresse du site dans `ALLOWED_ORIGINS`.
5. `cd functions && npm install` (ajoute `nodemailer`), puis, après validation :
   `npx firebase deploy --only functions:submitContact`.
6. Site : `VITE_CONTACT_ENDPOINT=<URL des fonctions>/submitContact` dans `.env.local` et dans les
   variables GitHub Actions.
7. Test : envoyer un message depuis le site, vérifier sa réception dans la boîte Gmail, puis
   « Répondre » pour vérifier l'adresse de réponse.

Autre fournisseur SMTP (Brevo, OVH, Infomaniak…) : changer `SMTP_HOST`, `SMTP_PORT` (465 ou 587,
chiffrement toujours exigé), `SMTP_USER` et le secret `SMTP_PASSWORD`.

## 3. Réseaux sociaux

Liens (fichier `src/config/site.ts`, `socials`), affichés dans le pied de page, le menu mobile et
la page Contact :

| Réseau | Adresse |
| --- | --- |
| YouTube | https://www.youtube.com/@Krimossimo |
| YouTube Replay | https://www.youtube.com/@KrimossimoReplay |
| YouTube Tech | https://www.youtube.com/@KrimossimoTech |
| Twitch | https://www.twitch.tv/krimossimo |
| X | https://x.com/krimossimo_ |
| Instagram | https://www.instagram.com/krimossimo_/ |
| TikTok | https://www.tiktok.com/@krimossimo |
| GitHub | https://github.com/Krimossimo |

Chaque lien s'ouvre dans un nouvel onglet avec `rel="noopener noreferrer"`, porte un libellé
accessible (« X (nouvel onglet) »…) et une icône sobre au trait, masquée aux lecteurs d'écran.
Dans le menu mobile (icônes seules), le libellé est lu par les lecteurs d'écran et affiché en
info-bulle. L'ancien lien LinkedIn, qui n'était qu'une supposition, a été retiré.

## 4. Récapitulatif des configurations externes

| Élément | Où | Statut |
| --- | --- | --- |
| Activer YouTube Data API v3 + clé restreinte | Google Cloud | à faire |
| `VITE_YOUTUBE_API_KEY` | `.env.local`, variables GitHub | à faire |
| Validation en deux étapes + mot de passe d'application Gmail | compte Google de contact | à faire |
| Secret `SMTP_PASSWORD` | `firebase functions:secrets:set` | à faire (offre Blaze) |
| `SMTP_USER`, `CONTACT_TO`, `ALLOWED_ORIGINS` | `functions/.env` | à faire |
| Déploiement de `submitContact` | Firebase | à faire, après validation |
| `VITE_CONTACT_ENDPOINT` | `.env.local`, variables GitHub | à faire |
| Vérifier les liens X, Instagram et TikTok en les ouvrant | navigateur | à faire (ces sites bloquent les vérifications automatiques) |

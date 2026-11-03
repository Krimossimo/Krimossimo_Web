/**
 * Cas de test des règles de sécurité (firestore.rules et storage.rules).
 *
 * Ces cas sont des DONNÉES : ils sont exécutés contre les vrais émulateurs Firebase
 * par rules-tests/rules.emulator.ts (npm run test:rules). Chaque cas décrit qui agit,
 * sur quel document ou fichier, et le résultat attendu.
 */

/** Horodatage serveur : remplacé par serverTimestamp() au moment de l'écriture. */
export const SERVER_TIME = '__SERVER_TIME__'

export type Who =
  | { kind: 'anonymous' }
  | { kind: 'user'; uid: string; token?: Record<string, unknown> }

export const anonymous: Who = { kind: 'anonymous' }
export const visitor: Who = { kind: 'user', uid: 'visiteur' }
export const admin: Who = { kind: 'user', uid: 'admin-1', token: { admin: true } }
/** Claims qui ressemblent à un rôle mais ne sont pas le bon : tous doivent être refusés. */
export const fakeAdmins: { label: string; who: Who }[] = [
  { label: 'claim admin = "true" (texte)', who: { kind: 'user', uid: 'faux-1', token: { admin: 'true' } } },
  { label: 'claim admin = false', who: { kind: 'user', uid: 'faux-2', token: { admin: false } } },
  { label: 'claim role = "admin"', who: { kind: 'user', uid: 'faux-3', token: { role: 'admin' } } },
  { label: 'claim isAdmin = true', who: { kind: 'user', uid: 'faux-4', token: { isAdmin: true } } },
]

export type Expect = 'allow' | 'deny'
type Data = Record<string, unknown>

export type FirestoreCase = {
  name: string
  who: Who
  op: 'get' | 'list' | 'create' | 'update' | 'delete'
  /** Chemin du document (get, create, update, delete) ou de la collection (list). */
  path: string
  /** Filtres d'égalité de la requête (list). */
  where?: [field: string, value: unknown][]
  /** create : document complet ; update : champs modifiés (fusionnés avec l'existant). */
  data?: Data
  expect: Expect
}

export type StorageCase = {
  name: string
  who: Who
  op: 'get' | 'list' | 'upload' | 'delete'
  path: string
  size?: number
  contentType?: string
  expect: Expect
}

/* --------------------------------------------------------------- Données */

const stamp = (uid: string) => ({ updatedAt: SERVER_TIME, updatedBy: uid })

export const projectDoc = (uid: string, extra: Data = {}): Data => ({
  title: { fr: 'Site vitrine', en: 'Showcase website' },
  description: 'Description du projet.',
  category: 'website',
  createdAt: '2026-10-22',
  publication: 'draft',
  ...stamp(uid),
  ...extra,
})

export const offerDoc = (uid: string, extra: Data = {}): Data => ({
  title: 'Offre',
  description: { fr: 'Description', en: 'Description' },
  price: 149,
  currency: 'EUR',
  availability: 'available',
  contactSubject: 'website',
  createdAt: '2026-10-22',
  publication: 'published',
  ...stamp(uid),
  ...extra,
})

export const gameDoc = (uid: string, extra: Data = {}): Data => ({
  title: 'Jeu',
  description: 'Description du jeu.',
  cover: { src: 'images/games/jeu.webp', alt: { fr: 'Couverture', en: 'Cover' } },
  pricing: { type: 'free' },
  link: { url: 'https://example.com/jeu', kind: 'store', storeName: 'itch.io' },
  createdAt: '2026-10-22',
  publication: 'published',
  ...stamp(uid),
  ...extra,
})

export const videoDoc = (uid: string, extra: Data = {}): Data => ({
  title: 'Vidéo',
  publishedAt: '2026-10-01T10:00:00Z',
  ...stamp(uid),
  ...extra,
})

/** Documents présents avant chaque test (écrits sans passer par les règles). */
export const firestoreSeed: Record<string, Data> = {
  'projects/publie': { ...projectDoc('admin-1'), publication: 'published', updatedAt: '2026-10-22' },
  'projects/brouillon': { ...projectDoc('admin-1'), updatedAt: '2026-10-22' },
  'offers/publiee': { ...offerDoc('admin-1'), updatedAt: '2026-10-22' },
  'offers/brouillon': { ...offerDoc('admin-1'), publication: 'draft', updatedAt: '2026-10-22' },
  'games/publie': { ...gameDoc('admin-1'), updatedAt: '2026-10-22' },
  'games/brouillon': { ...gameDoc('admin-1'), publication: 'draft', updatedAt: '2026-10-22' },
  'videos/dQw4w9WgXcQ': { ...videoDoc('admin-1'), updatedAt: '2026-10-22' },
  'orders/commande1': {
    status: 'paid',
    totalCents: 14900,
    currency: 'EUR',
    customer: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', country: 'France' },
    accessTokenHash: 'x'.repeat(64),
  },
  'contactMessages/message1': { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', message: 'Bonjour', status: 'new' },
  'adminAudit/entree1': { action: 'grant', target: 'admin-1' },
  'rateLimits/cle1': { count: 1 },
  'paypalWebhookEvents/WH-1': { type: 'PAYMENT.CAPTURE.COMPLETED' },
}

/* ------------------------------------------------------------ Firestore */

const c = (
  name: string,
  who: Who,
  op: FirestoreCase['op'],
  path: string,
  expect: Expect,
  extra: Partial<FirestoreCase> = {},
): FirestoreCase => ({ name, who, op, path, expect, ...extra })

const published: [string, unknown][] = [['publication', 'published']]

export const firestoreCases: FirestoreCase[] = [
  // Lecture publique : uniquement les contenus publiés.
  ...['projects/publie', 'offers/publiee', 'games/publie'].map((p) => c(`visiteur anonyme : lit ${p}`, anonymous, 'get', p, 'allow')),
  ...['projects/brouillon', 'offers/brouillon', 'games/brouillon'].map((p) => c(`visiteur anonyme : ne lit pas ${p}`, anonymous, 'get', p, 'deny')),
  ...['projects', 'offers', 'games'].map((p) =>
    c(`visiteur anonyme : liste ${p} publiés (requête filtrée)`, anonymous, 'list', p, 'allow', { where: published }),
  ),
  ...['projects', 'offers', 'games'].map((p) => c(`visiteur anonyme : ne liste pas ${p} sans filtre`, anonymous, 'list', p, 'deny')),
  c('visiteur anonyme : ne liste pas les brouillons', anonymous, 'list', 'projects', 'deny', { where: [['publication', 'draft']] }),
  c('compte connecté sans rôle : ne lit pas un brouillon', visitor, 'get', 'projects/brouillon', 'deny'),
  c('visiteur anonyme : lit les vidéos', anonymous, 'list', 'videos', 'allow'),
  c('administrateur : lit un brouillon', admin, 'get', 'projects/brouillon', 'allow'),
  c('administrateur : liste tous les projets', admin, 'list', 'projects', 'allow'),
  c('administrateur : liste toutes les offres', admin, 'list', 'offers', 'allow'),

  // Écriture des contenus : administrateur uniquement, schéma vérifié.
  c('visiteur anonyme : ne crée pas de projet', anonymous, 'create', 'projects/nouveau', 'deny', { data: projectDoc('visiteur') }),
  c('compte connecté sans rôle : ne crée pas de projet', visitor, 'create', 'projects/nouveau', 'deny', { data: projectDoc('visiteur') }),
  ...fakeAdmins.map(({ label, who }) =>
    c(`${label} : ne crée pas de projet`, who, 'create', 'projects/nouveau', 'deny', {
      data: projectDoc(who.kind === 'user' ? who.uid : ''),
    }),
  ),
  c('administrateur : crée un projet valide', admin, 'create', 'projects/nouveau', 'allow', { data: projectDoc('admin-1') }),
  c('administrateur : projet complet avec couverture https', admin, 'create', 'projects/complet', 'allow', {
    data: projectDoc('admin-1', {
      summary: { fr: 'Résumé', en: 'Summary' },
      cover: { src: 'https://firebasestorage.googleapis.com/v0/b/x/o/a.webp', alt: 'Capture' },
      externalUrl: 'https://example.com',
      progress: 'completed',
      stack: ['React', 'Firebase'],
      featured: true,
      order: 1,
    }),
  }),
  c('administrateur : refus d’un champ inconnu', admin, 'create', 'projects/nouveau', 'deny', { data: projectDoc('admin-1', { isAdmin: true }) }),
  c('administrateur : refus d’un identifiant mal formé', admin, 'create', 'projects/Mauvais_ID', 'deny', { data: projectDoc('admin-1') }),
  c('administrateur : refus si l’auteur indiqué n’est pas lui', admin, 'create', 'projects/nouveau', 'deny', { data: projectDoc('autre') }),
  c('administrateur : refus d’une date de mise à jour fournie par le navigateur', admin, 'create', 'projects/nouveau', 'deny', {
    data: projectDoc('admin-1', { updatedAt: '2030-01-01' }),
  }),
  c('administrateur : refus d’un lien javascript:', admin, 'create', 'projects/nouveau', 'deny', {
    data: projectDoc('admin-1', { externalUrl: 'javascript:alert(1)' }),
  }),
  c('administrateur : refus d’une image hors du site (..)', admin, 'create', 'projects/nouveau', 'deny', {
    data: projectDoc('admin-1', { cover: { src: 'images/../../secret.png', alt: 'x' } }),
  }),
  c('administrateur : refus d’une image en http', admin, 'create', 'projects/nouveau', 'deny', {
    data: projectDoc('admin-1', { cover: { src: 'http://example.com/a.png', alt: 'x' } }),
  }),
  c('administrateur : refus d’une catégorie inconnue', admin, 'create', 'projects/nouveau', 'deny', { data: projectDoc('admin-1', { category: 'autre' }) }),
  c('administrateur : refus d’un statut de publication inconnu', admin, 'create', 'projects/nouveau', 'deny', {
    data: projectDoc('admin-1', { publication: 'public' }),
  }),
  c('administrateur : refus d’un titre trop long', admin, 'create', 'projects/nouveau', 'deny', { data: projectDoc('admin-1', { title: 'x'.repeat(141) }) }),
  c('administrateur : refus d’une traduction incomplète', admin, 'create', 'projects/nouveau', 'deny', { data: projectDoc('admin-1', { title: { fr: 'Titre' } }) }),
  c('administrateur : refus d’un titre manquant', admin, 'create', 'projects/nouveau', 'deny', { data: { ...projectDoc('admin-1'), title: undefined } }),
  c('administrateur : publie un brouillon', admin, 'update', 'projects/brouillon', 'allow', {
    data: { publication: 'published', ...stamp('admin-1') },
  }),
  c('administrateur : refus d’une mise à jour sans horodatage', admin, 'update', 'projects/brouillon', 'deny', { data: { publication: 'published' } }),
  c('compte connecté sans rôle : ne modifie pas un projet', visitor, 'update', 'projects/publie', 'deny', {
    data: { title: 'Piraté', ...stamp('visiteur') },
  }),
  c('visiteur anonyme : ne supprime pas', anonymous, 'delete', 'projects/publie', 'deny'),
  c('compte connecté sans rôle : ne supprime pas', visitor, 'delete', 'projects/publie', 'deny'),
  c('administrateur : supprime un projet', admin, 'delete', 'projects/publie', 'allow'),

  // Offres : le prix est relu par le serveur au paiement ; seul l'administrateur le fixe.
  c('compte connecté sans rôle : ne modifie pas un prix', visitor, 'update', 'offers/publiee', 'deny', { data: { price: 1, ...stamp('visiteur') } }),
  c('visiteur anonyme : ne modifie pas un prix', anonymous, 'update', 'offers/publiee', 'deny', { data: { price: 1 } }),
  c('administrateur : crée une offre à prix fixe', admin, 'create', 'offers/nouvelle', 'allow', { data: offerDoc('admin-1') }),
  c('administrateur : offre sur devis (prix null)', admin, 'create', 'offers/devis', 'allow', { data: offerDoc('admin-1', { price: null }) }),
  c('administrateur : offre multi-unités', admin, 'create', 'offers/multi', 'allow', {
    data: offerDoc('admin-1', { price: 39.9, maxQuantity: 5, conditions: { fr: 'Conditions', en: 'Terms' } }),
  }),
  c('administrateur : refus d’un prix négatif', admin, 'create', 'offers/nouvelle', 'deny', { data: offerDoc('admin-1', { price: -1 }) }),
  c('administrateur : refus d’un prix en texte', admin, 'create', 'offers/nouvelle', 'deny', { data: offerDoc('admin-1', { price: '149' }) }),
  c('administrateur : refus d’un prix absent', admin, 'create', 'offers/nouvelle', 'deny', { data: { ...offerDoc('admin-1'), price: undefined } }),
  c('administrateur : offre en rupture de stock', admin, 'create', 'offers/complete', 'allow', { data: offerDoc('admin-1', { availability: 'out_of_stock' }) }),
  c('administrateur : refus d’une disponibilité inconnue', admin, 'create', 'offers/nouvelle', 'deny', { data: offerDoc('admin-1', { availability: 'soldout' }) }),
  c('administrateur : refus d’une devise inconnue', admin, 'create', 'offers/nouvelle', 'deny', { data: offerDoc('admin-1', { currency: 'BTC' }) }),
  c('administrateur : refus de maxQuantity > 20', admin, 'create', 'offers/nouvelle', 'deny', { data: offerDoc('admin-1', { maxQuantity: 50 }) }),
  c('administrateur : refus de maxQuantity décimal', admin, 'create', 'offers/nouvelle', 'deny', { data: offerDoc('admin-1', { maxQuantity: 1.5 }) }),
  c('administrateur : change un prix', admin, 'update', 'offers/publiee', 'allow', { data: { price: 199, ...stamp('admin-1') } }),

  // Jeux
  c('administrateur : crée un jeu gratuit', admin, 'create', 'games/nouveau', 'allow', { data: gameDoc('admin-1') }),
  c('administrateur : crée un jeu payant', admin, 'create', 'games/payant', 'allow', {
    data: gameDoc('admin-1', { pricing: { type: 'paid', price: { amount: 9.99, currency: 'EUR' } }, link: { url: 'https://store.example.com', kind: 'store' } }),
  }),
  c('administrateur : refus d’un lien de jeu javascript:', admin, 'create', 'games/nouveau', 'deny', {
    data: gameDoc('admin-1', { link: { url: 'javascript:alert(1)', kind: 'download' } }),
  }),
  c('administrateur : refus d’un type de prix inconnu', admin, 'create', 'games/nouveau', 'deny', { data: gameDoc('admin-1', { pricing: { type: 'promo' } }) }),
  c('administrateur : refus d’un jeu sans couverture', admin, 'create', 'games/nouveau', 'deny', { data: { ...gameDoc('admin-1'), cover: undefined } }),
  c('compte connecté sans rôle : ne crée pas de jeu', visitor, 'create', 'games/nouveau', 'deny', { data: gameDoc('visiteur') }),

  // Vidéos
  c('administrateur : ajoute une vidéo', admin, 'create', 'videos/abcdefghijk', 'allow', { data: videoDoc('admin-1') }),
  c('administrateur : refus d’un identifiant YouTube invalide', admin, 'create', 'videos/court', 'deny', { data: videoDoc('admin-1') }),
  c('visiteur anonyme : n’ajoute pas de vidéo', anonymous, 'create', 'videos/abcdefghijk', 'deny', { data: videoDoc('x') }),
  c('compte connecté sans rôle : ne supprime pas de vidéo', visitor, 'delete', 'videos/dQw4w9WgXcQ', 'deny'),

  // Commandes : données personnelles, écrites uniquement par les Cloud Functions.
  c('visiteur anonyme : ne lit pas une commande', anonymous, 'get', 'orders/commande1', 'deny'),
  c('visiteur anonyme : ne liste pas les commandes', anonymous, 'list', 'orders', 'deny'),
  c('compte connecté sans rôle : ne lit pas une commande', visitor, 'get', 'orders/commande1', 'deny'),
  ...fakeAdmins.map(({ label, who }) => c(`${label} : ne lit pas les commandes`, who, 'list', 'orders', 'deny')),
  c('administrateur : lit une commande', admin, 'get', 'orders/commande1', 'allow'),
  c('administrateur : liste les commandes', admin, 'list', 'orders', 'allow'),
  c('visiteur anonyme : ne crée pas de commande', anonymous, 'create', 'orders/fausse', 'deny', { data: { status: 'paid', totalCents: 1 } }),
  c('compte connecté sans rôle : ne crée pas de commande', visitor, 'create', 'orders/fausse', 'deny', { data: { status: 'paid', totalCents: 1 } }),
  c('administrateur : ne marque pas une commande payée depuis le navigateur', admin, 'update', 'orders/commande1', 'deny', { data: { status: 'paid' } }),
  c('administrateur : ne supprime pas de commande depuis le navigateur', admin, 'delete', 'orders/commande1', 'deny'),

  // Messages de contact
  c('visiteur anonyme : n’écrit pas directement un message', anonymous, 'create', 'contactMessages/m2', 'deny', { data: { message: 'x' } }),
  c('visiteur anonyme : ne lit pas les messages', anonymous, 'get', 'contactMessages/message1', 'deny'),
  c('compte connecté sans rôle : ne liste pas les messages', visitor, 'list', 'contactMessages', 'deny'),
  c('administrateur : lit les messages', admin, 'list', 'contactMessages', 'allow'),
  c('administrateur : ne modifie pas un message depuis le navigateur', admin, 'update', 'contactMessages/message1', 'deny', { data: { status: 'handled' } }),

  // Journal, limites de débit, collections inconnues
  c('administrateur : lit le journal', admin, 'list', 'adminAudit', 'allow'),
  c('administrateur : n’écrit pas dans le journal', admin, 'create', 'adminAudit/faux', 'deny', { data: { action: 'grant' } }),
  c('compte connecté sans rôle : ne lit pas le journal', visitor, 'list', 'adminAudit', 'deny'),
  c('administrateur : ne lit pas les limites de débit', admin, 'get', 'rateLimits/cle1', 'deny'),
  c('administrateur : ne lit pas les événements webhook PayPal', admin, 'get', 'paypalWebhookEvents/WH-1', 'deny'),
  c('visiteur anonyme : ne crée pas d’événement webhook PayPal', anonymous, 'create', 'paypalWebhookEvents/WH-2', 'deny', { data: { type: 'PAYMENT.CAPTURE.COMPLETED' } }),
  c('visiteur anonyme : ne crée pas de collection inconnue', anonymous, 'create', 'users/moi', 'deny', { data: { admin: true } }),
  c('compte connecté sans rôle : ne s’attribue pas de rôle', visitor, 'create', 'roles/visiteur', 'deny', { data: { admin: true } }),
  c('administrateur : collection inconnue refusée', admin, 'create', 'settings/site', 'deny', { data: { x: 1 } }),
  c('administrateur : sous-collection inconnue refusée', admin, 'create', 'projects/publie/notes/n1', 'deny', { data: { x: 1 } }),
]

/* -------------------------------------------------------------- Storage */

export const storageSeed: Record<string, { contentType: string; size: number }> = {
  'public/images/projects/existante.webp': { contentType: 'image/webp', size: 200 },
  'prive/facture.pdf': { contentType: 'application/pdf', size: 200 },
}

const MB = 1024 * 1024
const s = (name: string, who: Who, op: StorageCase['op'], path: string, expect: Expect, extra: Partial<StorageCase> = {}): StorageCase => ({
  name,
  who,
  op,
  path,
  expect,
  ...extra,
})

export const storageCases: StorageCase[] = [
  s('visiteur anonyme : lit une image publique', anonymous, 'get', 'public/images/projects/existante.webp', 'allow'),
  s('visiteur anonyme : ne liste pas un dossier', anonymous, 'list', 'public/images/projects', 'deny'),
  s('visiteur anonyme : n’envoie pas d’image', anonymous, 'upload', 'public/images/projects/a.webp', 'deny', { size: 1000, contentType: 'image/webp' }),
  s('compte connecté sans rôle : n’envoie pas d’image', visitor, 'upload', 'public/images/projects/a.webp', 'deny', { size: 1000, contentType: 'image/webp' }),
  ...fakeAdmins.map(({ label, who }) =>
    s(`${label} : n’envoie pas d’image`, who, 'upload', 'public/images/projects/a.webp', 'deny', { size: 1000, contentType: 'image/webp' }),
  ),
  s('administrateur : envoie une image WebP', admin, 'upload', 'public/images/projects/a.webp', 'allow', { size: 1000, contentType: 'image/webp' }),
  s('administrateur : envoie une image JPEG', admin, 'upload', 'public/images/games/couverture.jpg', 'allow', { size: 1000, contentType: 'image/jpeg' }),
  s('administrateur : remplace une image', admin, 'upload', 'public/images/projects/existante.webp', 'allow', { size: 1000, contentType: 'image/webp' }),
  s('administrateur : refus du SVG', admin, 'upload', 'public/images/projects/logo.svg', 'deny', { size: 1000, contentType: 'image/svg+xml' }),
  s('administrateur : refus d’un SVG renommé en .webp', admin, 'upload', 'public/images/projects/logo.webp', 'deny', { size: 1000, contentType: 'image/svg+xml' }),
  s('administrateur : refus d’un HTML déguisé', admin, 'upload', 'public/images/projects/page.webp', 'deny', { size: 1000, contentType: 'text/html' }),
  s('administrateur : refus au-delà de 5 Mo', admin, 'upload', 'public/images/projects/lourde.webp', 'deny', { size: 5 * MB + 1, contentType: 'image/webp' }),
  s('administrateur : refus d’un dossier inconnu', admin, 'upload', 'public/images/prive/a.webp', 'deny', { size: 1000, contentType: 'image/webp' }),
  s('administrateur : refus hors de public/images', admin, 'upload', 'a.webp', 'deny', { size: 1000, contentType: 'image/webp' }),
  s('administrateur : refus d’un nom de fichier suspect', admin, 'upload', 'public/images/projects/.htaccess.webp', 'deny', { size: 1000, contentType: 'image/webp' }),
  s('administrateur : supprime une image', admin, 'delete', 'public/images/projects/existante.webp', 'allow'),
  s('compte connecté sans rôle : ne supprime pas d’image', visitor, 'delete', 'public/images/projects/existante.webp', 'deny'),
  s('visiteur anonyme : ne lit pas un fichier privé', anonymous, 'get', 'prive/facture.pdf', 'deny'),
  s('administrateur : ne lit pas un fichier privé directement', admin, 'get', 'prive/facture.pdf', 'deny'),
]

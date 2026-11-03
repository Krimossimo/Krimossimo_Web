/**
 * Modèle de contenu du site Krimossimo.
 *
 * Ces types décrivent les documents tels qu'ils sont stockés localement
 * (src/data/) et, plus tard, dans Firestore (collections "projects", "offers",
 * "games", "videos"). Les pages et les cartes ne dépendent que de ces types ;
 * la provenance des données est gérée par les services de src/content/.
 *
 * Sécurité : ces données servent uniquement à l'AFFICHAGE. Le navigateur n'est
 * jamais une source fiable pour un prix ou une permission : les paiements relisent
 * le prix côté serveur (functions/) et les droits sont imposés par firestore.rules.
 */

/* ------------------------------------------------------------- Communs */

export type Locale = 'fr' | 'en'

/** Texte traduit. */
export type Localized = { fr: string; en: string }

/** Texte affiché : traduit, ou identique dans les deux langues (nom propre). */
export type Translatable = string | Localized

export const currencies = ['EUR', 'USD', 'GBP', 'CAD', 'CHF'] as const
export type Currency = (typeof currencies)[number]

/** Montant en unités monétaires (ex. 49.9 = 49,90 €). Affichage uniquement. */
export type Money = { amount: number; currency: Currency }

/** Image : chemin dans public/ (ex. "images/projects/x.webp") ou URL https. */
export type ImageAsset = { src: string; alt: Translatable }

/** Brouillon (invisible sur le site) ou publié. */
export const publicationStatuses = ['draft', 'published'] as const
export type PublicationStatus = (typeof publicationStatuses)[number]

/** Champs communs à tous les contenus gérables. */
type ContentBase = {
  /** Identifiant stable (minuscules, chiffres, tirets), utilisé dans les URL. */
  id: string
  /** Date de création, format ISO (ex. "2026-10-22"). */
  createdAt: string
  publication: PublicationStatus
  /** Ordre d'affichage croissant ; à défaut, les plus récents d'abord. */
  order?: number
  /** Donnée de démonstration : affichée avec un badge « Démo ». */
  isDemo?: boolean
}

/* -------------------------------------------------------------- Projets */

export const projectCategories = ['website', 'software', 'cybersecurity', 'uiux'] as const
export type ProjectCategory = (typeof projectCategories)[number]

export const projectProgresses = ['in-progress', 'completed'] as const
export type ProjectProgress = (typeof projectProgresses)[number]

export type Project = ContentBase & {
  title: Translatable
  /** Description personnalisée (page de détail ; paragraphes séparés par une ligne vide). */
  description: Translatable
  /** Résumé court pour la carte ; à défaut, le premier paragraphe de la description. */
  summary?: Translatable
  category: ProjectCategory
  /** Couverture et son texte alternatif ; à défaut, le pixel-mark du projet. */
  cover?: ImageAsset
  /** Lien externe facultatif (site en ligne, démo, dépôt...). */
  externalUrl?: string
  /** Avancement du projet, affiché sur la carte. */
  progress?: ProjectProgress
  /** Technologies ou outils utilisés. */
  stack?: string[]
  /** Mis en avant sur l'accueil. */
  featured?: boolean
}

/* --------------------------------------------------------------- Offres */

/**
 * - available    : commandable (si prix fixe) ou sur devis ;
 * - out_of_stock : rupture de stock — prestation momentanément complète (créneaux, places),
 *                  visible mais non commandable, avec possibilité de poser une question ;
 * - unavailable  : prestation qui ne peut plus être commandée.
 */
export const offerAvailabilities = ['available', 'out_of_stock', 'unavailable'] as const
export type OfferAvailability = (typeof offerAvailabilities)[number]

export const contactSubjects = ['website', 'software', 'promotion', 'other'] as const
export type ContactSubject = (typeof contactSubjects)[number]

export type Offer = ContentBase & {
  title: Translatable
  description: Translatable
  /** Prix indicatif ; null = « Prix sur demande ». Jamais utilisé pour encaisser. */
  price: number | null
  currency: Currency
  /**
   * Affiche « À partir de » devant le prix. Un tel prix est indicatif :
   * l'offre reste sur devis et ne peut pas être payée en ligne.
   */
  priceFrom?: boolean
  /**
   * Nombre d'unités commandables en une fois (1 par défaut).
   * Une prestation se commande normalement une fois ; mettre plus de 1 seulement
   * si plusieurs unités ont un sens (ex. plusieurs publications). Ce n'est pas un stock.
   */
  maxQuantity?: number
  availability: OfferAvailability
  /** Conditions éventuelles, affichées sous l'offre. */
  conditions?: Translatable
  /** Sujet présélectionné dans le formulaire de contact. */
  contactSubject: ContactSubject
}

/* ----------------------------------------------------------- Jeux vidéo */

export type GamePricing = { type: 'free' } | { type: 'paid'; price?: Money }

export type GameLink = {
  url: string
  /** Téléchargement direct ou page d'une boutique officielle. */
  kind: 'download' | 'store'
  /** Nom de la boutique (Steam, itch.io...), affiché sur le bouton. */
  storeName?: string
}

export type Game = ContentBase & {
  title: Translatable
  description: Translatable
  cover: ImageAsset
  pricing: GamePricing
  link: GameLink
}

/* --------------------------------------------------------------- Vidéos */

export type Video = {
  /** Identifiant YouTube (11 caractères). */
  youtubeId: string
  title: string
  /** Date ISO de publication. */
  publishedAt: string
  /** Miniature locale facultative ; sinon celle de YouTube. */
  thumbnail?: string
  isDemo?: boolean
}

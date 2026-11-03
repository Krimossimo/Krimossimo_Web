/**
 * Contrat commun des sources de contenu.
 *
 * Les pages ne connaissent que cette interface (via src/content/index.ts) :
 * passer de la source locale à Firestore ne demande aucune modification
 * des composants React.
 */
import type { Game, Offer, Project, Video } from '../types/content'

export type ContentSourceName = 'local' | 'firestore'

export interface ContentRepository {
  readonly source: ContentSourceName
  /** Projets publiés, triés. */
  listProjects(): Promise<Project[]>
  /** Un projet publié, ou null s'il n'existe pas (ou n'est pas publié). */
  getProject(id: string): Promise<Project | null>
  /** Offres publiées, triées (les indisponibles restent listées). */
  listOffers(): Promise<Offer[]>
  /** Jeux publiés, triés. */
  listGames(): Promise<Game[]>
  /** Vidéos, de la plus récente à la plus ancienne. */
  listVideos(): Promise<Video[]>
}

/** Erreur de chargement (réseau, service indisponible, délai dépassé). */
export class ContentLoadError extends Error {
  constructor(
    readonly collection: string,
    options?: { cause?: unknown },
  ) {
    super(`Impossible de charger « ${collection} ».`, options)
    this.name = 'ContentLoadError'
  }
}

/** Rejette la promesse si elle dépasse le délai (évite une attente infinie hors ligne). */
export function withTimeout<T>(promise: Promise<T>, ms: number, collection: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ContentLoadError(collection, { cause: new Error('timeout') })), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof ContentLoadError ? error : new ContentLoadError(collection, { cause: error }))
      },
    )
  })
}

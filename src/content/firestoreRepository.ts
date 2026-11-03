/**
 * Source Firestore (activée automatiquement quand Firebase est configuré).
 *
 * Elle s'appuie sur un DocumentStore : l'adaptateur réel (firebaseAdapter.ts) utilise
 * le SDK Firebase ; les tests utilisent un faux en mémoire. Chaque document reçu est
 * revalidé (validation.ts) : la base n'est pas considérée comme sûre par défaut.
 *
 * Collections attendues : projects, offers, games, videos.
 * L'identifiant du document Firestore fait foi pour le champ id.
 */
import type { Game, Offer, Project, Video } from '../types/content'
import { onlyPublished, sortByOrderThenDate } from './queries'
import { withTimeout, type ContentRepository } from './repository'
import { parseGame, parseList, parseOffer, parseProject, parseVideo } from './validation'

export type CollectionName = 'projects' | 'offers' | 'games' | 'videos'
export type StoredDocument = { id: string; data: Record<string, unknown> }

export interface DocumentStore {
  /** Documents dont publication == "published" (filtre serveur, imposé aussi par les règles). */
  listPublished(collection: Exclude<CollectionName, 'videos'>): Promise<StoredDocument[]>
  /** Un document, ou null s'il n'existe pas ou n'est pas lisible (brouillon). */
  get(collection: CollectionName, id: string): Promise<StoredDocument | null>
  /** Les documents les plus récents selon un champ date. */
  listRecent(collection: 'videos', field: string, max: number): Promise<StoredDocument[]>
}

const withId = (doc: StoredDocument) => ({ ...doc.data, id: doc.id })

export function createFirestoreRepository(store: DocumentStore, { timeoutMs = 12000 } = {}): ContentRepository {
  const load = <T>(collection: string, task: () => Promise<T>) => withTimeout(task(), timeoutMs, collection)

  return {
    source: 'firestore',

    listProjects: () =>
      load('projects', async () => {
        const docs = await store.listPublished('projects')
        return sortByOrderThenDate(onlyPublished(parseList(docs.map(withId), parseProject, 'projet', (p: Project) => p.id)))
      }),

    getProject: (id) =>
      load('projects', async () => {
        // Évite une requête inutile pour un identifiant manifestement invalide.
        if (!/^[a-z0-9-]{1,80}$/.test(id)) return null
        const doc = await store.get('projects', id)
        if (!doc) return null
        const [project] = onlyPublished(parseList([withId(doc)], parseProject, 'projet', (p: Project) => p.id))
        return project ?? null
      }),

    listOffers: () =>
      load('offers', async () => {
        const docs = await store.listPublished('offers')
        return sortByOrderThenDate(onlyPublished(parseList(docs.map(withId), parseOffer, 'offre', (o: Offer) => o.id)))
      }),

    listGames: () =>
      load('games', async () => {
        const docs = await store.listPublished('games')
        return sortByOrderThenDate(onlyPublished(parseList(docs.map(withId), parseGame, 'jeu', (g: Game) => g.id)))
      }),

    listVideos: () =>
      load('videos', async () => {
        const docs = await store.listRecent('videos', 'publishedAt', 12)
        const items = docs.map((d) => ({ youtubeId: d.id, ...d.data }))
        return parseList(items, parseVideo, 'vidéo', (v: Video) => v.youtubeId).sort((a, b) =>
          b.publishedAt.localeCompare(a.publishedAt),
        )
      }),
  }
}


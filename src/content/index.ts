/**
 * Service de contenu : point d'entrée unique utilisé par les pages.
 *
 * Choix de la source :
 * - Firebase configuré (variables VITE_FIREBASE_*)  → Firestore ;
 * - sinon                                            → source locale (src/data/).
 * VITE_CONTENT_SOURCE=local force la source locale même si Firebase est configuré.
 *
 * Données de démonstration (src/data/demo/) : ajoutées à la source locale
 * - par défaut en développement (npm run dev) ;
 * - jamais dans un build de production, sauf VITE_DEMO_CONTENT=true ;
 * - VITE_DEMO_CONTENT=false les désactive aussi en développement.
 *
 * Les résultats sont mis en cache pour la session ; une erreur n'est jamais mise
 * en cache, et « Réessayer » force un nouvel appel.
 */
import { games } from '../data/games'
import { offers } from '../data/offers'
import { projects } from '../data/projects'
import { videos } from '../data/videos'
import { isFirebaseConfigured } from '../lib/firebase'
import type { Game, Offer, Project, Video } from '../types/content'
import { createFirestoreRepository } from './firestoreRepository'
import { createLocalRepository } from './localRepository'
import type { ContentRepository, ContentSourceName } from './repository'

const env = import.meta.env

export const contentSource: ContentSourceName =
  env.VITE_CONTENT_SOURCE !== 'local' && isFirebaseConfigured ? 'firestore' : 'local'

export const demoContentEnabled =
  contentSource === 'local' &&
  (env.VITE_DEMO_CONTENT === 'true' || (env.VITE_DEMO_CONTENT !== 'false' && Boolean(env.DEV)))

let repositoryPromise: Promise<ContentRepository> | undefined

function getRepository(): Promise<ContentRepository> {
  if (!repositoryPromise) {
    repositoryPromise =
      contentSource === 'firestore'
        ? import('./firebaseAdapter').then(({ createFirebaseDocumentStore }) =>
            createFirestoreRepository(createFirebaseDocumentStore()),
          )
        : (demoContentEnabled ? import('../data/demo') : Promise.resolve(undefined)).then((demo) =>
            createLocalRepository({
              real: { projects, offers, games, videos },
              demo: demo && { projects: demo.demoProjects, offers: demo.demoOffers, games: demo.demoGames },
              includeDemo: demoContentEnabled,
            }),
          )
    // Un échec de chargement du module ne doit pas bloquer les essais suivants.
    repositoryPromise.catch(() => {
      repositoryPromise = undefined
    })
  }
  return repositoryPromise
}

const cache = new Map<string, Promise<unknown>>()

function cached<T>(key: string, fresh: boolean, run: (repository: ContentRepository) => Promise<T>): Promise<T> {
  if (fresh) cache.delete(key)
  const existing = cache.get(key) as Promise<T> | undefined
  if (existing) return existing
  const promise = getRepository().then(run)
  cache.set(key, promise)
  promise.catch(() => cache.delete(key))
  return promise
}

/** Chargeurs utilisés par les pages (via le hook useContent). `fresh` ignore le cache. */
export const contentService = {
  projects: (fresh = false): Promise<Project[]> => cached('projects', fresh, (r) => r.listProjects()),
  project: (id: string, fresh = false): Promise<Project | null> => cached(`project:${id}`, fresh, (r) => r.getProject(id)),
  offers: (fresh = false): Promise<Offer[]> => cached('offers', fresh, (r) => r.listOffers()),
  games: (fresh = false): Promise<Game[]> => cached('games', fresh, (r) => r.listGames()),
  videos: (fresh = false): Promise<Video[]> => cached('videos', fresh, (r) => r.listVideos()),
}

export { ContentLoadError } from './repository'
export * from './queries'

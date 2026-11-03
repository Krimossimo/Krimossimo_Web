/**
 * Source locale : contenus réels de src/data/, plus les données de démonstration
 * de src/data/demo/ quand le mode démonstration est actif.
 *
 * Les données passent par les mêmes validations et filtres que Firestore, pour que
 * le comportement soit identique le jour du raccordement.
 */
import type { Game, Offer, Project, Video } from '../types/content'
import { onlyPublished, sortByOrderThenDate } from './queries'
import type { ContentRepository } from './repository'
import { parseGame, parseList, parseOffer, parseProject, parseVideo } from './validation'

export type LocalContent = {
  projects: unknown[]
  offers: unknown[]
  games: unknown[]
  videos: unknown[]
}

export type LocalRepositoryOptions = {
  real: LocalContent
  demo?: Partial<LocalContent>
  /** Ajoute les données de démonstration aux données réelles. */
  includeDemo: boolean
}

export function createLocalRepository({ real, demo = {}, includeDemo }: LocalRepositoryOptions): ContentRepository {
  const merge = (key: keyof LocalContent): unknown[] => (includeDemo ? [...real[key], ...(demo[key] ?? [])] : real[key])

  // Validation faite une seule fois, à la première demande.
  let cache: { projects: Project[]; offers: Offer[]; games: Game[]; videos: Video[] } | undefined

  const parseProjects = () => sortByOrderThenDate(onlyPublished(parseList(merge('projects'), parseProject, 'projet', (p) => p.id)))
  const parseOffers = () => sortByOrderThenDate(onlyPublished(parseList(merge('offers'), parseOffer, 'offre', (o) => o.id)))
  const parseGames = () => sortByOrderThenDate(onlyPublished(parseList(merge('games'), parseGame, 'jeu', (g) => g.id)))
  const parseVideos = () =>
    parseList(merge('videos'), parseVideo, 'vidéo', (v) => v.youtubeId).sort((a, b) =>
      b.publishedAt.localeCompare(a.publishedAt),
    )

  const content = () => {
    cache ??= { projects: parseProjects(), offers: parseOffers(), games: parseGames(), videos: parseVideos() }
    return cache
  }

  return {
    source: 'local',
    listProjects: async () => content().projects,
    getProject: async (id) => content().projects.find((p) => p.id === id) ?? null,
    listOffers: async () => content().offers,
    listGames: async () => content().games,
    listVideos: async () => content().videos,
  }
}

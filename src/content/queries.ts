/**
 * Requêtes pures sur les contenus (tri, filtres, comptages).
 * Aucune dépendance à React ni à la source des données : testables isolément.
 */
import { projectCategories, type Project, type ProjectCategory, type PublicationStatus } from '../types/content'

export type ProjectFilter = ProjectCategory | 'all'

type Sortable = { order?: number; createdAt: string }

/** Ordre explicite croissant d'abord, puis les plus récents. */
export function sortByOrderThenDate<T extends Sortable>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const oa = a.order ?? Number.POSITIVE_INFINITY
    const ob = b.order ?? Number.POSITIVE_INFINITY
    if (oa !== ob) return oa - ob
    return b.createdAt.localeCompare(a.createdAt)
  })
}

/** Seuls les contenus publiés sont visibles sur le site. */
export function onlyPublished<T extends { publication: PublicationStatus }>(items: readonly T[]): T[] {
  return items.filter((item) => item.publication === 'published')
}

export function isProjectFilter(value: string | null): value is ProjectFilter {
  return value === 'all' || projectCategories.includes(value as ProjectCategory)
}

export function filterProjects(projects: readonly Project[], filter: ProjectFilter): Project[] {
  return filter === 'all' ? [...projects] : projects.filter((p) => p.category === filter)
}

export function countProjectsByCategory(projects: readonly Project[]): Record<ProjectFilter, number> {
  const counts = { all: projects.length } as Record<ProjectFilter, number>
  for (const category of projectCategories) counts[category] = 0
  for (const project of projects) counts[project.category] += 1
  return counts
}

/** Projets de l'accueil : les « featured » d'abord, puis l'ordre habituel. */
export function selectFeaturedProjects(projects: readonly Project[], max = 3): Project[] {
  const sorted = sortByOrderThenDate(projects)
  return [...sorted.filter((p) => p.featured), ...sorted.filter((p) => !p.featured)].slice(0, max)
}

export function containsDemo(items: readonly { isDemo?: boolean }[]): boolean {
  return items.some((item) => item.isDemo)
}

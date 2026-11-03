import { describe, expect, it } from 'vitest'
import type { Project } from '../types/content'
import {
  containsDemo,
  countProjectsByCategory,
  filterProjects,
  isProjectFilter,
  onlyPublished,
  selectFeaturedProjects,
  sortByOrderThenDate,
} from './queries'

const make = (id: string, extra: Partial<Project> = {}): Project => ({
  id,
  title: id,
  description: 'd',
  category: 'website',
  createdAt: '2026-01-01T00:00:00.000Z',
  publication: 'published',
  ...extra,
})

describe('tri', () => {
  it('ordre explicite d’abord, puis les plus récents', () => {
    const sorted = sortByOrderThenDate([
      make('ancien', { createdAt: '2025-01-01' }),
      make('recent', { createdAt: '2026-06-01' }),
      make('deuxieme', { order: 2 }),
      make('premier', { order: 1 }),
    ])
    expect(sorted.map((p) => p.id)).toEqual(['premier', 'deuxieme', 'recent', 'ancien'])
  })

  it('ne modifie pas la liste d’origine', () => {
    const list = [make('b', { order: 2 }), make('a', { order: 1 })]
    sortByOrderThenDate(list)
    expect(list[0].id).toBe('b')
  })
})

describe('publication', () => {
  it('ne garde que les contenus publiés', () => {
    expect(onlyPublished([make('a'), make('b', { publication: 'draft' })]).map((p) => p.id)).toEqual(['a'])
  })
})

describe('filtres de projets', () => {
  const projects = [
    make('site', { category: 'website' }),
    make('app', { category: 'software' }),
    make('app2', { category: 'software' }),
    make('ui', { category: 'uiux' }),
  ]

  it('reconnaît les filtres valides', () => {
    expect(isProjectFilter('all')).toBe(true)
    expect(isProjectFilter('cybersecurity')).toBe(true)
    expect(isProjectFilter('autre')).toBe(false)
    expect(isProjectFilter(null)).toBe(false)
  })

  it('filtre par catégorie', () => {
    expect(filterProjects(projects, 'software').map((p) => p.id)).toEqual(['app', 'app2'])
    expect(filterProjects(projects, 'cybersecurity')).toHaveLength(0)
    expect(filterProjects(projects, 'all')).toHaveLength(4)
  })

  it('compte chaque catégorie, y compris les vides', () => {
    expect(countProjectsByCategory(projects)).toEqual({ all: 4, website: 1, software: 2, cybersecurity: 0, uiux: 1 })
    expect(countProjectsByCategory([])).toEqual({ all: 0, website: 0, software: 0, cybersecurity: 0, uiux: 0 })
  })

  it('met les projets « featured » en tête de l’accueil', () => {
    const selection = selectFeaturedProjects([make('a', { order: 1 }), make('b', { order: 2, featured: true }), make('c')], 2)
    expect(selection.map((p) => p.id)).toEqual(['b', 'a'])
  })
})

describe('démonstration', () => {
  it('détecte la présence de contenus de démonstration', () => {
    expect(containsDemo([make('a')])).toBe(false)
    expect(containsDemo([make('a'), make('b', { isDemo: true })])).toBe(true)
  })
})

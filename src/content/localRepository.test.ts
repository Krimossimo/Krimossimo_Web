import { describe, expect, it } from 'vitest'
import { createLocalRepository } from './localRepository'

const project = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  description: 'd',
  category: 'website',
  createdAt: '2026-01-01',
  publication: 'published',
  ...extra,
})

const real = { projects: [project('reel')], offers: [], games: [], videos: [] }
const demo = { projects: [project('demo', { isDemo: true }), project('demo-brouillon', { isDemo: true, publication: 'draft' })] }

describe('source locale', () => {
  it('sans démonstration : uniquement les contenus réels', async () => {
    const repo = createLocalRepository({ real, demo, includeDemo: false })
    expect((await repo.listProjects()).map((p) => p.id)).toEqual(['reel'])
  })

  it('avec démonstration : contenus réels + démos publiées, jamais les brouillons', async () => {
    const repo = createLocalRepository({ real, demo, includeDemo: true })
    const ids = (await repo.listProjects()).map((p) => p.id)
    expect(ids).toContain('reel')
    expect(ids).toContain('demo')
    expect(ids).not.toContain('demo-brouillon')
  })

  it('getProject renvoie null pour un brouillon ou un identifiant inconnu', async () => {
    const repo = createLocalRepository({ real, demo, includeDemo: true })
    expect(await repo.getProject('demo-brouillon')).toBeNull()
    expect(await repo.getProject('inexistant')).toBeNull()
    expect((await repo.getProject('reel'))?.id).toBe('reel')
  })

  it('écarte un document invalide sans casser la liste', async () => {
    const repo = createLocalRepository({
      real: { ...real, projects: [project('ok'), project('mauvais', { category: 'inconnue' })] },
      includeDemo: false,
    })
    expect((await repo.listProjects()).map((p) => p.id)).toEqual(['ok'])
  })

  it('renvoie des listes vides quand il n’y a aucun contenu', async () => {
    const repo = createLocalRepository({ real: { projects: [], offers: [], games: [], videos: [] }, includeDemo: false })
    expect(await repo.listProjects()).toEqual([])
    expect(await repo.listOffers()).toEqual([])
    expect(await repo.listGames()).toEqual([])
    expect(await repo.listVideos()).toEqual([])
  })
})

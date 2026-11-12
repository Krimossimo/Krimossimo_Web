import { describe, expect, it } from 'vitest'
import {
  SECRET_CODE,
  STORAGE_KEY,
  advanceCode,
  emptyState,
  normalizePath,
  parseState,
  tryMode,
  unlock,
  unlockedCount,
  visitPage,
} from './achievements'

describe('succès', () => {
  it('débloque une seule fois', () => {
    const a = unlock(emptyState(), 'start', 1)
    expect(a.unlocked).toEqual(['start'])
    const b = unlock(a.state, 'start', 2)
    expect(b.unlocked).toEqual([])
    expect(b.state.unlocked.start).toBe(1)
    expect(unlockedCount(b.state)).toBe(1)
  })

  it('normalise les chemins de pages', () => {
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('/projects/abc')).toBe('/projects')
    expect(normalizePath('/contact?subject=x')).toBe('/contact')
  })

  it('débloque « Explorateur » à la 4e page différente', () => {
    let state = emptyState()
    for (const p of ['/', '/projects/a', '/projects/b', '/shop']) {
      const r = visitPage(state, p)
      expect(r.unlocked).toEqual([])
      state = r.state
    }
    expect(state.pages).toEqual(['/', '/projects', '/shop'])
    expect(visitPage(state, '/games').unlocked).toEqual(['explorer'])
  })

  it('débloque « Touche-à-tout » après les trois modes', () => {
    let state = emptyState()
    state = tryMode(state, 'dev').state
    state = tryMode(state, 'dev').state
    state = tryMode(state, 'inconnu').state
    state = tryMode(state, 'create').state
    expect(state.modes).toEqual(['dev', 'create'])
    expect(tryMode(state, 'play').unlocked).toEqual(['modes'])
  })

  it('lit un état stocké en ignorant les données invalides', () => {
    expect(parseState(null)).toEqual(emptyState())
    expect(parseState('pas du json')).toEqual(emptyState())
    expect(parseState('{"version":2}')).toEqual(emptyState())
    const state = parseState(
      JSON.stringify({ version: 1, unlocked: { start: 5, faux: 3, theme: 'x' }, pages: ['/', 4], modes: 'dev' }),
    )
    expect(state).toEqual({ version: 1, unlocked: { start: 5 }, pages: ['/'], modes: [] })
    expect(STORAGE_KEY).toBe('krimossimo-achievements')
  })

  it('reconnaît le code secret, même après des touches en trop', () => {
    const run = (keys: readonly string[]) => keys.reduce((pos, key) => advanceCode(pos, key), 0)
    expect(run(SECRET_CODE)).toBe(SECRET_CODE.length)
    expect(run(['ArrowUp', ...SECRET_CODE])).toBe(SECRET_CODE.length)
    expect(run(['x', ...SECRET_CODE.slice(0, 8), 'B', 'A'])).toBe(SECRET_CODE.length)
    expect(run([...SECRET_CODE.slice(0, 5), 'x'])).toBe(0)
  })
})

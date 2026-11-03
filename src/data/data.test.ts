/**
 * Cohérence des données locales (réelles et de démonstration) avec le modèle.
 * Ces tests protègent aussi deux règles du projet :
 * - aucune donnée réelle n'est marquée « démo », et toute démo l'est ;
 * - aucun prix réel n'est inventé : les offres réelles restent « sur demande »
 *   tant que Karim n'a pas fixé ses tarifs (mettre à jour ce test le jour venu).
 */
import { describe, expect, it } from 'vitest'
import { parseGame, parseOffer, parseProject } from '../content/validation'
import { demoGames } from './demo/games'
import { demoOffers } from './demo/offers'
import { demoProjects } from './demo/projects'
import { games } from './games'
import { offers } from './offers'
import { projects } from './projects'

const unique = (ids: string[]) => new Set(ids).size === ids.length

describe('données réelles', () => {
  it('tous les documents respectent le modèle', () => {
    for (const p of projects) expect(parseProject(p)).toMatchObject({ ok: true })
    for (const o of offers) expect(parseOffer(o)).toMatchObject({ ok: true })
    for (const g of games) expect(parseGame(g)).toMatchObject({ ok: true })
  })

  it('aucun contenu réel n’est marqué comme démonstration', () => {
    expect([...projects, ...offers, ...games].some((item) => item.isDemo)).toBe(false)
  })

  it('aucun prix réel n’est inventé', () => {
    expect(offers.every((o) => o.price === null)).toBe(true)
  })

  it('les trois offres annoncées sont présentes', () => {
    expect(offers.map((o) => o.id)).toEqual(['website', 'software', 'promotion'])
  })
})

describe('données de démonstration', () => {
  it('tous les documents respectent le modèle', () => {
    for (const p of demoProjects) expect(parseProject(p)).toMatchObject({ ok: true })
    for (const o of demoOffers) expect(parseOffer(o)).toMatchObject({ ok: true })
    for (const g of demoGames) expect(parseGame(g)).toMatchObject({ ok: true })
  })

  it('chaque élément est explicitement marqué comme démonstration', () => {
    expect([...demoProjects, ...demoOffers, ...demoGames].every((item) => item.isDemo === true)).toBe(true)
  })

  it('les liens de démonstration pointent vers example.com', () => {
    const urls = [...demoProjects.map((p) => p.externalUrl), ...demoGames.map((g) => g.link.url)].filter(Boolean)
    expect(urls.every((url) => url?.startsWith('https://example.com'))).toBe(true)
  })

  it('les démos couvrent les quatre catégories, un brouillon et les cas de prix', () => {
    const categories = new Set(demoProjects.filter((p) => p.publication === 'published').map((p) => p.category))
    expect(categories.size).toBe(4)
    expect(demoProjects.some((p) => p.publication === 'draft')).toBe(true)
    expect(demoGames.map((g) => (g.pricing.type === 'paid' ? (g.pricing.price ? 'prix' : 'payant') : 'gratuit'))).toEqual([
      'gratuit',
      'prix',
      'payant',
    ])
    expect(demoOffers.some((o) => o.availability === 'unavailable')).toBe(true)
  })
})

describe('identifiants', () => {
  it('sont uniques dans chaque collection, réel et démo confondus', () => {
    expect(unique([...projects, ...demoProjects].map((p) => p.id))).toBe(true)
    expect(unique([...offers, ...demoOffers].map((o) => o.id))).toBe(true)
    expect(unique([...games, ...demoGames].map((g) => g.id))).toBe(true)
  })
})

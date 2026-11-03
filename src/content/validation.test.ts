import { describe, expect, it } from 'vitest'
import { parseGame, parseList, parseOffer, parseProject, parseVideo, safeExternalUrl, safeImageSrc, toIsoDate } from './validation'

const validProject = {
  id: 'mon-projet',
  title: { fr: 'Mon projet', en: 'My project' },
  description: 'Description.',
  category: 'website',
  createdAt: '2026-10-22',
  publication: 'published',
}

const validOffer = {
  id: 'offre',
  title: 'Offre',
  description: 'Description.',
  price: null,
  currency: 'EUR',
  availability: 'available',
  contactSubject: 'website',
  createdAt: '2026-10-22',
  publication: 'published',
}

const validGame = {
  id: 'jeu',
  title: 'Jeu',
  description: 'Description.',
  cover: { src: 'images/games/jeu.webp', alt: 'Couverture' },
  pricing: { type: 'free' },
  link: { url: 'https://example.com/jeu', kind: 'download' },
  createdAt: '2026-10-22',
  publication: 'published',
}

describe('liens et images', () => {
  it('accepte uniquement les URL http(s)', () => {
    expect(safeExternalUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(safeExternalUrl('http://example.com')).toBe('http://example.com/')
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('data:text/html,<script>')).toBeNull()
    expect(safeExternalUrl('ftp://example.com')).toBeNull()
    expect(safeExternalUrl('pas une url')).toBeNull()
  })

  it('accepte les chemins relatifs d’image et les URL https', () => {
    expect(safeImageSrc('images/projects/a.webp')).toBe('images/projects/a.webp')
    expect(safeImageSrc('/images/a.png')).toBe('images/a.png')
    expect(safeImageSrc('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg')
  })

  it('refuse les chemins dangereux ou non-images', () => {
    expect(safeImageSrc('../secret.webp')).toBeNull()
    expect(safeImageSrc('images/../../x.png')).toBeNull()
    expect(safeImageSrc('//evil.example.com/a.png')).toBeNull()
    expect(safeImageSrc('http://example.com/a.png')).toBeNull()
    expect(safeImageSrc('images/script.js')).toBeNull()
  })
})

describe('dates', () => {
  it('convertit chaîne ISO, Date et Timestamp Firestore', () => {
    expect(toIsoDate('2026-10-22')).toBe('2026-10-22T00:00:00.000Z')
    expect(toIsoDate(new Date('2026-01-02T03:04:05Z'))).toBe('2026-01-02T03:04:05.000Z')
    expect(toIsoDate({ toDate: () => new Date('2026-05-01T00:00:00Z') })).toBe('2026-05-01T00:00:00.000Z')
    expect(toIsoDate({ seconds: 0, nanoseconds: 0 })).toBe('1970-01-01T00:00:00.000Z')
  })

  it('refuse une date invalide', () => {
    expect(toIsoDate('hier')).toBeNull()
    expect(toIsoDate('2026-13-45')).toBeNull()
    expect(toIsoDate(42)).toBeNull()
  })
})

describe('parseProject', () => {
  it('accepte un projet valide et normalise la date', () => {
    const result = parseProject(validProject)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.createdAt).toBe('2026-10-22T00:00:00.000Z')
      expect(result.value.cover).toBeUndefined()
    }
  })

  it('accepte couverture, texte alternatif et lien externe', () => {
    const result = parseProject({
      ...validProject,
      cover: { src: 'images/projects/x.webp', alt: { fr: 'Capture', en: 'Screenshot' } },
      externalUrl: 'https://example.com',
    })
    expect(result).toMatchObject({ ok: true, value: { cover: { src: 'images/projects/x.webp' }, externalUrl: 'https://example.com/' } })
  })

  it('refuse une catégorie inconnue, un titre manquant, un id mal formé', () => {
    expect(parseProject({ ...validProject, category: 'blockchain' }).ok).toBe(false)
    expect(parseProject({ ...validProject, title: '' }).ok).toBe(false)
    expect(parseProject({ ...validProject, id: 'Mon Projet' }).ok).toBe(false)
  })

  it('refuse un lien externe javascript:', () => {
    const result = parseProject({ ...validProject, externalUrl: 'javascript:alert(1)' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join()).toContain('externalUrl')
  })

  it('exige un texte alternatif quand une couverture est fournie', () => {
    expect(parseProject({ ...validProject, cover: { src: 'images/a.webp' } }).ok).toBe(false)
  })

  it('refuse une traduction incomplète', () => {
    expect(parseProject({ ...validProject, title: { fr: 'Titre' } }).ok).toBe(false)
  })

  it('refuse un statut de publication inconnu', () => {
    expect(parseProject({ ...validProject, publication: 'public' }).ok).toBe(false)
  })
})

describe('parseOffer', () => {
  it('accepte une offre sans prix (prix sur demande)', () => {
    expect(parseOffer(validOffer)).toMatchObject({ ok: true, value: { price: null, currency: 'EUR' } })
  })

  it('accepte un prix positif et refuse un prix négatif ou non numérique', () => {
    expect(parseOffer({ ...validOffer, price: 490 }).ok).toBe(true)
    expect(parseOffer({ ...validOffer, price: -5 }).ok).toBe(false)
    expect(parseOffer({ ...validOffer, price: '490' }).ok).toBe(false)
  })

  it('refuse une devise ou une disponibilité inconnue', () => {
    expect(parseOffer({ ...validOffer, currency: 'BTC' }).ok).toBe(false)
    expect(parseOffer({ ...validOffer, availability: 'soon' }).ok).toBe(false)
  })
})

describe('parseGame', () => {
  it('accepte un jeu gratuit', () => {
    expect(parseGame(validGame).ok).toBe(true)
  })

  it('accepte un jeu payant avec ou sans prix', () => {
    expect(parseGame({ ...validGame, pricing: { type: 'paid' } })).toMatchObject({ ok: true, value: { pricing: { type: 'paid' } } })
    expect(parseGame({ ...validGame, pricing: { type: 'paid', price: { amount: 4.99, currency: 'EUR' } } })).toMatchObject({
      ok: true,
      value: { pricing: { type: 'paid', price: { amount: 4.99, currency: 'EUR' } } },
    })
  })

  it('refuse une couverture absente, un lien non http(s) ou un type de prix inconnu', () => {
    const withoutCover: Record<string, unknown> = { ...validGame }
    delete withoutCover.cover
    expect(parseGame(withoutCover).ok).toBe(false)
    expect(parseGame({ ...validGame, link: { url: 'javascript:void(0)', kind: 'store' } }).ok).toBe(false)
    expect(parseGame({ ...validGame, pricing: { type: 'gratuit' } }).ok).toBe(false)
  })
})

describe('parseVideo', () => {
  it('exige un identifiant YouTube de 11 caractères', () => {
    expect(parseVideo({ youtubeId: 'abcdefghijk', title: 'Vidéo', publishedAt: '2026-10-01' }).ok).toBe(true)
    expect(parseVideo({ youtubeId: 'trop-court', title: 'Vidéo', publishedAt: '2026-10-01' }).ok).toBe(false)
  })
})

describe('parseList', () => {
  it('écarte les documents invalides et les identifiants en double', () => {
    const list = parseList(
      [validProject, { ...validProject, category: 'inconnue' }, { ...validProject }, { ...validProject, id: 'autre' }],
      parseProject,
      'projet',
      (p) => p.id,
    )
    expect(list.map((p) => p.id)).toEqual(['mon-projet', 'autre'])
  })
})

import { describe, expect, it } from 'vitest'
import { offers } from '../data/offers'
import { projects } from '../data/projects'
import { demoGames, demoOffers } from '../data/demo'
import type { RawDoc } from './adminStore'
import {
  deleteContentEntry,
  importLocalContent,
  removeImageIfUnused,
  saveContentEntry,
  type ContentCollection,
  type ContentDeps,
} from './contentActions'
import { SERVER_TIMESTAMP, prepareContentWrite } from './contentAdmin'
import {
  emptyGameForm,
  emptyOfferForm,
  emptyProjectForm,
  fromTranslatable,
  gameFormFromDoc,
  gameInput,
  offerFormFromDoc,
  offerInput,
  parseAmount,
  projectFormFromDoc,
  projectInput,
  slugify,
  toTranslatable,
  validateGameForm,
  validateOfferForm,
  validateProjectForm,
} from './forms'
import { referencedImages, storagePathFromUrl } from './images'

const BUCKET = 'krimossimo-1111.firebasestorage.app'
const url = (path: string, bucket = BUCKET) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=abc`

describe('formulaires : champs communs', () => {
  it('textes bilingues : anglais facultatif', () => {
    expect(toTranslatable({ fr: ' Titre ', en: '' })).toBe('Titre')
    expect(toTranslatable({ fr: 'Titre', en: 'Title' })).toEqual({ fr: 'Titre', en: 'Title' })
    expect(fromTranslatable('Nom propre')).toEqual({ fr: 'Nom propre', en: '' })
    expect(fromTranslatable({ fr: 'A', en: 'B' })).toEqual({ fr: 'A', en: 'B' })
  })

  it('identifiant d’URL et montants', () => {
    expect(slugify('Création d’un site — Été 2026 !')).toBe('creation-d-un-site-ete-2026')
    expect(parseAmount('39,90')).toBe(39.9)
    expect(parseAmount(' 149 ')).toBe(149)
    for (const bad of ['', 'abc', '-5', '1.234', '10000000', '1e3']) expect(parseAmount(bad)).toBeNull()
  })
})

describe('formulaire projet', () => {
  const valid = { ...emptyProjectForm(), id: 'site-vitrine', title: { fr: 'Site vitrine', en: '' }, description: { fr: 'Description.', en: '' } }

  it('champs obligatoires, lien et texte alternatif', () => {
    expect(Object.keys(validateProjectForm(emptyProjectForm())).sort()).toEqual(['description.fr', 'id', 'title.fr'])
    expect(validateProjectForm(valid)).toEqual({})
    expect(validateProjectForm({ ...valid, externalUrl: 'javascript:alert(1)' })).toEqual({ externalUrl: { code: 'url' } })
    expect(validateProjectForm({ ...valid, id: 'Mauvais ID' })).toEqual({ id: { code: 'slug' } })
    // Une image sans texte alternatif est refusée (accessibilité).
    expect(validateProjectForm(valid, { hasNewFile: true })).toEqual({ 'alt.fr': { code: 'required' } })
  })

  it('aller-retour document ↔ formulaire sans perte (résumé et ordre conservés)', () => {
    const stored = prepareContentWrite('projects', projects[0], 'u')
    expect(stored.ok).toBe(true)
    if (!stored.ok) return
    const data = { ...stored.data, summary: 'Résumé', order: 2 }
    const form = projectFormFromDoc(stored.id, data)
    const again = prepareContentWrite('projects', projectInput(form, form.image.src), 'u')
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.data.summary).toBe('Résumé')
    expect(again.data.order).toBe(2)
    expect(again.data.title).toEqual(stored.data.title)
    expect(again.data.cover).toEqual(stored.data.cover)
  })

  it('document produit : image, lien, technologies', () => {
    const input = projectInput(
      { ...valid, image: { src: '', alt: { fr: 'Capture', en: 'Screenshot' } }, externalUrl: 'https://exemple.fr', stack: 'React, Firebase, ', featured: true },
      url('public/images/projects/a.webp'),
    )
    const prepared = prepareContentWrite('projects', input, 'admin')
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(prepared.data).toMatchObject({
      cover: { src: url('public/images/projects/a.webp'), alt: { fr: 'Capture', en: 'Screenshot' } },
      externalUrl: 'https://exemple.fr/',
      stack: ['React', 'Firebase'],
      featured: true,
      updatedBy: 'admin',
      updatedAt: SERVER_TIMESTAMP,
    })
  })
})

describe('formulaire offre', () => {
  const base = { ...emptyOfferForm(), id: 'offre', title: { fr: 'Offre', en: '' }, description: { fr: 'Description', en: '' } }

  it('prix selon le mode, quantité, disponibilité', () => {
    expect(validateOfferForm(base)).toEqual({})
    expect(validateOfferForm({ ...base, priceMode: 'fixed' })).toEqual({ price: { code: 'required' } })
    expect(validateOfferForm({ ...base, priceMode: 'fixed', price: '0' })).toEqual({ price: { code: 'price' } })
    expect(validateOfferForm({ ...base, maxQuantity: '30' })).toEqual({ maxQuantity: { code: 'quantity' } })
    const out = prepareContentWrite('offers', offerInput({ ...base, priceMode: 'fixed', price: '149,90', availability: 'out_of_stock' }), 'u')
    expect(out.ok && out.data).toMatchObject({ price: 149.9, availability: 'out_of_stock' })
    const quote = prepareContentWrite('offers', offerInput(base), 'u')
    expect(quote.ok && quote.data.price).toBeNull()
    const from = prepareContentWrite('offers', offerInput({ ...base, priceMode: 'from', price: '290' }), 'u')
    expect(from.ok && from.data).toMatchObject({ price: 290, priceFrom: true })
  })

  it('les offres existantes se rechargent à l’identique', () => {
    for (const offer of [...offers, ...demoOffers]) {
      const stored = prepareContentWrite('offers', offer, 'u')
      if (!stored.ok) throw new Error(offer.id)
      const again = prepareContentWrite('offers', offerInput(offerFormFromDoc(stored.id, stored.data)), 'u')
      expect(again.ok && again.data).toEqual(stored.data)
    }
  })
})

describe('formulaire jeu', () => {
  it('couverture obligatoire, prix facultatif, lien http(s)', () => {
    const base = { ...emptyGameForm(), id: 'jeu', title: { fr: 'Jeu', en: '' }, description: { fr: 'Description', en: '' }, linkUrl: 'https://store.example.com' }
    expect(validateGameForm(base)).toEqual({ image: { code: 'imageRequired' } })
    expect(validateGameForm({ ...base, linkUrl: 'ftp://x' }, { hasNewFile: true })).toMatchObject({ linkUrl: { code: 'url' } })
    const paid = gameInput({ ...base, pricing: 'paid', priceAmount: '9,99', image: { src: '', alt: { fr: 'Couverture', en: '' } } }, url('public/images/games/c.webp'))
    const prepared = prepareContentWrite('games', paid, 'u')
    expect(prepared.ok && prepared.data.pricing).toEqual({ type: 'paid', price: { amount: 9.99, currency: 'EUR' } })
    for (const game of demoGames) {
      const stored = prepareContentWrite('games', game, 'u')
      if (!stored.ok) throw new Error(game.id)
      const again = prepareContentWrite('games', gameInput(gameFormFromDoc(stored.id, stored.data), (stored.data.cover as { src: string }).src), 'u')
      expect(again.ok && again.data).toEqual(stored.data)
    }
  })
})

describe('images Storage', () => {
  it('ne reconnaît que les fichiers de public/images/ du bon espace', () => {
    expect(storagePathFromUrl(url('public/images/projects/20261025-a.webp'), BUCKET)).toBe('public/images/projects/20261025-a.webp')
    expect(storagePathFromUrl(url('public/images/projects/a.webp', 'autre-projet.appspot.com'), BUCKET)).toBeNull()
    expect(storagePathFromUrl(url('prive/facture.pdf'), BUCKET)).toBeNull()
    expect(storagePathFromUrl(url('public/images/../x.webp'), BUCKET)).toBeNull()
    expect(storagePathFromUrl('images/projects/krimossimo-web.webp', BUCKET)).toBeNull()
    expect(storagePathFromUrl('https://example.com/v0/b/x/o/public%2Fimages%2Fprojects%2Fa.webp', BUCKET)).toBeNull()
  })

  it('références : couvertures des documents', () => {
    const refs = referencedImages([{ data: { cover: { src: url('public/images/games/a.webp') } } }, { data: { cover: { src: 'images/x.webp' } } }, { data: {} }])
    expect([...refs]).toEqual(['public/images/games/a.webp'])
  })
})

/* ------------------------------------------------- Opérations (accès simulés) */

function fakeDeps(options: { failUpload?: boolean; failSave?: boolean } = {}) {
  const db: Record<ContentCollection, Map<string, Record<string, unknown>>> = { projects: new Map(), offers: new Map(), games: new Map() }
  const files = new Set<string>()
  const log: string[] = []
  let n = 0
  const deps: ContentDeps = {
    uid: 'admin-1',
    async getDoc(c, id) {
      const data = db[c].get(id)
      return data ? { id, data } : null
    },
    async listDocs(c) {
      return [...db[c]].map(([id, data]): RawDoc => ({ id, data }))
    },
    async save(c, id, data) {
      if (options.failSave) throw Object.assign(new Error('denied'), { code: 'permission-denied' })
      db[c].set(id, data)
      log.push(`save ${c}/${id}`)
    },
    async remove(c, id) {
      db[c].delete(id)
      log.push(`remove ${c}/${id}`)
    },
    async upload(file, folder) {
      if (options.failUpload) throw Object.assign(new Error('x'), { code: 'storage/unauthorized' })
      const path = `public/images/${folder}/f${++n}-${file.name}`
      files.add(path)
      log.push(`upload ${path}`)
      return { path, url: url(path) }
    },
    async deleteFile(path) {
      if (!files.delete(path)) throw Object.assign(new Error('absent'), { code: 'storage/object-not-found' })
      log.push(`delete ${path}`)
    },
  }
  return { deps, db, files, log }
}

const file = (name: string) => ({ name, type: 'image/webp', size: 100 }) as unknown as File
const form = { ...emptyProjectForm(), id: 'projet', title: { fr: 'Projet', en: '' }, description: { fr: 'Description', en: '' }, image: { src: '', alt: { fr: 'Image', en: '' } } }
const request = (overrides: Partial<Parameters<typeof saveContentEntry>[1]> = {}) => ({
  collection: 'projects' as const,
  id: 'projet',
  isNew: true,
  build: (src: string) => projectInput(form, src),
  previousSrc: '',
  keepSrc: '',
  file: null,
  folder: 'projects' as const,
  ...overrides,
})

describe('enregistrement avec image', () => {
  it('création : image envoyée puis document enregistré avec son adresse', async () => {
    const { deps, db, log } = fakeDeps()
    const result = await saveContentEntry(deps, request({ file: file('a.webp') }))
    expect(result).toMatchObject({ ok: true, id: 'projet', cleanup: null })
    expect(log).toEqual(['upload public/images/projects/f1-a.webp', 'save projects/projet'])
    expect((db.projects.get('projet')!.cover as { src: string }).src).toContain('f1-a.webp')
  })

  it('identifiant déjà pris : rien n’est envoyé ni écrasé', async () => {
    const { deps, db, log } = fakeDeps()
    db.projects.set('projet', { title: 'Existant' })
    expect(await saveContentEntry(deps, request({ file: file('a.webp') }))).toEqual({ ok: false, reason: 'slug-taken' })
    expect(log).toEqual([])
    expect(db.projects.get('projet')).toEqual({ title: 'Existant' })
  })

  it('remplacement : l’ancienne image est supprimée APRÈS l’enregistrement', async () => {
    const { deps, files, log } = fakeDeps()
    await saveContentEntry(deps, request({ file: file('a.webp') }))
    const first = url('public/images/projects/f1-a.webp')
    const result = await saveContentEntry(deps, request({ isNew: false, previousSrc: first, keepSrc: first, file: file('b.webp') }))
    expect(result).toMatchObject({ ok: true, id: 'projet', cleanup: 'deleted', imageSrc: url('public/images/projects/f2-b.webp') })
    expect(log.slice(2)).toEqual(['upload public/images/projects/f2-b.webp', 'save projects/projet', 'delete public/images/projects/f1-a.webp'])
    expect([...files]).toEqual(['public/images/projects/f2-b.webp'])
  })

  it('image encore utilisée par un autre contenu : conservée', async () => {
    const { deps, db, files } = fakeDeps()
    await saveContentEntry(deps, request({ file: file('a.webp') }))
    const shared = url('public/images/projects/f1-a.webp')
    db.games.set('jeu', { cover: { src: shared, alt: 'x' } })
    const result = await saveContentEntry(deps, request({ isNew: false, previousSrc: shared, keepSrc: '' }))
    expect(result).toMatchObject({ ok: true, id: 'projet', cleanup: 'in-use', imageSrc: '' })
    expect(files.has('public/images/projects/f1-a.webp')).toBe(true)
  })

  it('image du site (public/) ou externe : jamais supprimée', async () => {
    const { deps } = fakeDeps()
    expect(await removeImageIfUnused(deps, 'images/projects/krimossimo-web.webp')).toBe('not-managed')
    expect(await removeImageIfUnused(deps, 'https://example.com/a.webp')).toBe('not-managed')
  })

  it('échec de l’enregistrement : la nouvelle image (inutilisée) est retirée, l’ancienne gardée', async () => {
    const { deps, files } = fakeDeps({ failSave: true })
    files.add('public/images/projects/ancienne.webp')
    const result = await saveContentEntry(
      deps,
      request({ isNew: false, previousSrc: url('public/images/projects/ancienne.webp'), file: file('n.webp') }),
    )
    expect(result).toEqual({ ok: false, reason: 'save', code: 'permission-denied' })
    expect([...files]).toEqual(['public/images/projects/ancienne.webp'])
  })

  it('échec de l’envoi : aucun document modifié', async () => {
    const { deps, db } = fakeDeps({ failUpload: true })
    expect(await saveContentEntry(deps, request({ file: file('a.webp') }))).toEqual({ ok: false, reason: 'upload', code: 'permission-denied' })
    expect(db.projects.size).toBe(0)
  })

  it('document invalide : refus et nettoyage de l’envoi', async () => {
    const { deps, files } = fakeDeps()
    const result = await saveContentEntry(deps, request({ file: file('a.webp'), build: (src) => ({ ...projectInput(form, src), externalUrl: 'javascript:x' }) }))
    expect(result.ok).toBe(false)
    expect(files.size).toBe(0)
  })

  it('suppression : document puis image inutilisée', async () => {
    const { deps, db, files } = fakeDeps()
    await saveContentEntry(deps, request({ file: file('a.webp') }))
    const src = (db.projects.get('projet')!.cover as { src: string }).src
    expect(await deleteContentEntry(deps, 'projects', 'projet', src)).toEqual({ ok: true, cleanup: 'deleted' })
    expect(db.projects.size).toBe(0)
    expect(files.size).toBe(0)
  })
})

describe('import du contenu local', () => {
  it('copie le contenu réel absent, ignore la démonstration, ne remplace rien', async () => {
    const { deps, db } = fakeDeps()
    db.offers.set(offers[0].id, { title: 'Déjà modifiée dans Firestore' })
    const report = await importLocalContent(deps, [
      ...projects.map((item) => ({ collection: 'projects' as const, item })),
      ...offers.map((item) => ({ collection: 'offers' as const, item })),
      ...demoOffers.map((item) => ({ collection: 'offers' as const, item })),
    ])
    expect(report.imported).toEqual([...projects.map((p) => `projects/${p.id}`), ...offers.slice(1).map((o) => `offers/${o.id}`)])
    expect(report.skipped).toEqual([`offers/${offers[0].id}`])
    expect(report.failed).toEqual([])
    expect(db.offers.get(offers[0].id)).toEqual({ title: 'Déjà modifiée dans Firestore' })
    expect([...db.offers.keys()].some((id) => id.startsWith('demo-'))).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { createFirestoreRepository, type DocumentStore, type StoredDocument } from './firestoreRepository'
import { ContentLoadError } from './repository'

/** Faux Firestore en mémoire : applique le même filtre que la vraie requête. */
function fakeStore(collections: Record<string, StoredDocument[]>, options: { fail?: boolean; hang?: boolean } = {}): DocumentStore {
  const guard = async () => {
    if (options.hang) await new Promise(() => {})
    if (options.fail) throw new Error('unavailable: client is offline')
  }
  return {
    async listPublished(name) {
      await guard()
      return (collections[name] ?? []).filter((d) => d.data.publication === 'published')
    },
    async get(name, id) {
      await guard()
      const doc = (collections[name] ?? []).find((d) => d.id === id)
      // Comme les règles : un brouillon n'est pas lisible.
      return doc && doc.data.publication === 'published' ? doc : null
    },
    async listRecent(name) {
      await guard()
      return collections[name] ?? []
    },
  }
}

const timestamp = (iso: string) => ({ toDate: () => new Date(iso) })

const projectDoc = (id: string, data: Record<string, unknown> = {}): StoredDocument => ({
  id,
  data: {
    title: { fr: 'Titre', en: 'Title' },
    description: 'Description',
    category: 'software',
    createdAt: timestamp('2026-03-01T10:00:00Z'),
    publication: 'published',
    ...data,
  },
})

describe('source Firestore', () => {
  it('convertit les documents (id, Timestamp) et ignore les brouillons', async () => {
    const repo = createFirestoreRepository(
      fakeStore({ projects: [projectDoc('a'), projectDoc('b', { publication: 'draft' })] }),
    )
    const list = await repo.listProjects()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'a', category: 'software', createdAt: '2026-03-01T10:00:00.000Z' })
  })

  it('l’identifiant du document fait foi', async () => {
    const repo = createFirestoreRepository(fakeStore({ projects: [projectDoc('vrai-id', { id: 'faux-id' })] }))
    expect((await repo.listProjects())[0].id).toBe('vrai-id')
  })

  it('écarte un document mal formé ou dangereux', async () => {
    const repo = createFirestoreRepository(
      fakeStore({ projects: [projectDoc('ok'), projectDoc('xss', { externalUrl: 'javascript:alert(1)' })] }),
    )
    expect((await repo.listProjects()).map((p) => p.id)).toEqual(['ok'])
  })

  it('getProject : null pour un brouillon, un inconnu ou un id invalide', async () => {
    const repo = createFirestoreRepository(fakeStore({ projects: [projectDoc('a'), projectDoc('b', { publication: 'draft' })] }))
    expect((await repo.getProject('a'))?.id).toBe('a')
    expect(await repo.getProject('b')).toBeNull()
    expect(await repo.getProject('zzz')).toBeNull()
    expect(await repo.getProject('../admin')).toBeNull()
  })

  it('erreur réseau → ContentLoadError', async () => {
    const repo = createFirestoreRepository(fakeStore({}, { fail: true }))
    await expect(repo.listProjects()).rejects.toThrow(ContentLoadError)
  })

  it('délai dépassé → ContentLoadError (pas d’attente infinie)', async () => {
    const repo = createFirestoreRepository(fakeStore({}, { hang: true }), { timeoutMs: 20 })
    await expect(repo.listGames()).rejects.toThrow(ContentLoadError)
  })

  it('collection vide → liste vide', async () => {
    const repo = createFirestoreRepository(fakeStore({}))
    expect(await repo.listOffers()).toEqual([])
  })

  it('vidéos : identifiant de document utilisé comme youtubeId, plus récentes d’abord', async () => {
    const repo = createFirestoreRepository(
      fakeStore({
        videos: [
          { id: 'AAAAAAAAAAA', data: { title: 'Ancienne', publishedAt: '2026-01-01' } },
          { id: 'BBBBBBBBBBB', data: { title: 'Récente', publishedAt: '2026-09-01' } },
        ],
      }),
    )
    expect((await repo.listVideos()).map((v) => v.youtubeId)).toEqual(['BBBBBBBBBBB', 'AAAAAAAAAAA'])
  })
})

/**
 * Adaptateur Firestore réel. Le SDK n'est téléchargé qu'au premier appel,
 * et seulement si Firebase est configuré (voir src/content/index.ts).
 */
import { getDb } from '../lib/firebase'
import type { DocumentStore, StoredDocument } from './firestoreRepository'

const firestore = () => import('firebase/firestore')

function isPermissionDenied(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'permission-denied'
}

export function createFirebaseDocumentStore(): DocumentStore {
  return {
    async listPublished(name) {
      const [db, { collection, getDocs, query, where }] = await Promise.all([getDb(), firestore()])
      const snapshot = await getDocs(query(collection(db, name), where('publication', '==', 'published')))
      return snapshot.docs.map((d): StoredDocument => ({ id: d.id, data: d.data() }))
    },

    async get(name, id) {
      const [db, { doc, getDoc }] = await Promise.all([getDb(), firestore()])
      try {
        const snapshot = await getDoc(doc(db, name, id))
        return snapshot.exists() ? { id: snapshot.id, data: snapshot.data() } : null
      } catch (error) {
        // Les règles refusent la lecture d'un brouillon : on le traite comme introuvable.
        if (isPermissionDenied(error)) return null
        throw error
      }
    },

    async listRecent(name, field, max) {
      const [db, { collection, getDocs, limit, orderBy, query }] = await Promise.all([getDb(), firestore()])
      const snapshot = await getDocs(query(collection(db, name), orderBy(field, 'desc'), limit(max)))
      return snapshot.docs.map((d): StoredDocument => ({ id: d.id, data: d.data() }))
    },
  }
}

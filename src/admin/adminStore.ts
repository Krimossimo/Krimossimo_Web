/**
 * Accès Firestore de l'administration (SDK chargé à la demande).
 *
 * Toutes ces opérations sont soumises à firestore.rules : elles n'aboutissent que pour
 * un compte portant le claim { admin: true }, et les écritures de contenu ne passent que
 * si le document respecte le schéma. Les commandes et messages sont en lecture seule ici ;
 * leurs modifications passent par les Cloud Functions (adminApi.ts).
 */
import { getDb } from '../lib/firebase'
import { SERVER_TIMESTAMP, type ManagedCollection, type Payload } from './contentAdmin'

const firestore = () => import('firebase/firestore')

export type RawDoc = { id: string; data: Payload }

async function withServerTime(data: Payload): Promise<Payload> {
  const { serverTimestamp } = await firestore()
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === SERVER_TIMESTAMP ? serverTimestamp() : v]))
}

export async function listCollection(name: ManagedCollection): Promise<RawDoc[]> {
  const [db, { collection, getDocs }] = await Promise.all([getDb(), firestore()])
  const snapshot = await getDocs(collection(db, name))
  return snapshot.docs.map((d) => ({ id: d.id, data: d.data() }))
}

export async function listLatest(name: 'orders' | 'contactMessages' | 'orderRequests', max = 50): Promise<RawDoc[]> {
  const [db, { collection, getDocs, limit, orderBy, query }] = await Promise.all([getDb(), firestore()])
  const snapshot = await getDocs(query(collection(db, name), orderBy('createdAt', 'desc'), limit(max)))
  return snapshot.docs.map((d) => ({ id: d.id, data: d.data() }))
}

/** Un document (brouillons compris : lecture réservée à l'administrateur par les règles), ou null. */
export async function getContent(name: ManagedCollection, id: string): Promise<RawDoc | null> {
  const [db, { doc, getDoc }] = await Promise.all([getDb(), firestore()])
  const snapshot = await getDoc(doc(db, name, id))
  return snapshot.exists() ? { id: snapshot.id, data: snapshot.data() } : null
}

/** Crée ou remplace un document de contenu (données préparées par prepareContentWrite). */
export async function saveContent(name: ManagedCollection, id: string, data: Payload): Promise<void> {
  const [db, { doc, setDoc }] = await Promise.all([getDb(), firestore()])
  await setDoc(doc(db, name, id), await withServerTime(data))
}

export async function updateContent(name: ManagedCollection, id: string, data: Payload): Promise<void> {
  const [db, { doc, updateDoc }] = await Promise.all([getDb(), firestore()])
  await updateDoc(doc(db, name, id), await withServerTime(data))
}

export async function deleteContent(name: ManagedCollection, id: string): Promise<void> {
  const [db, { doc, deleteDoc }] = await Promise.all([getDb(), firestore()])
  await deleteDoc(doc(db, name, id))
}

/**
 * Suivi d'une commande sans paiement en ligne (orderRequests) : seuls le statut et la note
 * changent, avec l'auteur et l'horodatage serveur exigés par firestore.rules.
 */
export async function updateOrderRequestTracking(id: string, status: string, note: string, uid: string): Promise<void> {
  const [db, { doc, updateDoc, serverTimestamp, deleteField }] = await Promise.all([getDb(), firestore()])
  await updateDoc(doc(db, 'orderRequests', id), {
    status,
    note: note ? note : deleteField(),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  })
}

/** Code d'erreur Firestore lisible (permission refusée, réseau...). */
export function firestoreErrorCode(error: unknown): 'permission-denied' | 'unavailable' | 'not-found' | 'unknown' {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  if (code === 'permission-denied' || code === 'unavailable' || code === 'not-found') return code
  return 'unknown'
}

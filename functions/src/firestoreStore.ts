/**
 * Stockage Firestore du service de paiement (OrderStore).
 *  - orders/{orderId}           commandes (jamais lisibles ni modifiables depuis le navigateur) ;
 *  - rateLimits/{clé}           compteurs de débit (clé = empreinte de l'IP, sans IP en clair) ;
 *  - paypalWebhookEvents/{id}   événements webhook déjà traités (dédoublonnage).
 * Toutes les modifications de commande passent par une transaction.
 */
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { rateLimitExpiry, rateLimitKey } from './contact.js'
import type { ContactStore } from './contactService.js'
import type { OrderRecord, OrderStore, Patch } from './payments.js'

/** Firestore refuse `undefined` : ces champs sont simplement omis. Les Date deviennent des Timestamp. */
function toFirestore(value: unknown): unknown {
  if (value instanceof Date) return Timestamp.fromDate(value)
  if (Array.isArray(value)) return value.map(toFirestore)
  if (value && typeof value === 'object' && !(value instanceof Timestamp)) {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toFirestore(v)]))
  }
  return value
}

function fromFirestore(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate()
  if (Array.isArray(value)) return value.map(fromFirestore)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromFirestore(v)]))
  return value
}

/** Valeurs par défaut pour un document incomplet (créé par une version antérieure). */
function normalize(data: Record<string, unknown>): OrderRecord {
  const d = fromFirestore(data) as Partial<OrderRecord>
  const created = d.createdAt instanceof Date ? d.createdAt : new Date(0)
  return {
    ...(d as OrderRecord),
    paymentEnv: d.paymentEnv === 'live' ? 'live' : 'sandbox',
    createdAt: created,
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt : created,
    history: Array.isArray(d.history) ? d.history : [],
    paypalOrderId: typeof d.paypalOrderId === 'string' ? d.paypalOrderId : null,
    paypalOrderIds: Array.isArray(d.paypalOrderIds) ? d.paypalOrderIds : typeof d.paypalOrderId === 'string' ? [d.paypalOrderId] : [],
    paypalAttempts: typeof d.paypalAttempts === 'number' ? d.paypalAttempts : 0,
    captureAttempts: typeof d.captureAttempts === 'number' ? d.captureAttempts : 0,
  }
}

export function firestoreOrderStore(db: Firestore, salt: string): OrderStore {
  const orders = db.collection('orders')
  return {
    async readOffers(ids) {
      const snaps = await db.getAll(...ids.map((id) => db.collection('offers').doc(id)))
      return new Map(snaps.map((snap) => [snap.id, snap.data()]))
    },

    async createOrder(record) {
      const ref = orders.doc()
      await ref.set(toFirestore(record) as Record<string, unknown>)
      return ref.id
    },

    async getOrder(orderId) {
      const snap = await orders.doc(orderId).get()
      const data = snap.data()
      return data ? normalize(data) : null
    },

    async updateOrder(orderId, fn) {
      const ref = orders.doc(orderId)
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        const data = snap.data()
        if (!data) return null
        const { patch, result } = fn(normalize(data))
        if (patch && Object.keys(patch).length > 0) tx.update(ref, toFirestore(patch as Patch) as Record<string, unknown>)
        return result
      })
    },

    allow: (scope, clientKey, max, windowMs) => allowRequest(db, salt, scope, clientKey, max, windowMs),

    async hasEvent(eventId) {
      return (await db.collection('paypalWebhookEvents').doc(eventId).get()).exists
    },

    async recordEvent(eventId, info) {
      await db.collection('paypalWebhookEvents').doc(eventId).set(toFirestore(info) as Record<string, unknown>)
    },
  }
}

/** Limite de débit (compteur par empreinte d'IP et par fenêtre, supprimé par TTL). */
async function allowRequest(db: Firestore, salt: string, scope: string, clientKey: string, max: number, windowMs: number): Promise<boolean> {
  const now = Date.now()
  const ref = db.collection('rateLimits').doc(rateLimitKey(clientKey, now, salt, windowMs, scope))
  return db.runTransaction(async (tx) => {
    const count = ((await tx.get(ref)).get('count') as number | undefined) ?? 0
    if (count + 1 > max) return false
    tx.set(ref, { count: count + 1, expiresAt: Timestamp.fromMillis(rateLimitExpiry(now, windowMs)) })
    return true
  })
}

/**
 * Messages du formulaire de contact : contactMessages/{id}, lisibles par les administrateurs
 * uniquement (firestore.rules), avec l'état d'envoi de l'e-mail (pending, sent, failed).
 */
export function firestoreContactStore(db: Firestore, salt: string): ContactStore {
  const messages = db.collection('contactMessages')
  return {
    allow: (clientKey, max, windowMs) => allowRequest(db, salt, 'contact', clientKey, max, windowMs),
    async saveMessage(record) {
      const ref = await messages.add(toFirestore(record) as Record<string, unknown>)
      return ref.id
    },
    async setDelivery(messageId, delivery, at) {
      await messages.doc(messageId).update({ delivery, deliveryAt: Timestamp.fromDate(at) })
    },
  }
}

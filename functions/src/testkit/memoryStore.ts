/**
 * Stockage en mémoire (tests et banc d'essai uniquement, jamais déployé).
 * Même contrat que firestoreStore.ts : lectures copiées, mises à jour atomiques.
 */
import type { OrderRecord, OrderStore } from '../payments.js'

const copy = <T>(v: T): T => structuredClone(v)

export type MemoryStore = OrderStore & {
  offers: Map<string, Record<string, unknown>>
  orders: Map<string, OrderRecord>
  events: Map<string, { type: string; orderId: string | null; at: Date }>
}

export function memoryStore(offers: Record<string, Record<string, unknown>> = {}): MemoryStore {
  const orders = new Map<string, OrderRecord>()
  const events = new Map<string, { type: string; orderId: string | null; at: Date }>()
  const limits = new Map<string, number>()
  let next = 1
  return {
    offers: new Map(Object.entries(offers)),
    orders,
    events,
    async readOffers(ids) {
      return new Map(ids.map((id) => [id, this.offers.has(id) ? copy(this.offers.get(id)) : undefined]))
    },
    async createOrder(record) {
      const id = `Order${String(next++).padStart(4, '0')}abcdefgh`
      orders.set(id, copy(record))
      return id
    },
    async getOrder(id) {
      const order = orders.get(id)
      return order ? copy(order) : null
    },
    async updateOrder(id, fn) {
      const current = orders.get(id)
      if (!current) return null
      const { patch, result } = fn(copy(current))
      if (patch) orders.set(id, { ...current, ...copy(patch) })
      return result
    },
    async allow(scope, clientKey, max) {
      const key = `${scope}|${clientKey}`
      const count = (limits.get(key) ?? 0) + 1
      if (count > max) return false
      limits.set(key, count)
      return true
    },
    async hasEvent(id) {
      return events.has(id)
    },
    async recordEvent(id, info) {
      events.set(id, info)
    },
  }
}

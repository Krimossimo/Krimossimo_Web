/**
 * Panier : logique pure (sans React), testée isolément.
 *
 * Principes :
 * - Les offres sont des PRESTATIONS : pas de stock. La quantité vaut 1, sauf si
 *   l'offre autorise plusieurs unités (maxQuantity).
 * - Seule une offre publiée, disponible et dotée d'un prix FIXE est achetable en ligne.
 *   Un prix « à partir de » ou absent reste sur devis (formulaire de contact).
 * - Le panier stocké ne contient que des identifiants et des quantités : jamais de prix
 *   (relus dans le catalogue) ni de donnée personnelle. Le total affiché est indicatif :
 *   le serveur recalcule le montant à partir de Firestore au moment de la commande.
 * - Les montants sont calculés en centimes entiers.
 */
import type { Currency, Offer } from '../types/content'

export type CartLine = { offerId: string; quantity: number }
export type CartState = { lines: CartLine[] }

export const CART_STORAGE_KEY = 'krimossimo-cart'
export const CART_MAX_LINES = 20
/** Un panier sans visite depuis 30 jours est oublié. */
export const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const emptyCart: CartState = { lines: [] }

/* ------------------------------------------------------------- Règles d'achat */

export type PurchaseBlock = 'unavailable' | 'out-of-stock' | 'quote-only' | 'unpublished'

/** Pourquoi une offre ne peut pas être ajoutée au panier (null = achetable). */
export function purchaseBlock(offer: Offer): PurchaseBlock | null {
  if (offer.publication !== 'published') return 'unpublished'
  if (offer.availability === 'out_of_stock') return 'out-of-stock'
  if (offer.availability !== 'available') return 'unavailable'
  if (offer.price === null || offer.priceFrom || offer.price <= 0) return 'quote-only'
  return null
}

export function isPurchasable(offer: Offer): boolean {
  return purchaseBlock(offer) === null
}

export function maxQuantityOf(offer: Pick<Offer, 'maxQuantity'>): number {
  const max = offer.maxQuantity ?? 1
  return Number.isInteger(max) && max >= 1 ? Math.min(max, 20) : 1
}

/** Les quantités ne sont proposées que si l'offre autorise plusieurs unités. */
export function hasQuantity(offer: Pick<Offer, 'maxQuantity'>): boolean {
  return maxQuantityOf(offer) > 1
}

/* ------------------------------------------------------------------ Actions */

export type AddResult =
  | { ok: true; state: CartState }
  | { ok: false; reason: PurchaseBlock | 'currency-mismatch' | 'cart-full' | 'max-quantity' }

/**
 * Ajoute une offre. Une prestation déjà présente n'est pas dupliquée :
 * sa quantité augmente seulement si l'offre l'autorise.
 * `catalog` sert à vérifier que le panier reste dans une seule devise.
 */
export function addOffer(state: CartState, offer: Offer, catalog: readonly Offer[]): AddResult {
  const block = purchaseBlock(offer)
  if (block) return { ok: false, reason: block }

  const byId = new Map(catalog.map((o) => [o.id, o]))
  const currencies = new Set(
    state.lines.map((line) => byId.get(line.offerId)?.currency).filter((c): c is Currency => Boolean(c)),
  )
  if (currencies.size > 0 && !currencies.has(offer.currency)) return { ok: false, reason: 'currency-mismatch' }

  const existing = state.lines.find((line) => line.offerId === offer.id)
  if (existing) {
    if (existing.quantity >= maxQuantityOf(offer)) return { ok: false, reason: 'max-quantity' }
    return { ok: true, state: setQuantity(state, offer.id, existing.quantity + 1, maxQuantityOf(offer)) }
  }
  if (state.lines.length >= CART_MAX_LINES) return { ok: false, reason: 'cart-full' }
  return { ok: true, state: { lines: [...state.lines, { offerId: offer.id, quantity: 1 }] } }
}

/** Fixe la quantité d'une ligne, bornée entre 1 et le maximum autorisé. */
export function setQuantity(state: CartState, offerId: string, quantity: number, max: number): CartState {
  const safe = Math.min(Math.max(1, Math.floor(Number.isFinite(quantity) ? quantity : 1)), Math.max(1, max))
  return { lines: state.lines.map((line) => (line.offerId === offerId ? { ...line, quantity: safe } : line)) }
}

export function removeLine(state: CartState, offerId: string): CartState {
  return { lines: state.lines.filter((line) => line.offerId !== offerId) }
}

export function lineCount(state: CartState): number {
  return state.lines.reduce((sum, line) => sum + line.quantity, 0)
}

/* ------------------------------------------------------------------- Calculs */

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export type PricedLine = {
  offer: Offer
  quantity: number
  unitCents: number
  lineCents: number
  /** Quantité réglable (offre à plusieurs unités). */
  adjustable: boolean
  maxQuantity: number
}

export type BlockedLine = { offerId: string; quantity: number; offer?: Offer; reason: PurchaseBlock | 'unknown' }

export type CartSummary = {
  lines: PricedLine[]
  /** Lignes qui ne sont plus achetables (retirées du catalogue, indisponibles, sur devis). */
  blocked: BlockedLine[]
  currency: Currency | null
  totalCents: number
  itemCount: number
  /** Vrai si le panier peut passer à la commande. */
  canCheckout: boolean
}

/** Calcule le panier à partir du catalogue actuel (les prix ne viennent jamais du stockage). */
export function summarizeCart(state: CartState, catalog: readonly Offer[]): CartSummary {
  const byId = new Map(catalog.map((o) => [o.id, o]))
  const lines: PricedLine[] = []
  const blocked: BlockedLine[] = []

  for (const line of state.lines) {
    const offer = byId.get(line.offerId)
    if (!offer) {
      blocked.push({ offerId: line.offerId, quantity: line.quantity, reason: 'unknown' })
      continue
    }
    const block = purchaseBlock(offer)
    if (block || offer.price === null) {
      blocked.push({ offerId: line.offerId, quantity: line.quantity, offer, reason: block ?? 'quote-only' })
      continue
    }
    const maxQuantity = maxQuantityOf(offer)
    const quantity = Math.min(Math.max(1, line.quantity), maxQuantity)
    const unitCents = toCents(offer.price)
    lines.push({ offer, quantity, unitCents, lineCents: unitCents * quantity, adjustable: maxQuantity > 1, maxQuantity })
  }

  const currencies = new Set(lines.map((l) => l.offer.currency))
  const currency = currencies.size === 1 ? [...currencies][0] : null
  const totalCents = lines.reduce((sum, l) => sum + l.lineCents, 0)

  return {
    lines,
    blocked,
    currency,
    totalCents,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    canCheckout: lines.length > 0 && blocked.length === 0 && currencies.size === 1,
  }
}

/* --------------------------------------------------------------- Persistance */

type StoredCart = { v: 1; savedAt: number; lines: CartLine[] }

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Relit un panier stocké en écartant tout ce qui est invalide ou expiré. */
export function parseStoredCart(raw: string | null, now = Date.now()): CartState {
  if (!raw || raw.length > 10_000) return emptyCart
  try {
    const data = JSON.parse(raw) as Partial<StoredCart>
    if (data?.v !== 1 || typeof data.savedAt !== 'number' || !Array.isArray(data.lines)) return emptyCart
    if (now - data.savedAt > CART_TTL_MS || data.savedAt > now + 60_000) return emptyCart
    const seen = new Set<string>()
    const lines: CartLine[] = []
    for (const line of data.lines) {
      if (
        line &&
        typeof line.offerId === 'string' &&
        ID_PATTERN.test(line.offerId) &&
        line.offerId.length <= 80 &&
        Number.isInteger(line.quantity) &&
        line.quantity >= 1 &&
        line.quantity <= 20 &&
        !seen.has(line.offerId)
      ) {
        seen.add(line.offerId)
        lines.push({ offerId: line.offerId, quantity: line.quantity })
      }
      if (lines.length >= CART_MAX_LINES) break
    }
    return { lines }
  } catch {
    return emptyCart
  }
}

export function serializeCart(state: CartState, now = Date.now()): string {
  const stored: StoredCart = { v: 1, savedAt: now, lines: state.lines }
  return JSON.stringify(stored)
}

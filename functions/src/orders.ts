/**
 * Logique de commande côté serveur — pure, sans Firebase ni réseau (testée par orders.test.ts).
 *
 * Règles de confiance :
 * - la demande du navigateur ne contient que des identifiants d'offre et des quantités ;
 * - le prix, la devise et le total sont calculés ICI, à partir des offres Firestore ;
 * - les statuts n'évoluent que selon les transitions autorisées ci-dessous ;
 * - un paiement n'est « paid » que si PayPal confirme une capture COMPLETED pour le
 *   bon identifiant de commande, le bon montant et la bonne devise ;
 * - une capture vérifiée l'emporte toujours : même une commande annulée ou en échec
 *   passe à « paid » si PayPal confirme l'encaissement (l'argent a bel et bien été reçu).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/* ------------------------------------------------------------------ Statuts */

export const orderStatuses = ['created', 'payment_pending', 'paid', 'payment_failed', 'cancelled'] as const
export type OrderStatus = (typeof orderStatuses)[number]

/**
 * - cancelled n'est pas définitif : un client qui ferme la fenêtre PayPal peut réessayer
 *   sur la MÊME commande (évite d'en créer une seconde) ;
 * - paid est définitif : aucune transition n'en sort ;
 * - « → paid » n'est appliqué que par applyVerifiedCapture(), après vérification PayPal.
 */
const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  created: ['payment_pending', 'cancelled'],
  payment_pending: ['payment_pending', 'paid', 'payment_failed', 'cancelled'],
  payment_failed: ['payment_pending', 'paid', 'cancelled'],
  cancelled: ['payment_pending', 'paid'],
  paid: [],
}

/** Statuts depuis lesquels un (nouveau) paiement peut être lancé. */
export const payableStatuses: readonly OrderStatus[] = ['created', 'payment_pending', 'payment_failed', 'cancelled']

/** Durée pendant laquelle une commande peut être payée : au-delà, les prix sont à relire (nouvelle commande). */
export const ORDER_TTL_MS = 24 * 60 * 60 * 1000

export function isExpired(createdAt: Date, now: Date, ttlMs = ORDER_TTL_MS): boolean {
  return now.getTime() - createdAt.getTime() > ttlMs
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return transitions[from].includes(to)
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (orderStatuses as readonly string[]).includes(value)
}

/* ---------------------------------------------------------------- Montants */

export const currencies = ['EUR', 'USD', 'GBP', 'CAD', 'CHF'] as const
export type Currency = (typeof currencies)[number]

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

/** Format attendu par PayPal : "149.00". */
export function centsToValue(cents: number): string {
  return (cents / 100).toFixed(2)
}

/* ----------------------------------------------------- Demande du navigateur */

export type OrderRequest = {
  items: { offerId: string; quantity: number }[]
  customer: { firstName: string; lastName: string; email: string; phone?: string; company?: string; country: string }
  project: { details: string; referenceUrl?: string; deadline?: string }
  locale: 'fr' | 'en'
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE = /^\+?[0-9][0-9 ().-]{5,23}$/
const DEADLINES = ['flexible', 'asap', 'one-month', 'three-months']

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function str(v: unknown, { min = 0, max }: { min?: number; max: number }): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length >= min && s.length <= max ? s : null
}

function optionalStr(v: unknown, max: number): string | undefined | null {
  if (v === undefined || v === null || v === '') return undefined
  return str(v, { max })
}

export type RequestCheck = { ok: true; value: OrderRequest } | { ok: false; error: string }

/** Revalide entièrement la demande : le serveur ne fait pas confiance au formulaire. */
export function validateOrderRequest(body: unknown): RequestCheck {
  if (!isRecord(body)) return { ok: false, error: 'body' }
  // Champ piège : rempli = robot.
  if (typeof body.website === 'string' && body.website.trim() !== '') return { ok: false, error: 'honeypot' }

  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 20) return { ok: false, error: 'items' }
  const items: OrderRequest['items'] = []
  const seen = new Set<string>()
  for (const item of body.items) {
    if (!isRecord(item) || typeof item.offerId !== 'string' || !ID.test(item.offerId) || item.offerId.length > 80) {
      return { ok: false, error: 'items.offerId' }
    }
    if (!Number.isInteger(item.quantity) || (item.quantity as number) < 1 || (item.quantity as number) > 20) {
      return { ok: false, error: 'items.quantity' }
    }
    if (seen.has(item.offerId)) return { ok: false, error: 'items.duplicate' }
    seen.add(item.offerId)
    items.push({ offerId: item.offerId, quantity: item.quantity as number })
  }

  const c = body.customer
  if (!isRecord(c)) return { ok: false, error: 'customer' }
  const firstName = str(c.firstName, { min: 1, max: 80 })
  const lastName = str(c.lastName, { min: 1, max: 80 })
  const email = str(c.email, { min: 3, max: 254 })
  const country = str(c.country, { min: 1, max: 60 })
  const phone = optionalStr(c.phone, 25)
  const company = optionalStr(c.company, 120)
  if (!firstName || !lastName || !country) return { ok: false, error: 'customer.name' }
  if (!email || !EMAIL.test(email)) return { ok: false, error: 'customer.email' }
  if (phone === null || (phone && !PHONE.test(phone))) return { ok: false, error: 'customer.phone' }
  if (company === null) return { ok: false, error: 'customer.company' }

  const p = body.project
  if (!isRecord(p)) return { ok: false, error: 'project' }
  const details = str(p.details, { min: 30, max: 3000 })
  if (!details) return { ok: false, error: 'project.details' }
  const referenceUrl = optionalStr(p.referenceUrl, 500)
  if (referenceUrl === null) return { ok: false, error: 'project.referenceUrl' }
  if (referenceUrl) {
    try {
      const url = new URL(referenceUrl)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, error: 'project.referenceUrl' }
    } catch {
      return { ok: false, error: 'project.referenceUrl' }
    }
  }
  const deadline = optionalStr(p.deadline, 20)
  if (deadline === null || (deadline && !DEADLINES.includes(deadline))) return { ok: false, error: 'project.deadline' }

  const locale = body.locale === 'en' ? 'en' : 'fr'
  return {
    ok: true,
    value: {
      items,
      customer: { firstName, lastName, email, country, ...(phone ? { phone } : {}), ...(company ? { company } : {}) },
      project: { details, ...(referenceUrl ? { referenceUrl } : {}), ...(deadline ? { deadline } : {}) },
      locale,
    },
  }
}

/* ------------------------------------------------------- Tarification serveur */

export type PricedItem = { offerId: string; title: string; unitCents: number; quantity: number }
export type PricingResult =
  | { ok: true; items: PricedItem[]; totalCents: number; currency: Currency }
  | { ok: false; error: 'offer_unavailable' | 'currency_mismatch' | 'quantity' }

function titleOf(title: unknown, locale: 'fr' | 'en'): string {
  if (typeof title === 'string') return title.slice(0, 127)
  if (isRecord(title) && typeof title[locale] === 'string') return (title[locale] as string).slice(0, 127)
  return 'Krimossimo'
}

/**
 * Calcule la commande à partir des documents Firestore des offres.
 * Une offre n'est payable que si elle est publiée, disponible, avec un prix FIXE (> 0).
 */
export function priceOrder(
  request: Pick<OrderRequest, 'items' | 'locale'>,
  offers: ReadonlyMap<string, Record<string, unknown> | undefined>,
): PricingResult {
  const items: PricedItem[] = []
  const found = new Set<string>()
  for (const { offerId, quantity } of request.items) {
    const offer = offers.get(offerId)
    if (!offer || offer.publication !== 'published' || offer.availability !== 'available') return { ok: false, error: 'offer_unavailable' }
    if (typeof offer.price !== 'number' || !Number.isFinite(offer.price) || offer.price <= 0 || offer.priceFrom === true) {
      return { ok: false, error: 'offer_unavailable' }
    }
    if (typeof offer.currency !== 'string' || !(currencies as readonly string[]).includes(offer.currency)) {
      return { ok: false, error: 'offer_unavailable' }
    }
    const max = Number.isInteger(offer.maxQuantity) ? Math.min(Math.max(offer.maxQuantity as number, 1), 20) : 1
    if (quantity > max) return { ok: false, error: 'quantity' }
    found.add(offer.currency)
    items.push({ offerId, title: titleOf(offer.title, request.locale), unitCents: toCents(offer.price), quantity })
  }
  if (found.size !== 1) return { ok: false, error: 'currency_mismatch' }
  const totalCents = items.reduce((sum, item) => sum + item.unitCents * item.quantity, 0)
  return { ok: true, items, totalCents, currency: [...found][0] as Currency }
}

/** Vrai si la tarification actuelle est identique à celle figée dans la commande. */
export function samePricing(
  frozen: { items: PricedItem[]; totalCents: number; currency: string },
  current: { items: PricedItem[]; totalCents: number; currency: string },
): boolean {
  if (frozen.totalCents !== current.totalCents || frozen.currency !== current.currency) return false
  if (frozen.items.length !== current.items.length) return false
  return frozen.items.every((item, i) => {
    const other = current.items[i]
    return other !== undefined && other.offerId === item.offerId && other.unitCents === item.unitCents && other.quantity === item.quantity
  })
}

/* --------------------------------------------------------- Jeton d'accès */

/** Jeton remis au navigateur pour agir sur SA commande ; seul son empreinte est stockée. */
export function createAccessToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function tokenMatches(token: unknown, storedHash: unknown): boolean {
  if (typeof token !== 'string' || typeof storedHash !== 'string' || token.length < 20 || token.length > 200) return false
  const a = Buffer.from(hashToken(token), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/* --------------------------------------------------- Vérification PayPal */

export type StoredOrder = {
  status: OrderStatus
  totalCents: number
  currency: Currency
  /** Commande PayPal en cours. */
  paypalOrderId?: string | null
  /** Toutes les commandes PayPal créées pour cette commande (nouvelles tentatives comprises). */
  paypalOrderIds?: string[]
}

export type VerifiedCapture = { captureId: string; paypalOrderId: string; amount: { currency: Currency; value: string } }
export type CaptureCheck =
  | { ok: true; capture: VerifiedCapture }
  | { ok: false; reason: string; pending?: true; declined?: true; mismatch?: true }

const knownPaypalIds = (order: StoredOrder) => new Set([...(order.paypalOrderIds ?? []), ...(order.paypalOrderId ? [order.paypalOrderId] : [])])

/**
 * Vérifie une commande PayPal (réponse de capture OU lecture GET /v2/checkout/orders/{id})
 * avant de déclarer la commande payée : identifiant PayPal créé par NOUS pour cette commande,
 * statut COMPLETED, bonne référence, capture COMPLETED, montant et devise identiques au
 * montant figé par le serveur.
 *  - pending  : capture en cours d'examen chez PayPal (ni payée, ni échouée) ;
 *  - declined : capture refusée (DECLINED / FAILED) ;
 *  - mismatch : de l'argent a été capturé mais ne correspond pas : à examiner, jamais « paid ».
 */
export function verifyCapture(paypalOrder: unknown, orderId: string, order: StoredOrder): CaptureCheck {
  if (!isRecord(paypalOrder)) return { ok: false, reason: 'invalid_response' }
  if (typeof paypalOrder.id !== 'string' || !knownPaypalIds(order).has(paypalOrder.id)) return { ok: false, reason: 'paypal_order_mismatch' }
  const units = Array.isArray(paypalOrder.purchase_units) ? paypalOrder.purchase_units : []
  if (units.length !== 1 || !isRecord(units[0])) return { ok: false, reason: 'purchase_units' }
  const unit = units[0]
  if (unit.reference_id !== orderId) return { ok: false, reason: 'reference_mismatch' }
  const payments = isRecord(unit.payments) ? unit.payments : {}
  const captures = (Array.isArray(payments.captures) ? payments.captures : []).filter(isRecord)
  const done = captures.find((c) => c.status === 'COMPLETED')
  if (!done || typeof done.id !== 'string') {
    if (captures.some((c) => c.status === 'PENDING')) return { ok: false, reason: 'capture_pending', pending: true }
    if (captures.some((c) => c.status === 'DECLINED' || c.status === 'FAILED')) return { ok: false, reason: 'capture_declined', declined: true }
    return { ok: false, reason: `order_status_${String(paypalOrder.status)}` }
  }
  const amount = isRecord(done.amount) ? done.amount : {}
  if (amount.currency_code !== order.currency) return { ok: false, reason: 'currency_mismatch', mismatch: true }
  if (amount.value !== centsToValue(order.totalCents)) return { ok: false, reason: 'amount_mismatch', mismatch: true }
  if (paypalOrder.status !== 'COMPLETED') return { ok: false, reason: `order_status_${String(paypalOrder.status)}` }
  return {
    ok: true,
    capture: { captureId: done.id, paypalOrderId: paypalOrder.id, amount: { currency: order.currency, value: amount.value as string } },
  }
}

/** Montant figé d'une commande PayPal existante : sert à vérifier qu'on peut la réutiliser. */
export function paypalOrderAmountMatches(paypalOrder: unknown, orderId: string, order: StoredOrder): boolean {
  if (!isRecord(paypalOrder)) return false
  const units = Array.isArray(paypalOrder.purchase_units) ? paypalOrder.purchase_units : []
  const unit = units.length === 1 && isRecord(units[0]) ? units[0] : null
  const amount = unit && isRecord(unit.amount) ? unit.amount : null
  return (
    unit !== null &&
    unit.reference_id === orderId &&
    amount !== null &&
    amount.currency_code === order.currency &&
    amount.value === centsToValue(order.totalCents)
  )
}

/**
 * Refus renvoyés par PayPal à la capture (HTTP 422, champ details[0].issue) :
 *  - retry    : le client peut choisir un autre moyen de paiement dans la même fenêtre PayPal ;
 *  - notReady : la commande n'est pas (encore) approuvée par le client : rien n'a été encaissé ;
 *  - captured : déjà capturée (requête rejouée) : il faut relire la commande chez PayPal ;
 *  - failed   : refus définitif pour cette commande PayPal.
 */
export function classifyCaptureIssue(issue: string | undefined): 'retry' | 'notReady' | 'captured' | 'failed' {
  switch (issue) {
    case 'INSTRUMENT_DECLINED':
      return 'retry'
    case 'ORDER_NOT_APPROVED':
    case 'PAYER_ACTION_REQUIRED':
      return 'notReady'
    case 'ORDER_ALREADY_CAPTURED':
      return 'captured'
    default:
      return 'failed'
  }
}

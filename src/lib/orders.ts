/**
 * Client des commandes et des paiements (navigateur).
 *
 * Le navigateur ne fait qu'ENVOYER des identifiants d'offre et des quantités, puis
 * AFFICHER ce que le serveur répond. Les prix, le montant total, l'identifiant de
 * commande et le statut du paiement sont décidés et vérifiés par les Cloud Functions
 * (functions/src/), qui détiennent le secret PayPal. Aucun statut n'est inventé ici :
 * chaque statut affiché provient d'une réponse du serveur.
 *
 * Variable publique (sans secret) :
 *   VITE_FUNCTIONS_BASE_URL  URL des Cloud Functions (ex. https://europe-west1-<projet>.cloudfunctions.net)
 *
 * Le client ID PayPal (public par conception) et l'environnement (sandbox / live) sont
 * fournis par le serveur avec chaque commande : le SDK PayPal chargé dans le navigateur
 * correspond donc toujours à l'environnement qui créera et capturera le paiement.
 */
import { currencies, type Currency } from '../types/content'
import type { OrderRequest } from './checkout'

const env: Partial<ImportMetaEnv> = import.meta.env ?? {}

/** HTTPS obligatoire, sauf l'émulateur local Firebase. */
export function isValidApiBaseUrl(url: string): boolean {
  return /^https:\/\/[^\s/]+/.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)
}

const defaultBaseUrl = (env.VITE_FUNCTIONS_BASE_URL ?? '').trim().replace(/\/+$/, '')
export const isOrderApiConfigured = isValidApiBaseUrl(defaultBaseUrl)

/* --------------------------------------------------------------- Statuts */

/**
 * Statuts réels d'une commande, tenus par le serveur :
 * created          commande créée (montant figé côté serveur), paiement pas encore lancé
 * payment_pending  commande PayPal créée, en attente de validation par le client
 * paid             paiement capturé ET vérifié par le serveur (montant, devise, identifiants)
 * payment_failed   capture refusée ou montant non conforme
 * cancelled        paiement abandonné (un nouvel essai reste possible sur la même commande)
 */
export const orderStatuses = ['created', 'payment_pending', 'paid', 'payment_failed', 'cancelled'] as const
export type OrderStatus = (typeof orderStatuses)[number]

export type OrderItem = { offerId: string; title: string; unitCents: number; quantity: number }

export type PaymentEnv = 'sandbox' | 'live'

export type ServerOrder = {
  orderId: string
  /** Jeton d'accès à cette commande (gardé en mémoire uniquement, jamais stocké). */
  accessToken: string
  status: OrderStatus
  currency: Currency
  totalCents: number
  items: OrderItem[]
  /** Coordonnées enregistrées par le serveur (affichées pour vérification). */
  customer: { firstName: string; lastName: string; email: string }
  /** Paiement proposé par le serveur : environnement et client ID PUBLIC du SDK PayPal. */
  payment: { provider: 'paypal'; env: PaymentEnv; clientId: string }
}

/** Réponse du serveur après une action de paiement (le statut est toujours celui du serveur). */
export type PaymentState = {
  status: OrderStatus
  /** Capture en cours d'examen chez PayPal. */
  review?: boolean
  /** Moyen de paiement refusé : le client peut en choisir un autre dans la fenêtre PayPal. */
  retry?: 'instrument_declined'
  /** Statut non relu chez PayPal (service injoignable) : peut ne pas être à jour. */
  stale?: boolean
}

export type OrderRef = Pick<ServerOrder, 'orderId' | 'accessToken'>

/* ---------------------------------------------------------------- Erreurs */

export type OrderApiErrorCode =
  | 'not-configured'
  | 'network'
  | 'timeout'
  | 'invalid-request'
  | 'offer-unavailable'
  | 'price-changed'
  | 'order-expired'
  | 'order-not-found'
  | 'invalid-state'
  | 'not-approved'
  | 'paypal-order-mismatch'
  | 'env-mismatch'
  | 'payments-unavailable'
  | 'payment-unconfirmed'
  | 'paypal-unreachable'
  | 'paypal-error'
  | 'rate-limited'
  | 'too-many-attempts'
  | 'server'
  | 'bad-response'

export class OrderApiError extends Error {
  constructor(
    readonly code: OrderApiErrorCode,
    readonly httpStatus?: number,
    /** Statut réel de la commande quand le serveur le précise (par ex. « paid » sur un refus 409). */
    readonly orderStatus?: OrderStatus,
  ) {
    super(`Order API error: ${code}${httpStatus ? ` (HTTP ${httpStatus})` : ''}`)
    this.name = 'OrderApiError'
  }
}

/** Issue inconnue : le paiement a peut-être été encaissé, il ne faut surtout pas repayer. */
export const isUnconfirmed = (code: string | null | undefined) =>
  code === 'payment-unconfirmed' || code === 'network' || code === 'timeout'

/* --------------------------------------------------- Validation des réponses */

const ORDER_ID = /^[A-Za-z0-9_-]{10,64}$/
const PAYPAL_ID = /^[A-Z0-9]{10,30}$/

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStatus = (v: unknown): v is OrderStatus => typeof v === 'string' && (orderStatuses as readonly string[]).includes(v)
const isCents = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100_000_000

export function parseServerOrder(data: unknown): ServerOrder | null {
  if (!isRecord(data) || !Array.isArray(data.items)) return null
  const { orderId, accessToken, status, currency, totalCents } = data
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) return null
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 200) return null
  if (!isStatus(status) || !isCents(totalCents)) return null
  if (typeof currency !== 'string' || !(currencies as readonly string[]).includes(currency)) return null
  const items: OrderItem[] = []
  for (const item of data.items) {
    if (
      !isRecord(item) ||
      typeof item.offerId !== 'string' ||
      typeof item.title !== 'string' ||
      !isCents(item.unitCents) ||
      typeof item.quantity !== 'number' ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    ) {
      return null
    }
    items.push({ offerId: item.offerId, title: item.title.slice(0, 200), unitCents: item.unitCents, quantity: item.quantity })
  }
  if (items.length === 0) return null
  // Cohérence : le total annoncé doit correspondre aux lignes annoncées.
  if (items.reduce((sum, i) => sum + i.unitCents * i.quantity, 0) !== totalCents) return null
  const c = data.customer
  const p = data.payment
  if (!isRecord(c) || typeof c.firstName !== 'string' || typeof c.lastName !== 'string' || typeof c.email !== 'string') return null
  if (!isRecord(p) || p.provider !== 'paypal' || (p.env !== 'sandbox' && p.env !== 'live')) return null
  if (typeof p.clientId !== 'string' || !/^[A-Za-z0-9_-]{10,200}$/.test(p.clientId)) return null
  return {
    orderId,
    accessToken,
    status,
    currency: currency as Currency,
    totalCents,
    items,
    customer: { firstName: c.firstName.slice(0, 80), lastName: c.lastName.slice(0, 80), email: c.email.slice(0, 254) },
    payment: { provider: 'paypal', env: p.env, clientId: p.clientId },
  }
}

function parseStatus(data: unknown): PaymentState | null {
  if (!isRecord(data) || !isStatus(data.status)) return null
  return {
    status: data.status,
    ...(data.review === true ? { review: true } : {}),
    ...(data.retry === 'instrument_declined' ? { retry: 'instrument_declined' as const } : {}),
    ...(data.stale === true ? { stale: true } : {}),
  }
}

function parsePaypalOrder(data: unknown): { paypalOrderId: string; status: OrderStatus } | null {
  if (!isRecord(data) || typeof data.paypalOrderId !== 'string' || !PAYPAL_ID.test(data.paypalOrderId)) return null
  return isStatus(data.status) ? { paypalOrderId: data.paypalOrderId, status: data.status } : null
}

/* -------------------------------------------------------------- Transport */

/** Code d'erreur du serveur (champ « error ») → code affiché. */
const errorFromServer: Record<string, OrderApiErrorCode> = {
  invalid_request: 'invalid-request',
  offer_unavailable: 'offer-unavailable',
  price_changed: 'price-changed',
  order_expired: 'order-expired',
  order_not_found: 'order-not-found',
  invalid_state: 'invalid-state',
  not_approved: 'not-approved',
  paypal_order_mismatch: 'paypal-order-mismatch',
  env_mismatch: 'env-mismatch',
  payments_unavailable: 'payments-unavailable',
  payment_unconfirmed: 'payment-unconfirmed',
  paypal_unreachable: 'paypal-unreachable',
  paypal_error: 'paypal-error',
  rate_limited: 'rate-limited',
  too_many_attempts: 'too-many-attempts',
}

const errorFromHttp: Record<number, OrderApiErrorCode> = {
  400: 'invalid-request',
  404: 'order-not-found',
  409: 'invalid-state',
  422: 'offer-unavailable',
  429: 'rate-limited',
}

export type OrdersClientOptions = {
  baseUrl: string
  fetch?: typeof fetch
  timeoutMs?: number
}

/**
 * Fabrique du client (injectable pour les tests). Chaque appel est un POST JSON,
 * sans cookie ; la réponse est validée avant d'être utilisée.
 */
export function createOrdersClient({ baseUrl, fetch: fetchImpl, timeoutMs = 20000 }: OrdersClientOptions) {
  const root = baseUrl.trim().replace(/\/+$/, '')
  const configured = isValidApiBaseUrl(root)

  async function call<T>(name: string, body: unknown, parse: (data: unknown) => T | null, timeout = timeoutMs): Promise<T> {
    if (!configured) throw new OrderApiError('not-configured')
    const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    let response: Response
    try {
      response = await doFetch(`${root}/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'omit',
        signal: controller.signal,
      })
    } catch {
      throw new OrderApiError(controller.signal.aborted ? 'timeout' : 'network')
    } finally {
      clearTimeout(timer)
    }

    let data: unknown = null
    try {
      data = await response.json()
    } catch {
      data = null
    }
    if (!response.ok) {
      const serverCode = isRecord(data) && typeof data.error === 'string' ? errorFromServer[data.error] : undefined
      const orderStatus = isRecord(data) && isStatus(data.status) ? data.status : undefined
      throw new OrderApiError(serverCode ?? errorFromHttp[response.status] ?? 'server', response.status, orderStatus)
    }
    const parsed = parse(data)
    if (!parsed) throw new OrderApiError('bad-response', response.status)
    return parsed
  }

  return {
    isConfigured: configured,
    /** Crée la commande : le serveur relit les prix dans Firestore et renvoie le montant figé. */
    createOrder: (request: OrderRequest) => call('createOrder', request, parseServerOrder),
    /** Crée la commande PayPal correspondant au montant figé par le serveur. */
    createPaypalOrder: (ref: OrderRef) => call('createPaypalOrder', ref, parsePaypalOrder),
    /** Capture le paiement ; le serveur vérifie montant, devise et identifiants. */
    capturePaypalOrder: (ref: OrderRef, paypalOrderId: string) =>
      call('capturePaypalOrder', { ...ref, paypalOrderId }, parseStatus, Math.max(timeoutMs, 30000)),
    /** Annule une commande non payée (paiement abandonné). */
    cancelOrder: (ref: OrderRef) => call('cancelOrder', ref, parseStatus),
    /** Relit le statut réel ; le serveur le revérifie auprès de PayPal si un paiement est en attente. */
    getOrderStatus: (ref: OrderRef) => call('getOrder', ref, parseStatus),
  }
}

export type OrdersClient = ReturnType<typeof createOrdersClient>

/** Client par défaut, configuré par VITE_FUNCTIONS_BASE_URL. */
export const ordersClient: OrdersClient = createOrdersClient({ baseUrl: defaultBaseUrl })

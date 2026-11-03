/**
 * Service de commande et de paiement — toute la logique des Cloud Functions de paiement,
 * sans dépendance à Firebase : le stockage (OrderStore) et PayPal (PayPalApi) sont injectés.
 * index.ts le branche sur Firestore et l'API PayPal réelle ; payments.test.ts sur un stockage
 * en mémoire et un simulateur de l'API Sandbox.
 *
 * Principes :
 *  1. Le navigateur n'envoie que des identifiants d'offre et des quantités ; le montant est
 *     calculé ici à partir des offres Firestore puis FIGÉ dans la commande.
 *  2. La commande PayPal est créée ici, pour ce montant figé, après relecture des offres.
 *  3. La capture est faite ici, pour la commande PayPal enregistrée sur NOTRE commande.
 *  4. « paid » n'est écrit qu'après vérification de la réponse de PayPal (statut, montant,
 *     devise, références) ; un retour du navigateur n'est jamais une preuve de paiement.
 *  5. Anti double paiement : avant de créer une nouvelle commande PayPal, la précédente est
 *     relue chez PayPal (encaissée → payée ; approuvée → capturée ; en cours → réutilisée).
 *     Une issue inconnue (réseau) n'est jamais traitée comme un échec.
 *  6. Webhook : signature vérifiée par PayPal, puis commande RELUE chez PayPal : le contenu
 *     de l'événement ne sert qu'à savoir quelle commande relire.
 */
import {
  canTransition,
  classifyCaptureIssue,
  createAccessToken,
  isExpired,
  isOrderStatus,
  payableStatuses,
  paypalOrderAmountMatches,
  priceOrder,
  samePricing,
  tokenMatches,
  validateOrderRequest,
  verifyCapture,
  type Currency,
  type OrderRequest,
  type OrderStatus,
  type PricedItem,
} from './orders.js'
import { PayPalError, PayPalUnreachable, type PayPalApi, type PayPalEnv, type PayPalOrder, type WebhookHeaders } from './paypal.js'

/* ------------------------------------------------------------------- Modèle */

export type HistoryEntry = { status: OrderStatus; at: Date; note?: string }
export type PaymentAlert = { kind: 'duplicate_capture' | 'amount_mismatch'; paypalOrderId: string; captureId?: string; at: Date }

/** Document Firestore orders/{orderId} (écrit uniquement par les fonctions). */
export type OrderRecord = {
  status: OrderStatus
  currency: Currency
  totalCents: number
  items: PricedItem[]
  customer: OrderRequest['customer']
  project: OrderRequest['project']
  locale: 'fr' | 'en'
  /** Empreinte SHA-256 du jeton remis au navigateur (le jeton lui-même n'est jamais stocké). */
  accessTokenHash: string
  /** Environnement PayPal dans lequel la commande a été créée : une commande Sandbox n'est jamais payable en Live. */
  paymentEnv: PayPalEnv
  createdAt: Date
  updatedAt: Date
  history: HistoryEntry[]
  /** Commande PayPal en cours (null : aucune réutilisable). */
  paypalOrderId: string | null
  paypalOrderIds: string[]
  paypalAttempts: number
  /**
   * Incrémenté après chaque capture refusée SANS encaissement : la capture suivante utilise une
   * nouvelle clé d'idempotence. Jamais incrémenté quand l'issue est inconnue (réseau) : la même
   * clé garantit alors qu'une capture rejouée n'encaisse pas deux fois.
   */
  captureAttempts: number
  paypalCaptureId?: string
  paidAt?: Date
  paidAmount?: { currency: Currency; value: string }
  failureReason?: string
  /** Capture en cours d'examen chez PayPal (statut PENDING). */
  captureReview?: boolean
  /** Paiement confirmé alors que la commande était annulée ou en échec. */
  lateCapture?: boolean
  /** Anomalies à traiter par l'administrateur (second encaissement, montant différent). */
  paymentAlerts?: PaymentAlert[]
}

export type Patch = Partial<OrderRecord>

export interface OrderStore {
  readOffers(ids: string[]): Promise<Map<string, Record<string, unknown> | undefined>>
  createOrder(record: OrderRecord): Promise<string>
  getOrder(orderId: string): Promise<OrderRecord | null>
  /** Lecture + écriture ATOMIQUES (transaction) ; null si la commande n'existe pas. */
  updateOrder<T>(orderId: string, fn: (current: OrderRecord) => { patch: Patch | null; result: T }): Promise<T | null>
  /** Limite de débit : false si la limite est atteinte pour cette portée et ce client. */
  allow(scope: 'order', clientKey: string, max: number, windowMs: number): Promise<boolean>
  hasEvent(eventId: string): Promise<boolean>
  recordEvent(eventId: string, info: { type: string; orderId: string | null; at: Date }): Promise<void>
}

export type Logger = {
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
}

export type PaymentDeps = {
  store: OrderStore
  /** null : PayPal n'est pas configuré (identifiants absents). */
  paypal: () => PayPalApi | null
  webhookId: () => string
  now?: () => Date
  log?: Logger
}

export type Reply = { status: number; json: Record<string, unknown> }

/* --------------------------------------------------------------- Constantes */

const ORDER_ID = /^[A-Za-z0-9]{10,64}$/
const PAYPAL_ORDER_ID = /^[A-Z0-9]{10,30}$/
/** Nombre maximal de commandes PayPal créées pour une même commande. */
export const MAX_PAYPAL_ATTEMPTS = 10
/** Commandes créées par adresse IP et par heure. */
export const ORDER_RATE_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 }
/** Statuts PayPal d'une commande encore utilisable (le client peut l'approuver). */
const REUSABLE = new Set(['CREATED', 'PAYER_ACTION_REQUIRED', 'SAVED'])
/** Événements webhook traités ; les autres sont acquittés et ignorés. */
export const WEBHOOK_EVENTS = [
  'CHECKOUT.ORDER.APPROVED',
  'CHECKOUT.ORDER.COMPLETED',
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.PENDING',
  'PAYMENT.CAPTURE.DENIED',
  'PAYMENT.CAPTURE.DECLINED',
] as const

/** Capture dont l'issue est inconnue (réseau, erreur 5xx de PayPal) : ne JAMAIS repayer. */
export class PaymentUnconfirmed extends Error {
  constructor() {
    super('payment outcome unknown')
    this.name = 'PaymentUnconfirmed'
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const silent: Logger = { info() {}, warn() {}, error() {} }

type Outcome = { status: OrderStatus; review?: true; retry?: 'instrument_declined'; notApproved?: true }

/* ------------------------------------------------------------------ Service */

export function createPaymentService(deps: PaymentDeps) {
  const { store } = deps
  const now = deps.now ?? (() => new Date())
  const log = deps.log ?? silent

  /** Changement de statut (si autorisé) avec ajout à l'historique. */
  const move = (current: OrderRecord, to: OrderStatus, extra: Patch = {}, note?: string): Patch | null => {
    if (!canTransition(current.status, to)) return null
    const at = now()
    const changed = current.status !== to
    return {
      ...extra,
      status: to,
      updatedAt: at,
      ...(changed ? { history: [...current.history, { status: to, at, ...(note ? { note } : {}) }] } : {}),
    }
  }

  async function load(body: Record<string, unknown>): Promise<{ id: string; order: OrderRecord } | null> {
    const id = typeof body.orderId === 'string' && ORDER_ID.test(body.orderId) ? body.orderId : null
    if (!id) return null
    const order = await store.getOrder(id)
    if (!order || !isOrderStatus(order.status) || !tokenMatches(body.accessToken, order.accessTokenHash)) return null
    return { id, order }
  }

  /**
   * Applique ce que PayPal dit d'une commande PayPal (réponse de capture ou relecture).
   * Seul endroit du code qui écrit « paid ».
   */
  async function settle(id: string, paypalOrder: PayPalOrder, source: string): Promise<Outcome> {
    const outcome = await store.updateOrder<Outcome>(id, (current) => {
      const check = verifyCapture(paypalOrder, id, current)
      const at = now()
      if (check.ok) {
        const { captureId, paypalOrderId, amount } = check.capture
        if (current.status === 'paid') {
          const alerts = current.paymentAlerts ?? []
          if (current.paypalCaptureId === captureId || alerts.some((a) => a.captureId === captureId)) return { patch: null, result: { status: 'paid' } }
          // Second encaissement pour la même commande : à rembourser depuis PayPal.
          log.error('duplicate capture: refund required', { orderId: id, paypalOrderId, captureId })
          return {
            patch: { paymentAlerts: [...alerts, { kind: 'duplicate_capture', paypalOrderId, captureId, at }], updatedAt: at },
            result: { status: 'paid' },
          }
        }
        const late = current.status === 'cancelled' || current.status === 'payment_failed'
        if (late) log.warn('payment confirmed on a cancelled or failed order', { orderId: id, from: current.status })
        const patch = move(current, 'paid', { paypalCaptureId: captureId, paidAt: at, paidAmount: amount, captureReview: false, ...(late ? { lateCapture: true } : {}) }, source)
        return { patch, result: { status: patch ? 'paid' : current.status } }
      }
      if (current.status === 'paid') return { patch: null, result: { status: 'paid' } }
      if (check.pending) {
        const patch = move(current, 'payment_pending', { captureReview: true }, 'capture_pending')
        return { patch, result: { status: patch ? 'payment_pending' : current.status, review: true } }
      }
      if (check.mismatch) {
        // De l'argent a été capturé mais ne correspond pas au montant figé : jamais « paid ».
        log.error('captured amount does not match the order', { orderId: id, reason: check.reason })
        const alerts = [...(current.paymentAlerts ?? []), { kind: 'amount_mismatch' as const, paypalOrderId: String(paypalOrder.id), at }]
        const patch = move(current, 'payment_failed', { failureReason: check.reason, paymentAlerts: alerts, paypalOrderId: null })
        return { patch: patch ?? { paymentAlerts: alerts, updatedAt: at }, result: { status: patch ? 'payment_failed' : current.status } }
      }
      if (check.declined) {
        const patch = move(current, 'payment_failed', { failureReason: check.reason, paypalOrderId: null, captureReview: false })
        return { patch, result: { status: patch ? 'payment_failed' : current.status } }
      }
      // Ni encaissée ni refusée (par ex. pas encore approuvée) : rien ne change.
      log.warn('paypal order not settled', { orderId: id, reason: check.reason })
      return { patch: null, result: { status: current.status } }
    })
    return outcome ?? { status: 'cancelled' }
  }

  /** Capture côté serveur puis vérification. Lève PaymentUnconfirmed si l'issue est inconnue. */
  async function captureAndSettle(paypal: PayPalApi, id: string, order: OrderRecord, paypalOrderId: string, source: string): Promise<Outcome> {
    const requestId = `${id}-capture-${paypalOrderId}-${order.captureAttempts}`
    let captured: PayPalOrder
    try {
      captured = await paypal.captureOrder(paypalOrderId, requestId)
    } catch (error) {
      if (error instanceof PayPalError && error.httpStatus === 422) {
        const kind = classifyCaptureIssue(error.issue)
        if (kind === 'captured') {
          // Déjà capturée (requête rejouée, autre onglet, webhook) : on relit l'état réel.
          const fresh = await paypal.getOrder(paypalOrderId)
          return fresh ? settle(id, fresh, source) : { status: order.status }
        }
        if (kind === 'notReady') {
          // Rien n'a été encaissé : la prochaine capture utilisera une nouvelle clé d'idempotence
          // (PayPal pourrait sinon rejouer ce refus mis en cache).
          await store.updateOrder(id, (current) => ({ patch: { captureAttempts: current.captureAttempts + 1, updatedAt: now() }, result: null }))
          return { status: order.status, notApproved: true }
        }
        if (kind === 'retry') {
          log.info('capture declined, payer may choose another funding source', { orderId: id })
          const status = await store.updateOrder(id, (current) => {
            const patch = move(current, 'payment_pending', { captureAttempts: current.captureAttempts + 1, failureReason: error.issue })
            return { patch: patch ?? { captureAttempts: current.captureAttempts + 1, updatedAt: now() }, result: patch ? 'payment_pending' : current.status }
          })
          return { status: status ?? order.status, ...(status === 'payment_pending' ? { retry: 'instrument_declined' as const } : {}) }
        }
        log.warn('capture refused by PayPal', { orderId: id, issue: error.issue })
        const status = await store.updateOrder(id, (current) => {
          const patch = move(current, 'payment_failed', { failureReason: error.issue ?? 'unprocessable', paypalOrderId: null, captureAttempts: current.captureAttempts + 1 })
          return { patch, result: patch ? 'payment_failed' : current.status }
        })
        return { status: status ?? order.status }
      }
      if (error instanceof PayPalUnreachable || (error instanceof PayPalError && error.httpStatus >= 500)) {
        log.warn('capture outcome unknown', { orderId: id })
        throw new PaymentUnconfirmed()
      }
      throw error
    }
    return settle(id, captured, source)
  }

  /** Relit chez PayPal une commande en attente et la régularise (encaissée, approuvée). */
  async function reconcile(paypal: PayPalApi, id: string, order: OrderRecord, source: string): Promise<Outcome> {
    if (!order.paypalOrderId) return { status: order.status }
    const fresh = await paypal.getOrder(order.paypalOrderId)
    if (!fresh) return { status: order.status }
    if (fresh.status === 'COMPLETED') return settle(id, fresh, source)
    if (fresh.status === 'APPROVED') return captureAndSettle(paypal, id, order, order.paypalOrderId, source)
    return { status: order.status, ...(order.captureReview ? { review: true as const } : {}) }
  }

  const reply = (status: number, json: Record<string, unknown>): Reply => ({ status, json })
  const notFound = reply(404, { error: 'order_not_found' })
  const unavailable = reply(503, { error: 'payments_unavailable' })
  const invalidState = (status: OrderStatus) => reply(409, { error: 'invalid_state', status })
  const outcomeReply = (o: Outcome): Reply =>
    o.notApproved
      ? reply(409, { error: 'not_approved', status: o.status })
      : reply(200, { status: o.status, ...(o.review ? { review: true } : {}), ...(o.retry ? { retry: o.retry } : {}) })

  /** Erreurs connues → réponses explicites ; rien d'interne n'est renvoyé au navigateur. */
  async function guard(name: string, run: () => Promise<Reply>): Promise<Reply> {
    try {
      return await run()
    } catch (error) {
      if (error instanceof PaymentUnconfirmed) return reply(503, { error: 'payment_unconfirmed' })
      if (error instanceof PayPalUnreachable) {
        log.warn(`${name}: PayPal unreachable`, { operation: error.operation })
        return reply(503, { error: 'paypal_unreachable' })
      }
      if (error instanceof PayPalError) {
        log.error(`${name}: PayPal error`, { status: error.httpStatus, issue: error.issue, debugId: error.debugId })
        return reply(502, { error: 'paypal_error' })
      }
      log.error(`${name} failed`, { message: error instanceof Error ? error.message : String(error) })
      return reply(500, { error: 'server' })
    }
  }

  /** Commande d'un environnement PayPal donné, servie par un autre : refus explicite. */
  const envMismatch = (paypal: PayPalApi, order: OrderRecord) => order.paymentEnv !== paypal.env

  return {
    /* ------------------------------------------------------------ createOrder */
    createOrder: (body: Record<string, unknown>, clientKey: string) =>
      guard('createOrder', async () => {
        const paypal = deps.paypal()
        if (!paypal) return unavailable
        const check = validateOrderRequest(body)
        if (!check.ok) return reply(400, { error: 'invalid_request', field: check.error === 'honeypot' ? undefined : check.error })
        const request = check.value
        if (!(await store.allow('order', clientKey, ORDER_RATE_LIMIT.max, ORDER_RATE_LIMIT.windowMs))) {
          return reply(429, { error: 'rate_limited' })
        }

        // Les prix viennent UNIQUEMENT de Firestore.
        const offers = await store.readOffers(request.items.map((i) => i.offerId))
        const pricing = priceOrder(request, offers)
        if (!pricing.ok) {
          return pricing.error === 'offer_unavailable'
            ? reply(422, { error: 'offer_unavailable' })
            : reply(400, { error: 'invalid_request', field: pricing.error })
        }

        const { token, hash } = createAccessToken()
        const at = now()
        const orderId = await store.createOrder({
          status: 'created',
          currency: pricing.currency,
          totalCents: pricing.totalCents,
          items: pricing.items,
          customer: request.customer,
          project: request.project,
          locale: request.locale,
          accessTokenHash: hash,
          paymentEnv: paypal.env,
          createdAt: at,
          updatedAt: at,
          history: [{ status: 'created', at }],
          paypalOrderId: null,
          paypalOrderIds: [],
          paypalAttempts: 0,
          captureAttempts: 0,
        })
        return reply(201, {
          orderId,
          accessToken: token,
          status: 'created',
          currency: pricing.currency,
          totalCents: pricing.totalCents,
          items: pricing.items,
          customer: { firstName: request.customer.firstName, lastName: request.customer.lastName, email: request.customer.email },
          // Client ID public par conception : le navigateur charge le SDK du MÊME environnement que le serveur.
          payment: { provider: 'paypal', env: paypal.env, clientId: paypal.clientId },
        })
      }),

    /* ------------------------------------------------------ createPaypalOrder */
    createPaypalOrder: (body: Record<string, unknown>) =>
      guard('createPaypalOrder', async () => {
        const paypal = deps.paypal()
        if (!paypal) return unavailable
        const loaded = await load(body)
        if (!loaded) return notFound
        const { id, order } = loaded
        if (envMismatch(paypal, order)) return reply(409, { error: 'env_mismatch' })
        if (order.status === 'paid') return invalidState('paid')
        if (!payableStatuses.includes(order.status)) return invalidState(order.status)
        // 1. Commande PayPal précédente : jamais de seconde commande si la première a pu être payée.
        let existing: PayPalOrder | null = null
        if (order.paypalOrderId) {
          existing = await paypal.getOrder(order.paypalOrderId)
          if (existing && (existing.status === 'COMPLETED' || existing.status === 'APPROVED')) {
            const outcome =
              existing.status === 'COMPLETED' ? await settle(id, existing, 'reconcile') : await captureAndSettle(paypal, id, order, existing.id, 'reconcile')
            if (outcome.status === 'paid' || outcome.review) return invalidState(outcome.status)
            existing = null
          }
        }

        // 2. Délai et tarifs : offres relues MAINTENANT ; une offre retirée ou un prix modifié bloque le paiement.
        if (isExpired(order.createdAt, now())) return reply(409, { error: 'order_expired', status: order.status })
        const offers = await store.readOffers(order.items.map((i) => i.offerId))
        const pricing = priceOrder({ items: order.items.map(({ offerId, quantity }) => ({ offerId, quantity })), locale: order.locale }, offers)
        if (!pricing.ok) return reply(422, { error: 'offer_unavailable' })
        if (!samePricing(order, pricing)) return reply(409, { error: 'price_changed', status: order.status })

        // 3. Commande PayPal encore utilisable (fenêtre PayPal fermée puis rouverte) : réutilisée.
        if (existing && REUSABLE.has(existing.status) && paypalOrderAmountMatches(existing, id, order)) {
          const reused = existing
          const status = await store.updateOrder(id, (current) => {
            if (current.paypalOrderId !== reused.id) return { patch: null, result: current.status }
            const patch = move(current, 'payment_pending')
            return { patch, result: patch ? 'payment_pending' : current.status }
          })
          if (status === 'payment_pending') return reply(200, { paypalOrderId: reused.id, status })
          return invalidState(status ?? order.status)
        }

        // 4. Nouvelle commande PayPal, pour le montant figé.
        const fresh = await store.getOrder(id)
        if (!fresh) return notFound
        if (fresh.status === 'paid') return invalidState('paid')
        if (fresh.paypalAttempts >= MAX_PAYPAL_ATTEMPTS) return reply(429, { error: 'too_many_attempts' })
        const attempt = fresh.paypalAttempts + 1
        const created = await paypal.createOrder({
          orderId: id,
          attempt,
          currency: fresh.currency,
          totalCents: fresh.totalCents,
          items: fresh.items,
          payer: { firstName: fresh.customer.firstName, lastName: fresh.customer.lastName },
        })
        const status = await store.updateOrder(id, (current) => {
          const patch = move(current, 'payment_pending', {
            paypalOrderId: created.id,
            paypalOrderIds: current.paypalOrderIds.includes(created.id) ? current.paypalOrderIds : [...current.paypalOrderIds, created.id],
            paypalAttempts: Math.max(current.paypalAttempts, attempt),
            captureReview: false,
          })
          return { patch, result: patch ? 'payment_pending' : current.status }
        })
        if (status !== 'payment_pending') return invalidState(status ?? order.status)
        return reply(200, { paypalOrderId: created.id, status })
      }),

    /* ----------------------------------------------------- capturePaypalOrder */
    capturePaypalOrder: (body: Record<string, unknown>) =>
      guard('capturePaypalOrder', async () => {
        const paypal = deps.paypal()
        if (!paypal) return unavailable
        const loaded = await load(body)
        if (!loaded) return notFound
        const { id, order } = loaded
        if (envMismatch(paypal, order)) return reply(409, { error: 'env_mismatch' })
        if (order.status === 'paid') return reply(200, { status: 'paid' })
        // Seule la commande PayPal créée par le serveur pour CETTE commande peut être capturée.
        const paypalOrderId = typeof body.paypalOrderId === 'string' && PAYPAL_ORDER_ID.test(body.paypalOrderId) ? body.paypalOrderId : null
        if (!paypalOrderId || paypalOrderId !== order.paypalOrderId) return reply(409, { error: 'paypal_order_mismatch', status: order.status })
        return outcomeReply(await captureAndSettle(paypal, id, order, paypalOrderId, 'capture'))
      }),

    /* ------------------------------------------------------------ cancelOrder */
    cancelOrder: (body: Record<string, unknown>) =>
      guard('cancelOrder', async () => {
        const loaded = await load(body)
        if (!loaded) return notFound
        const { id, order } = loaded
        if (order.status === 'paid') return reply(200, { status: 'paid' })
        // Si PayPal a encaissé entre-temps, la commande est payée, pas annulée.
        const paypal = deps.paypal()
        if (paypal && !envMismatch(paypal, order) && order.paypalOrderId) {
          try {
            const existing = await paypal.getOrder(order.paypalOrderId)
            if (existing?.status === 'COMPLETED') {
              const outcome = await settle(id, existing, 'reconcile')
              if (outcome.status === 'paid') return reply(200, { status: 'paid' })
            }
          } catch (error) {
            if (!(error instanceof PayPalUnreachable || error instanceof PayPalError)) throw error
          }
        }
        const status = await store.updateOrder(id, (current) => {
          const patch = move(current, 'cancelled', {}, 'cancelled_by_customer')
          return { patch, result: patch ? 'cancelled' : current.status }
        })
        return reply(200, { status: status ?? order.status })
      }),

    /* --------------------------------------------------------------- getOrder */
    getOrder: (body: Record<string, unknown>) =>
      guard('getOrder', async () => {
        const loaded = await load(body)
        if (!loaded) return notFound
        const { id, order } = loaded
        const paypal = deps.paypal()
        // Paiement en attente : l'état réel est relu chez PayPal (capture perdue, examen terminé...).
        if (paypal && !envMismatch(paypal, order) && order.status === 'payment_pending' && order.paypalOrderId) {
          try {
            const outcome = await reconcile(paypal, id, order, 'status_check')
            return reply(200, { status: outcome.status, ...(outcome.review ? { review: true } : {}) })
          } catch (error) {
            if (!(error instanceof PaymentUnconfirmed || error instanceof PayPalUnreachable || error instanceof PayPalError)) throw error
            return reply(200, { status: order.status, stale: true })
          }
        }
        return reply(200, { status: order.status, ...(order.captureReview && order.status === 'payment_pending' ? { review: true } : {}) })
      }),

    /* ---------------------------------------------------------- paypalWebhook */
    handleWebhook: (headers: WebhookHeaders, rawBody: string) =>
      guard('paypalWebhook', async () => {
        const paypal = deps.paypal()
        const webhookId = deps.webhookId()
        if (!paypal || !webhookId) return reply(404, { error: 'not_found' })
        let event: unknown
        try {
          event = JSON.parse(rawBody)
        } catch {
          return reply(400, { error: 'invalid_body' })
        }
        if (!isRecord(event)) return reply(400, { error: 'invalid_body' })
        if (!(await paypal.verifyWebhook(webhookId, headers, rawBody))) {
          log.warn('webhook signature rejected')
          return reply(400, { error: 'invalid_signature' })
        }
        const eventId = typeof event.id === 'string' && /^[A-Za-z0-9-]{1,100}$/.test(event.id) ? event.id : null
        const type = typeof event.event_type === 'string' ? event.event_type : ''
        if (eventId && (await store.hasEvent(eventId))) return reply(200, { received: true, duplicate: true })

        const target = webhookTarget(event)
        if (target && (WEBHOOK_EVENTS as readonly string[]).includes(type)) {
          const order = await store.getOrder(target.orderId)
          if (!order || envMismatch(paypal, order) || !order.paypalOrderIds.includes(target.paypalOrderId)) {
            log.warn('webhook for an unknown order', { type, orderId: target.orderId })
          } else {
            // Le contenu de l'événement n'est pas cru sur parole : la commande est relue chez PayPal.
            const fresh = await paypal.getOrder(target.paypalOrderId)
            if (fresh?.status === 'COMPLETED') await settle(target.orderId, fresh, 'webhook')
            else if (fresh?.status === 'APPROVED' && order.status === 'payment_pending' && order.paypalOrderId === fresh.id) {
              // Client parti juste après avoir approuvé : la capture est faite ici.
              await captureAndSettle(paypal, target.orderId, order, fresh.id, 'webhook')
            }
          }
        }
        if (eventId) await store.recordEvent(eventId, { type, orderId: target?.orderId ?? null, at: now() })
        return reply(200, { received: true })
      }),
  }
}

export type PaymentService = ReturnType<typeof createPaymentService>

/** Commande concernée par un événement webhook (à relire chez PayPal). */
export function webhookTarget(event: Record<string, unknown>): { orderId: string; paypalOrderId: string } | null {
  const resource = isRecord(event.resource) ? event.resource : null
  if (!resource) return null
  const type = typeof event.event_type === 'string' ? event.event_type : ''
  let orderId: unknown
  let paypalOrderId: unknown
  if (type.startsWith('CHECKOUT.ORDER.')) {
    paypalOrderId = resource.id
    const unit = Array.isArray(resource.purchase_units) && isRecord(resource.purchase_units[0]) ? resource.purchase_units[0] : {}
    orderId = unit.custom_id ?? unit.reference_id
  } else if (type.startsWith('PAYMENT.CAPTURE.')) {
    orderId = resource.custom_id
    const related = isRecord(resource.supplementary_data) && isRecord(resource.supplementary_data.related_ids) ? resource.supplementary_data.related_ids : {}
    paypalOrderId = related.order_id
  }
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) return null
  if (typeof paypalOrderId !== 'string' || !PAYPAL_ORDER_ID.test(paypalOrderId)) return null
  return { orderId, paypalOrderId }
}

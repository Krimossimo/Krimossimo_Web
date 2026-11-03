/**
 * Simulateur HTTP de l'API PayPal Sandbox (tests et banc d'essai uniquement, jamais déployé).
 *
 * Reproduit le comportement documenté des points d'accès utilisés par paypal.ts :
 *  - OAuth (client ID + secret obligatoires), jeton Bearer vérifié ;
 *  - Orders v2 : création, lecture, capture, idempotence par PayPal-Request-Id
 *    (une requête rejouée reçoit EXACTEMENT la même réponse, erreurs comprises) ;
 *  - refus de capture (422 ORDER_NOT_APPROVED, ORDER_ALREADY_CAPTURED, INSTRUMENT_DECLINED,
 *    TRANSACTION_REFUSED), capture PENDING ou DECLINED ;
 *  - vérification de signature des webhooks (corps de l'événement comparé octet pour octet).
 * Il permet aussi de simuler des pannes réseau avant ou après le traitement par PayPal.
 * Ce n'est PAS le vrai Sandbox : la procédure de test réelle est dans docs/paypal.md.
 */
import { createHmac, randomBytes } from 'node:crypto'

type Json = Record<string, unknown>

/** Issue de la prochaine capture d'une commande approuvée. */
export type CaptureScenario =
  | 'completed'
  | 'pending'
  | 'declined'
  | 'instrument_declined'
  | 'refused'
  | 'network_before'
  | 'network_after'
  | 'server_error'

export type SandboxOrder = {
  id: string
  status: 'PAYER_ACTION_REQUIRED' | 'APPROVED' | 'COMPLETED' | 'VOIDED'
  purchase_units: Json[]
  createdBy: string
}

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

export function paypalSandbox({ clientId = 'sandbox-client-id', clientSecret = 'sandbox-secret' } = {}) {
  const token = `A21AA${randomBytes(12).toString('hex')}`
  const orders = new Map<string, SandboxOrder>()
  const idempotent = new Map<string, { status: number; body: unknown }>()
  const signingKey = randomBytes(16)
  const calls: { method: string; path: string; requestId?: string }[] = []
  let seq = 0
  const id = (prefix: string) => `${prefix}${String(++seq).padStart(17 - prefix.length, '0')}`

  const sim = {
    clientId,
    clientSecret,
    orders,
    calls,
    /** File des issues des prochaines captures (par défaut : completed). */
    captures: [] as CaptureScenario[],
    /** Montant réellement capturé (pour simuler une capture non conforme). */
    tamperCapturedValue: null as string | null,
    /** PayPal injoignable pour toutes les requêtes. */
    offline: false,
    /** Le client approuve la commande dans la fenêtre PayPal. */
    approve(paypalOrderId: string): boolean {
      const order = orders.get(paypalOrderId)
      if (!order || order.status !== 'PAYER_ACTION_REQUIRED') return false
      order.status = 'APPROVED'
      return true
    },
    /** La commande expire chez PayPal (plus de 3 h sans approbation). */
    expire(paypalOrderId: string) {
      orders.delete(paypalOrderId)
    },
    /** Commande créée directement chez PayPal (par ex. par un client malveillant avec le client ID public). */
    foreignOrder(value: string, referenceId: string): string {
      const order: SandboxOrder = {
        id: id('FOREIGN'),
        status: 'PAYER_ACTION_REQUIRED',
        purchase_units: [{ reference_id: referenceId, custom_id: referenceId, amount: { currency_code: 'EUR', value } }],
        createdBy: 'browser',
      }
      orders.set(order.id, order)
      return order.id
    },
    /** Événement webhook signé, tel que PayPal l'enverrait. */
    webhook(eventType: string, paypalOrderId: string, { tamperSignature = false } = {}) {
      const order = orders.get(paypalOrderId)
      const unit = order?.purchase_units[0] ?? {}
      const capture = isRecord(unit.payments) && Array.isArray(unit.payments.captures) ? (unit.payments.captures[0] as Json) : {}
      const resource = eventType.startsWith('CHECKOUT.ORDER.')
        ? { id: paypalOrderId, status: order?.status, purchase_units: [{ reference_id: unit.reference_id, custom_id: unit.custom_id }] }
        : { ...capture, custom_id: unit.custom_id, supplementary_data: { related_ids: { order_id: paypalOrderId } } }
      const rawBody = JSON.stringify({ id: `WH-${id('EVT')}`, event_type: eventType, resource_type: 'capture', resource })
      const transmissionId = randomBytes(8).toString('hex')
      const sig = createHmac('sha256', signingKey).update(`${transmissionId}|${rawBody}`).digest('base64')
      return {
        rawBody,
        headers: {
          authAlgo: 'SHA256withRSA',
          certUrl: 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-a5cafa77',
          transmissionId,
          transmissionSig: tamperSignature ? `${sig.slice(0, -4)}AAAA` : sig,
          transmissionTime: new Date().toISOString(),
        },
      }
    },
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const method = (init?.method ?? 'GET').toUpperCase()
      const headers = new Headers(init?.headers)
      const requestId = headers.get('PayPal-Request-Id') ?? undefined
      calls.push({ method, path: url.pathname, requestId })
      if (sim.offline) throw new TypeError('fetch failed')
      if (url.hostname !== 'api-m.sandbox.paypal.com') throw new TypeError(`unexpected host ${url.hostname}`)
      const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

      if (url.pathname === '/v1/oauth2/token') {
        const expected = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        if (headers.get('Authorization') !== expected) return respond(401, { error: 'invalid_client' })
        return respond(200, { access_token: token, token_type: 'Bearer', expires_in: 32400 })
      }
      if (headers.get('Authorization') !== `Bearer ${token}`) return respond(401, { name: 'AUTHENTICATION_FAILURE' })
      const body = typeof init?.body === 'string' && init.body ? (JSON.parse(init.body) as Json) : {}

      // Idempotence : même clé → même réponse, sans nouveau traitement.
      if (requestId && idempotent.has(`${url.pathname}|${requestId}`)) {
        const cached = idempotent.get(`${url.pathname}|${requestId}`)!
        return respond(cached.status, cached.body)
      }
      const remember = (status: number, out: unknown) => {
        if (requestId) idempotent.set(`${url.pathname}|${requestId}`, { status, body: out })
        return respond(status, out)
      }

      if (method === 'POST' && url.pathname === '/v2/checkout/orders') {
        const unit = Array.isArray(body.purchase_units) && isRecord(body.purchase_units[0]) ? body.purchase_units[0] : null
        const amount = unit && isRecord(unit.amount) ? unit.amount : null
        if (body.intent !== 'CAPTURE' || !unit || !amount) return remember(400, { name: 'INVALID_REQUEST', details: [{ issue: 'MISSING_REQUIRED_PARAMETER' }] })
        const items = Array.isArray(unit.items) ? (unit.items as Json[]) : []
        const itemTotal = items.reduce((sum, item) => sum + Number((item.unit_amount as Json).value) * Number(item.quantity), 0)
        if (items.length && itemTotal.toFixed(2) !== amount.value) return remember(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ITEM_TOTAL_MISMATCH' }] })
        const order: SandboxOrder = {
          id: id('PAY'),
          status: 'PAYER_ACTION_REQUIRED',
          purchase_units: [{ reference_id: unit.reference_id, custom_id: unit.custom_id, invoice_id: unit.invoice_id, amount }],
          createdBy: 'server',
        }
        orders.set(order.id, order)
        return remember(200, structuredClone(order))
      }

      const match = url.pathname.match(/^\/v2\/checkout\/orders\/([A-Z0-9]+)(\/capture)?$/)
      if (match) {
        const order = orders.get(match[1]!)
        if (!order) return respond(404, { name: 'RESOURCE_NOT_FOUND', details: [{ issue: 'INVALID_RESOURCE_ID' }] })
        if (method === 'GET' && !match[2]) return respond(200, structuredClone(order))
        if (method === 'POST' && match[2]) {
          if (order.status === 'COMPLETED') return remember(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] })
          if (order.status !== 'APPROVED') return remember(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_NOT_APPROVED' }] })
          const scenario = sim.captures.shift() ?? 'completed'
          if (scenario === 'network_before') throw new TypeError('fetch failed')
          if (scenario === 'server_error') return respond(500, { name: 'INTERNAL_SERVER_ERROR' })
          if (scenario === 'instrument_declined') {
            // Le client doit choisir un autre moyen de paiement (actions.restart() côté navigateur).
            order.status = 'PAYER_ACTION_REQUIRED'
            return remember(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'INSTRUMENT_DECLINED' }] })
          }
          if (scenario === 'refused') return remember(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'TRANSACTION_REFUSED' }] })
          const unit = order.purchase_units[0]!
          const amount = structuredClone(unit.amount as Json)
          if (sim.tamperCapturedValue) amount.value = sim.tamperCapturedValue
          const status = scenario === 'pending' ? 'PENDING' : scenario === 'declined' ? 'DECLINED' : 'COMPLETED'
          unit.payments = { captures: [{ id: id('CAP'), status, amount, custom_id: unit.custom_id, final_capture: true }] }
          order.status = 'COMPLETED'
          const out = remember(201, structuredClone(order))
          // Capture effectuée chez PayPal, mais la réponse n'arrive jamais au serveur.
          if (scenario === 'network_after') throw new TypeError('fetch failed')
          return out
        }
      }

      if (method === 'POST' && url.pathname === '/v1/notifications/verify-webhook-signature') {
        const raw = typeof init?.body === 'string' ? init.body : ''
        const marker = raw.indexOf('"webhook_event":')
        const eventRaw = marker >= 0 ? raw.slice(marker + '"webhook_event":'.length, -1) : ''
        const expected = createHmac('sha256', signingKey).update(`${String(body.transmission_id)}|${eventRaw}`).digest('base64')
        return respond(200, { verification_status: body.transmission_sig === expected ? 'SUCCESS' : 'FAILURE' })
      }

      return respond(404, { name: 'RESOURCE_NOT_FOUND' })
    }) as typeof fetch,
  }
  return sim
}

export type PayPalSandbox = ReturnType<typeof paypalSandbox>

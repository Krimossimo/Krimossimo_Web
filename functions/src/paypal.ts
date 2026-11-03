/**
 * Client REST PayPal (Orders v2 + vérification des webhooks), côté serveur uniquement.
 * Le client secret ne quitte jamais les Cloud Functions et n'est jamais journalisé.
 *
 * `fetch` est injectable : les tests utilisent un simulateur de l'API Sandbox
 * (payments.test.ts) qui reproduit ses statuts, ses refus et son idempotence.
 */
import { centsToValue, type Currency, type PricedItem } from './orders.js'

export type PayPalEnv = 'sandbox' | 'live'
export type PayPalConfig = { clientId: string; clientSecret: string; env: PayPalEnv }

/** Réponse HTTP d'erreur de PayPal : la requête a été traitée et refusée. */
export class PayPalError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly issue?: string,
    readonly debugId?: string,
  ) {
    super(`PayPal HTTP ${httpStatus}${issue ? ` (${issue})` : ''}${debugId ? ` debug_id=${debugId}` : ''}`)
    this.name = 'PayPalError'
  }
}

/**
 * PayPal injoignable (réseau, délai dépassé) : l'issue de la requête est INCONNUE.
 * Pour une capture, l'argent a peut-être été encaissé : il faut relire la commande chez
 * PayPal avant toute nouvelle tentative, jamais en créer une autre.
 */
export class PayPalUnreachable extends Error {
  constructor(readonly operation: string) {
    super(`PayPal unreachable during ${operation}`)
    this.name = 'PayPalUnreachable'
  }
}

export function paypalBaseUrl(env: PayPalEnv): string {
  return env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
}

/** Commande PayPal telle que renvoyée par PayPal (champs utilisés uniquement). */
export type PayPalOrder = { id: string; status: string; [key: string]: unknown }

export type CreatePayPalOrderInput = {
  orderId: string
  attempt: number
  currency: Currency
  totalCents: number
  items: PricedItem[]
  payer?: { firstName: string; lastName: string }
}

export type WebhookHeaders = {
  authAlgo?: string
  certUrl?: string
  transmissionId?: string
  transmissionSig?: string
  transmissionTime?: string
}

export type PayPalApi = {
  readonly env: PayPalEnv
  readonly clientId: string
  createOrder(input: CreatePayPalOrderInput): Promise<PayPalOrder>
  /** null si PayPal ne connaît pas (ou plus) cette commande. */
  getOrder(paypalOrderId: string): Promise<PayPalOrder | null>
  /**
   * mock : Sandbox UNIQUEMENT (« negative testing » de PayPal, par ex. INSTRUMENT_DECLINED) ;
   * ignoré en Live. Utilisé par scripts/paypal-sandbox.ts, jamais par les fonctions.
   */
  captureOrder(paypalOrderId: string, requestId: string, options?: { mock?: string }): Promise<PayPalOrder>
  verifyWebhook(webhookId: string, headers: WebhookHeaders, rawBody: string): Promise<boolean>
}

type Options = { fetch?: typeof fetch; now?: () => number; timeoutMs?: number }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Les certificats de signature des webhooks sont servis par PayPal uniquement. */
export function isPayPalCertUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && (parsed.hostname === 'paypal.com' || parsed.hostname.endsWith('.paypal.com'))
  } catch {
    return false
  }
}

export function createPayPalClient(config: PayPalConfig, options: Options = {}): PayPalApi {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis)
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? 20000
  const base = paypalBaseUrl(config.env)
  let cached: { value: string; expiresAt: number } | null = null

  async function send(url: string, init: RequestInit, operation: string): Promise<Response> {
    try {
      return await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    } catch {
      throw new PayPalUnreachable(operation)
    }
  }

  async function accessToken(force = false): Promise<string> {
    if (!force && cached && cached.expiresAt > now()) return cached.value
    const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
    const res = await send(
      `${base}/v1/oauth2/token`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
      },
      'auth',
    )
    if (!res.ok) throw new PayPalError(res.status, 'auth')
    const data = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null
    if (typeof data?.access_token !== 'string') throw new PayPalError(502, 'auth_response')
    const ttl = typeof data.expires_in === 'number' ? data.expires_in : 300
    // Marge d'une minute avant l'expiration annoncée par PayPal.
    cached = { value: data.access_token, expiresAt: now() + Math.max(ttl - 60, 0) * 1000 }
    return cached.value
  }

  async function call(
    method: string,
    path: string,
    { body, rawBody, requestId, operation, mock }: { body?: unknown; rawBody?: string; requestId?: string; operation: string; mock?: string },
  ): Promise<{ status: number; data: unknown }> {
    for (let attempt = 0; ; attempt++) {
      const token = await accessToken(attempt > 0)
      const res = await send(
        `${base}${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
            // Idempotence : un même identifiant ne crée/capture qu'une fois, même si l'appel est rejoué.
            ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
            ...(mock && config.env === 'sandbox' ? { 'PayPal-Mock-Response': JSON.stringify({ mock_application_codes: mock }) } : {}),
          },
          body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
        },
        operation,
      )
      // Jeton expiré ou révoqué : un seul nouvel essai avec un jeton neuf.
      if (res.status === 401 && attempt === 0) continue
      const data: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        const details = isRecord(data) && Array.isArray(data.details) ? data.details : []
        const issue = isRecord(details[0]) && typeof details[0].issue === 'string' ? details[0].issue : isRecord(data) && typeof data.name === 'string' ? data.name : undefined
        const debugId = isRecord(data) && typeof data.debug_id === 'string' ? data.debug_id : undefined
        throw new PayPalError(res.status, issue, debugId)
      }
      return { status: res.status, data }
    }
  }

  const asOrder = (data: unknown, operation: string): PayPalOrder => {
    if (!isRecord(data) || typeof data.id !== 'string' || typeof data.status !== 'string') throw new PayPalError(502, `${operation}_response`)
    return data as PayPalOrder
  }

  return {
    env: config.env,
    clientId: config.clientId,

    /** Crée la commande PayPal pour le montant FIGÉ par le serveur (jamais celui du navigateur). */
    async createOrder(input) {
      const value = centsToValue(input.totalCents)
      const { data } = await call('POST', '/v2/checkout/orders', {
        operation: 'create',
        requestId: `${input.orderId}-create-${input.attempt}`,
        body: {
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: input.orderId,
              custom_id: input.orderId,
              invoice_id: `KRIM-${input.orderId}-${input.attempt}`,
              description: 'Krimossimo',
              amount: { currency_code: input.currency, value, breakdown: { item_total: { currency_code: input.currency, value } } },
              items: input.items.map((item) => ({
                name: item.title.slice(0, 127),
                quantity: String(item.quantity),
                category: 'DIGITAL_GOODS',
                unit_amount: { currency_code: input.currency, value: centsToValue(item.unitCents) },
              })),
            },
          ],
          payment_source: {
            paypal: {
              ...(input.payer ? { name: { given_name: input.payer.firstName.slice(0, 140), surname: input.payer.lastName.slice(0, 140) } } : {}),
              experience_context: { brand_name: 'Krimossimo', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
            },
          },
        },
      })
      return asOrder(data, 'create')
    },

    async getOrder(paypalOrderId) {
      try {
        const { data } = await call('GET', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, { operation: 'get' })
        return asOrder(data, 'get')
      } catch (error) {
        if (error instanceof PayPalError && error.httpStatus === 404) return null
        throw error
      }
    },

    /** Capture le paiement approuvé ; la réponse est vérifiée par verifyCapture(). */
    async captureOrder(paypalOrderId, requestId, options) {
      const { data } = await call('POST', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
        operation: 'capture',
        requestId,
        body: {},
        mock: options?.mock,
      })
      return asOrder(data, 'capture')
    },

    /**
     * Vérifie l'authenticité d'un webhook auprès de PayPal. Le corps de l'événement est
     * transmis OCTET POUR OCTET (rawBody) : le re-sérialiser ferait échouer la vérification.
     */
    async verifyWebhook(webhookId, headers, rawBody) {
      const { authAlgo, certUrl, transmissionId, transmissionSig, transmissionTime } = headers
      if (!authAlgo || !transmissionId || !transmissionSig || !transmissionTime || !isPayPalCertUrl(certUrl)) return false
      const payload =
        `{"auth_algo":${JSON.stringify(authAlgo)},"cert_url":${JSON.stringify(certUrl)},` +
        `"transmission_id":${JSON.stringify(transmissionId)},"transmission_sig":${JSON.stringify(transmissionSig)},` +
        `"transmission_time":${JSON.stringify(transmissionTime)},"webhook_id":${JSON.stringify(webhookId)},` +
        `"webhook_event":${rawBody}}`
      try {
        const { data } = await call('POST', '/v1/notifications/verify-webhook-signature', { operation: 'verify', rawBody: payload })
        return isRecord(data) && data.verification_status === 'SUCCESS'
      } catch (error) {
        // 400 : signature ou en-têtes rejetés par PayPal.
        if (error instanceof PayPalError && error.httpStatus === 400) return false
        throw error
      }
    },
  }
}

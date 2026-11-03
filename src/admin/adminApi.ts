/**
 * Client des fonctions d'administration (adminUpdateOrder, adminUpdateMessage).
 *
 * Chaque appel joint le jeton d'identité Firebase de l'administrateur connecté.
 * Le serveur vérifie ce jeton (signature, expiration, révocation) et le claim
 * { admin: true } avant toute action : le navigateur ne décide d'aucune permission.
 */
import { isValidApiBaseUrl } from '../lib/orders'

const env: Partial<ImportMetaEnv> = import.meta.env ?? {}

export const fulfillmentStatuses = ['todo', 'in_progress', 'delivered'] as const
export type FulfillmentStatus = (typeof fulfillmentStatuses)[number]

export const messageStatuses = ['new', 'read', 'archived'] as const
export type MessageStatus = (typeof messageStatuses)[number]

export type AdminApiErrorCode =
  | 'not-configured'
  | 'unauthenticated'
  | 'forbidden'
  | 'invalid-request'
  | 'not-found'
  | 'invalid-state'
  | 'network'
  | 'timeout'
  | 'server'

export class AdminApiError extends Error {
  constructor(readonly code: AdminApiErrorCode) {
    super(`Admin API error: ${code}`)
    this.name = 'AdminApiError'
  }
}

const fromHttp: Record<number, AdminApiErrorCode> = {
  400: 'invalid-request',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not-found',
  409: 'invalid-state',
}

export type AdminClientOptions = {
  baseUrl: string
  getToken: () => Promise<string>
  fetch?: typeof fetch
  timeoutMs?: number
}

export function createAdminClient({ baseUrl, getToken, fetch: fetchImpl, timeoutMs = 20000 }: AdminClientOptions) {
  const root = baseUrl.trim().replace(/\/+$/, '')
  const configured = isValidApiBaseUrl(root)

  async function call(name: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!configured) throw new AdminApiError('not-configured')
    let token: string
    try {
      token = await getToken()
    } catch {
      throw new AdminApiError('unauthenticated')
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await (fetchImpl ?? globalThis.fetch.bind(globalThis))(`${root}/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        credentials: 'omit',
        signal: controller.signal,
      })
    } catch {
      throw new AdminApiError(controller.signal.aborted ? 'timeout' : 'network')
    } finally {
      clearTimeout(timer)
    }
    if (!response.ok) throw new AdminApiError(fromHttp[response.status] ?? 'server')
    try {
      const data: unknown = await response.json()
      return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  return {
    isConfigured: configured,
    /** Suivi de réalisation d'une commande payée (le statut de paiement n'est jamais modifiable). */
    async updateOrderFulfillment(orderId: string, fulfillment: FulfillmentStatus, note?: string): Promise<FulfillmentStatus> {
      const data = await call('adminUpdateOrder', { orderId, fulfillment, ...(note ? { note } : {}) })
      if (!(fulfillmentStatuses as readonly unknown[]).includes(data.fulfillment)) throw new AdminApiError('server')
      return data.fulfillment as FulfillmentStatus
    },
    async updateMessageStatus(messageId: string, status: MessageStatus): Promise<MessageStatus> {
      const data = await call('adminUpdateMessage', { messageId, status })
      if (!(messageStatuses as readonly unknown[]).includes(data.status)) throw new AdminApiError('server')
      return data.status as MessageStatus
    },
  }
}

export type AdminClient = ReturnType<typeof createAdminClient>

export const adminBaseUrl = (env.VITE_FUNCTIONS_BASE_URL ?? '').trim()

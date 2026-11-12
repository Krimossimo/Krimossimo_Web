/**
 * Envoi d'e-mails par Web3Forms (gratuit, sans serveur) : formulaire de contact et commandes.
 *
 * La clé d'accès (VITE_WEB3FORMS_ACCESS_KEY) est publique par conception : elle ne permet
 * que d'envoyer vers l'adresse e-mail liée à la clé. Voir docs/integrations.md.
 */

const env: Partial<ImportMetaEnv> = import.meta.env ?? {}

export const web3formsAccessKey = (env.VITE_WEB3FORMS_ACCESS_KEY ?? '').trim()
export const WEB3FORMS_URL = 'https://api.web3forms.com/submit'

export type Web3FormsErrorCode = 'network' | 'timeout' | 'rate-limited' | 'server'

export class Web3FormsError extends Error {
  constructor(
    readonly code: Web3FormsErrorCode,
    readonly status?: number,
  ) {
    super(`Web3Forms: ${code}${status ? ` (HTTP ${status})` : ''}.`)
    this.name = 'Web3FormsError'
  }
}

/**
 * Envoie les champs à Web3Forms, qui les transmet par e-mail.
 * Résout uniquement si Web3Forms répond { success: true } (e-mail accepté et transmis).
 */
export async function postWeb3Forms(
  fields: Record<string, string | boolean>,
  {
    accessKey = web3formsAccessKey,
    fetch: doFetch = (...args: Parameters<typeof fetch>) => fetch(...args),
    timeoutMs = 20000,
  }: { accessKey?: string; fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await doFetch(WEB3FORMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ access_key: accessKey, ...fields, botcheck: false }),
      credentials: 'omit',
      signal: controller.signal,
    })
  } catch {
    throw new Web3FormsError(controller.signal.aborted ? 'timeout' : 'network')
  } finally {
    clearTimeout(timeout)
  }

  const data: unknown = await response.json().catch(() => null)
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
  if (response.status === 429) throw new Web3FormsError('rate-limited', 429)
  if (!response.ok || record.success !== true) throw new Web3FormsError('server', response.status)
}

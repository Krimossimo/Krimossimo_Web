/**
 * Formulaire de contact : validation et envoi.
 *
 * Deux façons d'envoyer, au choix :
 *  - Web3Forms (gratuit, sans serveur) : si VITE_WEB3FORMS_ACCESS_KEY est renseignée, le message
 *    est envoyé à api.web3forms.com, qui le transmet par e-mail à l'adresse liée à la clé.
 *    Cette clé est publique par conception : elle ne permet que d'envoyer vers CETTE adresse.
 *    Elle est prioritaire sur VITE_CONTACT_ENDPOINT. Voir docs/integrations.md.
 *  - Cloud Function submitContact (nécessite le forfait Blaze), décrite ci-dessous.
 *
 * L'envoi passe par la Cloud Function submitContact (functions/src/contactService.ts) qui
 * revalide les données, filtre le spam et envoie l'e-mail par SMTP (identifiants côté
 * serveur uniquement). Son URL publique se règle avec VITE_CONTACT_ENDPOINT. Tant qu'elle
 * est vide, sendContactMessage() refuse d'envoyer et l'interface l'indique : aucun envoi
 * n'est simulé. Le succès n'est affiché que si le serveur confirme { ok: true, delivered: true },
 * c'est-à-dire après acceptation de l'e-mail par le serveur SMTP.
 */
import { contactSubjects, type ContactSubject } from '../types/content'
import { EMAIL_PATTERN } from './patterns'
import fr from '../i18n/locales/fr.json'
import { WEB3FORMS_URL, Web3FormsError, postWeb3Forms, web3formsAccessKey } from './web3forms'

export { WEB3FORMS_URL }

export const contactLimits = {
  name: 80,
  email: 254,
  messageMin: 20,
  messageMax: 2000,
  /** Liens autorisés dans un message (au-delà, le serveur le refuse comme spam). */
  links: 3,
} as const

export type ContactValues = {
  lastName: string
  firstName: string
  email: string
  subject: ContactSubject | ''
  message: string
  /** Champ piège invisible : doit rester vide (les robots le remplissent). */
  website: string
}

export type ContactField = Exclude<keyof ContactValues, 'website'>

export type ContactError =
  | { code: 'required' }
  | { code: 'email' }
  | { code: 'subject' }
  | { code: 'tooShort'; min: number }
  | { code: 'tooLong'; max: number }
  | { code: 'links'; max: number }

export type ContactErrors = Partial<Record<ContactField, ContactError>>

export const emptyContact: ContactValues = {
  lastName: '',
  firstName: '',
  email: '',
  subject: '',
  message: '',
  website: '',
}


export function isContactSubject(value: string | null): value is ContactSubject {
  return contactSubjects.includes(value as ContactSubject)
}

export function validateField(field: ContactField, values: ContactValues): ContactError | undefined {
  const value = values[field].trim()
  switch (field) {
    case 'lastName':
    case 'firstName':
      if (!value) return { code: 'required' }
      if (value.length > contactLimits.name) return { code: 'tooLong', max: contactLimits.name }
      return undefined
    case 'email':
      if (!value) return { code: 'required' }
      if (value.length > contactLimits.email) return { code: 'tooLong', max: contactLimits.email }
      if (!EMAIL_PATTERN.test(value)) return { code: 'email' }
      return undefined
    case 'subject':
      return isContactSubject(value) ? undefined : { code: 'subject' }
    case 'message':
      if (!value) return { code: 'required' }
      if (value.length < contactLimits.messageMin) return { code: 'tooShort', min: contactLimits.messageMin }
      if (value.length > contactLimits.messageMax) return { code: 'tooLong', max: contactLimits.messageMax }
      if ((value.match(/(https?:\/\/|www\.)/gi) ?? []).length > contactLimits.links) return { code: 'links', max: contactLimits.links }
      return undefined
  }
}

export const contactFields: ContactField[] = ['lastName', 'firstName', 'email', 'subject', 'message']

export function validateContact(values: ContactValues): ContactErrors {
  const errors: ContactErrors = {}
  for (const field of contactFields) {
    const error = validateField(field, values)
    if (error) errors[field] = error
  }
  return errors
}

/* ------------------------------------------------------------------- Envoi */

const env: Partial<ImportMetaEnv> = import.meta.env ?? {}
const endpoint = (env.VITE_CONTACT_ENDPOINT ?? '').trim()
/** Délai minimal sur le formulaire avant envoi (anti-robots), comme côté serveur. */
export const MIN_FILL_MS = 3000

export const isContactConfigured = web3formsAccessKey.length > 0 || endpoint.length > 0

export class ContactNotConfiguredError extends Error {
  constructor() {
    super('Contact endpoint is not configured (VITE_CONTACT_ENDPOINT).')
    this.name = 'ContactNotConfiguredError'
  }
}

export type ContactSendErrorCode =
  | 'network'
  | 'timeout'
  | 'rate-limited'
  | 'too-fast'
  | 'too-many-links'
  | 'invalid'
  | 'mail-failed'
  | 'server'

export class ContactSendError extends Error {
  constructor(
    readonly code: ContactSendErrorCode = 'server',
    readonly status?: number,
  ) {
    super(`Contact message could not be sent: ${code}${status ? ` (HTTP ${status})` : ''}.`)
    this.name = 'ContactSendError'
  }
}

const serverErrors: Record<string, ContactSendErrorCode> = {
  rate_limited: 'rate-limited',
  too_fast: 'too-fast',
  too_many_links: 'too-many-links',
  invalid_request: 'invalid',
  mail_failed: 'mail-failed',
}

/**
 * Envoie le message. `elapsedMs` = temps passé sur le formulaire (anti-robots côté serveur).
 * Résout uniquement si le serveur confirme l'envoi de l'e-mail ; sinon lève une erreur précise.
 */
export async function sendContactMessage(
  values: ContactValues,
  locale: 'fr' | 'en',
  elapsedMs: number,
  {
    url = endpoint,
    web3formsKey = web3formsAccessKey,
    fetch: doFetch = (...args: Parameters<typeof fetch>) => fetch(...args),
    timeoutMs = 20000,
  }: { url?: string; web3formsKey?: string; fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<void> {
  if (web3formsKey) return sendWithWeb3Forms(values, locale, elapsedMs, web3formsKey, doFetch, timeoutMs)
  if (!url) throw new ContactNotConfiguredError()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastName: values.lastName.trim(),
        firstName: values.firstName.trim(),
        email: values.email.trim(),
        subject: values.subject,
        message: values.message.trim(),
        website: values.website,
        locale,
        elapsedMs: Math.max(0, Math.round(elapsedMs)),
      }),
      credentials: 'omit',
      signal: controller.signal,
    })
  } catch {
    throw new ContactSendError(controller.signal.aborted ? 'timeout' : 'network')
  } finally {
    clearTimeout(timeout)
  }

  const data: unknown = await response.json().catch(() => null)
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
  if (!response.ok) {
    if (record.error === 'mail_not_configured') throw new ContactNotConfiguredError()
    const code = typeof record.error === 'string' ? serverErrors[record.error] : undefined
    throw new ContactSendError(code ?? (response.status === 429 ? 'rate-limited' : 'server'), response.status)
  }
  // Confirmation explicite exigée : une réponse 2xx sans elle n'est pas un envoi réussi.
  if (record.ok !== true || record.delivered !== true) throw new ContactSendError('server', response.status)
}

/** Envoi par Web3Forms (voir lib/web3forms.ts). */
async function sendWithWeb3Forms(
  values: ContactValues,
  locale: 'fr' | 'en',
  elapsedMs: number,
  accessKey: string,
  doFetch: typeof fetch,
  timeoutMs: number,
): Promise<void> {
  // Mêmes protections que la fonction serveur, faites ici faute de serveur à nous.
  if (values.website) throw new ContactSendError('invalid')
  if (elapsedMs < MIN_FILL_MS) throw new ContactSendError('too-fast')

  const name = `${values.firstName.trim()} ${values.lastName.trim()}`
  const subjectLabel = values.subject ? fr.contact.subjects[values.subject] : ''
  try {
    await postWeb3Forms(
      {
        subject: `[Krimossimo] ${subjectLabel} : ${name}`,
        from_name: 'Site Krimossimo',
        name,
        email: values.email.trim(),
        replyto: values.email.trim(),
        sujet: subjectLabel,
        langue: locale === 'en' ? 'Anglais' : 'Français',
        message: values.message.trim(),
      },
      { accessKey, fetch: doFetch, timeoutMs },
    )
  } catch (error) {
    throw new ContactSendError(error instanceof Web3FormsError ? error.code : 'server', error instanceof Web3FormsError ? error.status : undefined)
  }
}

/**
 * Service du formulaire de contact — sans dépendance à Firebase (testé par contactService.test.ts).
 *
 * Ordre des contrôles : piège anti-robots → délai de saisie → validation complète →
 * service d'envoi configuré ? → limite de débit par IP → enregistrement → envoi de l'e-mail.
 * La réponse « ok » n'est donnée qu'après un envoi ACCEPTÉ par le serveur SMTP ; sinon une
 * erreur explicite est renvoyée et le message reste consultable dans l'administration.
 */
import { CONTACT_RATE_LIMIT, buildContactEmail, validateContactMessage, type ContactMessage } from './contact.js'
import type { Mailer } from './mailer.js'
import type { Logger, Reply } from './payments.js'

export type ContactDelivery = 'pending' | 'sent' | 'failed'

export type ContactRecord = ContactMessage & { status: 'new'; delivery: ContactDelivery; createdAt: Date }

export interface ContactStore {
  allow(clientKey: string, max: number, windowMs: number): Promise<boolean>
  saveMessage(record: ContactRecord): Promise<string>
  setDelivery(messageId: string, delivery: Exclude<ContactDelivery, 'pending'>, at: Date): Promise<void>
}

export type ContactDeps = {
  store: ContactStore
  /** null : envoi non configuré (aucun message n'est alors accepté). */
  mailer: () => Mailer | null
  /** Adresse de réception (paramètre CONTACT_TO). */
  to: () => string
  now?: () => Date
  log?: Logger
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const silent: Logger = { info() {}, warn() {}, error() {} }

export function createContactService(deps: ContactDeps) {
  const now = deps.now ?? (() => new Date())
  const log = deps.log ?? silent

  return {
    async submit(body: Record<string, unknown>, clientKey: string): Promise<Reply> {
      const check = validateContactMessage(body)
      // Robot (champ piège rempli) : même réponse qu'un succès, rien n'est enregistré ni envoyé.
      if (!check.ok && check.spam) return { status: 200, json: { ok: true, delivered: true } }
      if (!check.ok && check.error === 'too_fast') return { status: 400, json: { error: 'too_fast' } }
      if (!check.ok && check.error === 'links') return { status: 400, json: { error: 'too_many_links' } }
      if (!check.ok) return { status: 400, json: { error: 'invalid_request', field: check.error } }

      const mailer = deps.mailer()
      const to = deps.to().trim()
      if (!mailer || !EMAIL.test(to)) {
        log.warn('contact form received but mail delivery is not configured')
        return { status: 503, json: { error: 'mail_not_configured' } }
      }
      if (!(await deps.store.allow(clientKey, CONTACT_RATE_LIMIT.max, CONTACT_RATE_LIMIT.windowMs))) {
        return { status: 429, json: { error: 'rate_limited', retryAfterMs: CONTACT_RATE_LIMIT.windowMs } }
      }

      const receivedAt = now()
      const id = await deps.store.saveMessage({ ...check.value, status: 'new', delivery: 'pending', createdAt: receivedAt })
      try {
        await mailer.send({ to, ...buildContactEmail(check.value, receivedAt, id) })
      } catch (error) {
        // Aucun détail (identifiants, adresse) dans les journaux : seulement le type d'erreur.
        log.error('contact mail delivery failed', { messageId: id, reason: error instanceof Error ? error.name : 'unknown' })
        await deps.store.setDelivery(id, 'failed', now()).catch(() => {})
        return { status: 502, json: { error: 'mail_failed' } }
      }
      await deps.store.setDelivery(id, 'sent', now()).catch(() => {})
      return { status: 201, json: { ok: true, delivered: true } }
    },
  }
}

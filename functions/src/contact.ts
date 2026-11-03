/**
 * Formulaire de contact côté serveur — logique pure (testée par contact.test.ts).
 * Mêmes règles que le formulaire du site (src/lib/contact.ts), revérifiées ici :
 * le navigateur n'est jamais considéré comme fiable.
 */
import { createHash } from 'node:crypto'

export const contactSubjects = ['website', 'software', 'promotion', 'other'] as const
export type ContactSubject = (typeof contactSubjects)[number]

export type ContactMessage = {
  lastName: string
  firstName: string
  email: string
  subject: ContactSubject
  message: string
  locale: 'fr' | 'en'
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function text(v: unknown, min: number, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length >= min && s.length <= max ? s : null
}

export type ContactCheck = { ok: true; value: ContactMessage } | { ok: false; error: string; spam?: true }

/** Délai minimal de saisie (ms) : un formulaire envoyé plus vite est l'œuvre d'un robot. */
export const MIN_FILL_MS = 3000
/** Nombre maximal de liens dans un message (au-delà : spam publicitaire). */
export const MAX_LINKS = 3

/**
 * Caractères de contrôle : interdits dans les noms (retours à la ligne compris : pas d'injection
 * d'en-têtes) ; dans le message, seuls tabulation et retours à la ligne sont admis.
 */
function hasControl(value: string, allowLineBreaks: boolean): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if ((code < 32 || code === 127) && !(allowLineBreaks && (code === 9 || code === 10 || code === 13))) return true
  }
  return false
}
const LINK = /(https?:\/\/|www\.)/gi

function name(v: unknown): string | null {
  const s = text(v, 1, 80)
  // Un nom ne contient ni balise ni lien : signes typiques du spam.
  return s && !hasControl(s, false) && !/[<>]/.test(s) && !/(https?:\/\/|www\.)/i.test(s) ? s : null
}

export function validateContactMessage(body: unknown): ContactCheck {
  if (!isRecord(body)) return { ok: false, error: 'body' }
  // Champ piège invisible : rempli = robot. Le serveur répond comme pour un succès sans rien enregistrer ni envoyer.
  if (typeof body.website === 'string' && body.website.trim() !== '') return { ok: false, error: 'honeypot', spam: true }
  // Durée de saisie mesurée par le formulaire : absente ou trop courte = envoi automatisé.
  if (typeof body.elapsedMs !== 'number' || !Number.isFinite(body.elapsedMs) || body.elapsedMs < MIN_FILL_MS) return { ok: false, error: 'too_fast' }
  const lastName = name(body.lastName)
  if (!lastName) return { ok: false, error: 'lastName' }
  const firstName = name(body.firstName)
  if (!firstName) return { ok: false, error: 'firstName' }
  const email = text(body.email, 3, 254)
  if (!email || !EMAIL.test(email)) return { ok: false, error: 'email' }
  if (typeof body.subject !== 'string' || !(contactSubjects as readonly string[]).includes(body.subject)) return { ok: false, error: 'subject' }
  const message = text(body.message, 20, 2000)
  if (!message || hasControl(message, true)) return { ok: false, error: 'message' }
  if ((message.match(LINK) ?? []).length > MAX_LINKS) return { ok: false, error: 'links' }
  const locale = body.locale === 'en' ? 'en' : 'fr'
  return { ok: true, value: { lastName, firstName, email, subject: body.subject as ContactSubject, message, locale } }
}

/* ------------------------------------------------------------ E-mail */

const subjectLabels: Record<ContactSubject, string> = {
  website: 'Création de site web',
  software: 'Application ou logiciel',
  promotion: 'Mise en avant de produit',
  other: 'Autre demande',
}

export type ContactEmail = { subject: string; text: string; replyTo: { name: string; address: string } }

/**
 * E-mail envoyé à la boîte de contact : texte brut uniquement (aucun HTML interprété),
 * « Répondre » adressé au visiteur. Les noms ne contiennent aucun retour à la ligne
 * (validateContactMessage) : pas d'injection d'en-têtes possible.
 */
export function buildContactEmail(message: ContactMessage, receivedAt: Date, messageId: string): ContactEmail {
  const fullName = `${message.firstName} ${message.lastName}`
  return {
    subject: `[Krimossimo] ${subjectLabels[message.subject]} — ${fullName}`.slice(0, 200),
    replyTo: { name: fullName, address: message.email },
    text: [
      'Nouveau message reçu depuis le formulaire de contact du site Krimossimo.',
      '',
      `Nom : ${message.lastName}`,
      `Prénom : ${message.firstName}`,
      `E-mail : ${message.email}`,
      `Sujet : ${subjectLabels[message.subject]}`,
      `Langue du site : ${message.locale === 'en' ? 'anglais' : 'français'}`,
      `Reçu le : ${receivedAt.toISOString()}`,
      `Référence : ${messageId}`,
      '',
      'Message :',
      message.message,
      '',
      '—',
      'Répondez directement à cet e-mail pour écrire à la personne.',
    ].join('\n'),
  }
}

/* ------------------------------------------------------------ Anti-abus */

/**
 * Adresse du client pour le comptage anti-abus. Sans CDN devant les fonctions, l'infrastructure
 * Google AJOUTE l'adresse réelle en dernière position de X-Forwarded-For : les premières entrées
 * peuvent être inventées par le client, pas la dernière. À défaut, l'adresse de la connexion.
 */
export function clientIp(forwardedFor: unknown, fallback: unknown): string {
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor
  if (typeof header === 'string') {
    const last = header.split(',').map((part) => part.trim()).filter(Boolean).at(-1)
    if (last && last.length <= 64) return last
  }
  return typeof fallback === 'string' && fallback ? fallback : 'inconnue'
}

/** 5 messages par heure et par adresse IP. */
export const CONTACT_RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 }

/**
 * Clé de comptage : empreinte de l'IP et de la fenêtre horaire. L'adresse IP n'est jamais
 * stockée en clair ; l'empreinte n'est lisible par personne depuis le navigateur (règles) et
 * le compteur est supprimé automatiquement après la fenêtre (politique TTL sur expiresAt).
 */
export function rateLimitKey(ip: string, now: number, salt: string, windowMs = CONTACT_RATE_LIMIT.windowMs, scope = 'contact'): string {
  const window = Math.floor(now / windowMs)
  return createHash('sha256').update(`${salt}|${scope}|${ip}|${window}`).digest('hex').slice(0, 40)
}

/** Fin de la fenêtre en cours (utilisée comme date d'expiration TTL du compteur). */
export function rateLimitExpiry(now: number, windowMs = CONTACT_RATE_LIMIT.windowMs): number {
  return (Math.floor(now / windowMs) + 1) * windowMs
}

export function isOverLimit(countAfterThisAttempt: number, max = CONTACT_RATE_LIMIT.max): boolean {
  return countAfterThisAttempt > max
}

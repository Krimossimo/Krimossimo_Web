/**
 * Commandes SANS paiement en ligne (formule gratuite, sans Cloud Functions ni forfait Blaze).
 *
 * Le visiteur valide son panier et ses coordonnées ; la commande est :
 *  1. enregistrée dans Firestore (collection orderRequests, création seule, schéma vérifié par
 *     firestore.rules) pour être suivie dans l'administration ;
 *  2. envoyée par e-mail via Web3Forms (lib/web3forms.ts).
 * Le paiement se fait ensuite : Krimossimo envoie une facture / demande de paiement PayPal.
 *
 * Le montant enregistré est calculé par le navigateur à partir du catalogue : il est indicatif
 * et doit être vérifié avant facturation (rien n'est encaissé ici, il n'y a donc rien à fausser).
 * La commande n'est présentée comme reçue que si au moins un des deux envois est confirmé
 * (écriture Firestore acceptée ou réponse { success: true } de Web3Forms).
 */
import type { CartSummary } from '../cart/cart'
import type { Currency } from '../types/content'
import { getDb, isFirebaseConfigured } from './firebase'
import { buildOrderRequest, type CheckoutValues } from './checkout'
import { postWeb3Forms, web3formsAccessKey } from './web3forms'
import fr from '../i18n/locales/fr.json'

export const ORDER_REQUESTS = 'orderRequests'

/** Suivi d'une commande par l'administrateur. */
export const orderRequestStatuses = ['new', 'invoiced', 'paid', 'done', 'cancelled'] as const
export type OrderRequestStatus = (typeof orderRequestStatuses)[number]

/** Délai minimal passé sur le formulaire avant envoi (anti-robots). */
export const MIN_ORDER_FILL_MS = 4000

export const isOrderRequestConfigured = isFirebaseConfigured || web3formsAccessKey.length > 0

/** Référence lisible et unique : KRM-AAAAMMJJ-XXXXXX (sans 0/O ni 1/I pour la dicter sans erreur). */
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const REFERENCE_PATTERN = /^KRM-\d{8}-[A-HJ-NP-Z2-9]{6}$/

export function makeReference(now = new Date(), random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`
  const suffix = Array.from(random(6), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('')
  return `KRM-${date}-${suffix}`
}

export type OrderRequestDoc = {
  reference: string
  items: { offerId: string; title: string; quantity: number; unitCents: number }[]
  currency: Currency
  totalCents: number
  customer: { firstName: string; lastName: string; email: string; country: string; phone?: string; company?: string }
  project: { details: string; referenceUrl?: string; deadline?: string }
  locale: 'fr' | 'en'
  status: 'new'
}

/** Document Firestore de la commande (sans champs vides : Firestore refuse `undefined`). */
export function buildOrderRequestDoc(summary: CartSummary, values: CheckoutValues, locale: 'fr' | 'en', reference: string): OrderRequestDoc {
  if (!summary.currency || summary.lines.length === 0) throw new OrderRequestError('invalid')
  const request = buildOrderRequest(
    values,
    summary.lines.map((line) => ({ offerId: line.offer.id, quantity: line.quantity })),
    locale,
  )
  const compact = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
  return {
    reference,
    items: summary.lines.map((line) => ({
      offerId: line.offer.id,
      title: (typeof line.offer.title === 'string' ? line.offer.title : line.offer.title.fr).slice(0, 300),
      quantity: line.quantity,
      unitCents: line.unitCents,
    })),
    currency: summary.currency,
    totalCents: summary.totalCents,
    customer: compact(request.customer),
    project: compact(request.project),
    locale,
    status: 'new',
  }
}

const money = (cents: number, currency: Currency) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100)

/** Champs de l'e-mail envoyé au propriétaire du site (en français). */
export function orderRequestEmail(doc: OrderRequestDoc): Record<string, string> {
  const c = doc.customer
  const name = `${c.firstName} ${c.lastName}`
  const total = money(doc.totalCents, doc.currency)
  const fields: Record<string, string> = {
    subject: `[Krimossimo] Nouvelle commande ${doc.reference} : ${name} (${total})`,
    from_name: 'Site Krimossimo',
    name,
    email: c.email,
    replyto: c.email,
    commande: doc.reference,
    prestations: doc.items
      .map((i) => `${i.title}${i.quantity > 1 ? ` × ${i.quantity}` : ''} : ${money(i.unitCents * i.quantity, doc.currency)}`)
      .join('\n'),
    total: `${total} (indicatif, à vérifier avant facturation)`,
    pays: c.country,
    langue: doc.locale === 'en' ? 'Anglais' : 'Français',
    message: doc.project.details,
  }
  if (c.phone) fields.telephone = c.phone
  if (c.company) fields.entreprise = c.company
  if (doc.project.deadline) fields.delai = fr.checkout.deadlines[doc.project.deadline as keyof typeof fr.checkout.deadlines] ?? doc.project.deadline
  if (doc.project.referenceUrl) fields.lien = doc.project.referenceUrl
  return fields
}

export type OrderRequestErrorCode = 'invalid' | 'too-fast' | 'failed' | 'not-configured'

export class OrderRequestError extends Error {
  constructor(readonly code: OrderRequestErrorCode) {
    super(`Order request failed: ${code}.`)
    this.name = 'OrderRequestError'
  }
}

export type OrderRequestResult = { reference: string; stored: boolean; emailed: boolean }

type Deps = {
  /** Enregistre le document (null = Firestore non configuré). */
  save: ((reference: string, doc: OrderRequestDoc) => Promise<void>) | null
  /** Envoie l'e-mail (null = Web3Forms non configuré). */
  email: ((fields: Record<string, string>) => Promise<void>) | null
  now?: () => Date
}

/** Enregistrement Firestore réel : création seule, horodatage serveur. */
async function saveToFirestore(reference: string, doc: OrderRequestDoc): Promise<void> {
  const [db, { doc: docRef, setDoc, serverTimestamp }] = await Promise.all([getDb(), import('firebase/firestore')])
  await setDoc(docRef(db, ORDER_REQUESTS, reference), { ...doc, createdAt: serverTimestamp() })
}

const defaultDeps: Deps = {
  save: isFirebaseConfigured ? saveToFirestore : null,
  email: web3formsAccessKey ? (fields) => postWeb3Forms(fields) : null,
}

/**
 * Envoie la commande. Résout si au moins un canal l'a confirmée ; sinon lève OrderRequestError.
 * `elapsedMs` = temps passé sur le formulaire.
 */
export async function submitOrderRequest(
  summary: CartSummary,
  values: CheckoutValues,
  locale: 'fr' | 'en',
  elapsedMs: number,
  deps: Deps = defaultDeps,
): Promise<OrderRequestResult> {
  if (!deps.save && !deps.email) throw new OrderRequestError('not-configured')
  if (values.website) throw new OrderRequestError('invalid')
  if (elapsedMs < MIN_ORDER_FILL_MS) throw new OrderRequestError('too-fast')

  const reference = makeReference(deps.now?.())
  const doc = buildOrderRequestDoc(summary, values, locale, reference)

  const stored = deps.save
    ? await deps.save(reference, doc).then(
        () => true,
        () => false,
      )
    : false
  const emailed = deps.email
    ? await deps.email(orderRequestEmail(doc)).then(
        () => true,
        () => false,
      )
    : false

  if (!stored && !emailed) throw new OrderRequestError('failed')
  return { reference, stored, emailed }
}

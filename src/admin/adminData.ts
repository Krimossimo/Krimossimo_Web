/**
 * Lecture défensive des commandes et messages pour l'administration — logique pure (testée).
 * Les documents viennent de Firestore (écrits par les Cloud Functions) ; ils sont tout de même
 * revalidés avant affichage.
 */
import { isRecord, toIsoDate } from '../content/validation'
import { currencies, type Currency } from '../types/content'
import { orderStatuses, type OrderStatus } from '../lib/orders'
import { fulfillmentStatuses, messageStatuses, type FulfillmentStatus, type MessageStatus } from './adminApi'

export type AdminOrder = {
  id: string
  status: OrderStatus
  currency: Currency
  totalCents: number
  items: { offerId: string; title: string; unitCents: number; quantity: number }[]
  customer: { firstName: string; lastName: string; email: string; phone?: string; company?: string; country: string }
  project: { details: string; referenceUrl?: string; deadline?: string }
  createdAt: string | null
  fulfillment: FulfillmentStatus
  fulfillmentNote?: string
  /** Environnement PayPal de la commande : « sandbox » = commande de test. */
  paymentEnv: 'sandbox' | 'live'
  paypalCaptureId?: string
  failureReason?: string
  lateCapture: boolean
  /** Anomalies de paiement signalées par le serveur (à traiter dans PayPal). */
  alerts: { kind: 'duplicate_capture' | 'amount_mismatch'; captureId?: string }[]
}

const str = (v: unknown, max = 5000): string | undefined => (typeof v === 'string' && v.length <= max ? v : undefined)
const cents = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined)

export function parseAdminOrder(id: string, data: unknown): AdminOrder | null {
  if (!isRecord(data) || !isRecord(data.customer) || !Array.isArray(data.items)) return null
  const status = data.status
  const currency = data.currency
  const totalCents = cents(data.totalCents)
  if (!(orderStatuses as readonly unknown[]).includes(status) || !(currencies as readonly unknown[]).includes(currency) || totalCents === undefined) {
    return null
  }
  const items: AdminOrder['items'] = []
  for (const item of data.items) {
    if (!isRecord(item)) return null
    const offerId = str(item.offerId, 80)
    const title = str(item.title, 300)
    const unitCents = cents(item.unitCents)
    const quantity = cents(item.quantity)
    if (!offerId || title === undefined || unitCents === undefined || !quantity) return null
    items.push({ offerId, title, unitCents, quantity })
  }
  const c = data.customer
  const firstName = str(c.firstName, 80)
  const lastName = str(c.lastName, 80)
  const email = str(c.email, 254)
  const country = str(c.country, 60)
  if (!firstName || !lastName || !email || !country) return null
  const project = isRecord(data.project) ? data.project : {}
  const fulfillment = (fulfillmentStatuses as readonly unknown[]).includes(data.fulfillment) ? (data.fulfillment as FulfillmentStatus) : 'todo'
  const order: AdminOrder = {
    id,
    status: status as OrderStatus,
    currency: currency as Currency,
    totalCents,
    items,
    customer: { firstName, lastName, email, country },
    project: { details: str(project.details, 3000) ?? '' },
    createdAt: toIsoDate(data.createdAt),
    fulfillment,
    paymentEnv: data.paymentEnv === 'live' ? 'live' : 'sandbox',
    lateCapture: data.lateCapture === true,
    alerts: (Array.isArray(data.paymentAlerts) ? data.paymentAlerts : []).flatMap((a) => {
      if (!isRecord(a) || (a.kind !== 'duplicate_capture' && a.kind !== 'amount_mismatch')) return []
      const captureId = str(a.captureId, 40)
      return [{ kind: a.kind, ...(captureId ? { captureId } : {}) }]
    }),
  }
  const captureId = str(data.paypalCaptureId, 40)
  if (captureId) order.paypalCaptureId = captureId
  const failure = str(data.failureReason, 80)
  if (failure && status !== 'paid') order.failureReason = failure
  const phone = str(c.phone, 25)
  const company = str(c.company, 120)
  if (phone) order.customer.phone = phone
  if (company) order.customer.company = company
  const referenceUrl = str(project.referenceUrl, 500)
  const deadline = str(project.deadline, 20)
  if (referenceUrl) order.project.referenceUrl = referenceUrl
  if (deadline) order.project.deadline = deadline
  const note = str(data.fulfillmentNote, 1000)
  if (note) order.fulfillmentNote = note
  return order
}

export type AdminMessage = {
  id: string
  firstName: string
  lastName: string
  email: string
  subject: string
  message: string
  status: MessageStatus
  createdAt: string | null
  /** Envoi de l'e-mail correspondant (absent pour les messages antérieurs à l'envoi par e-mail). */
  delivery?: 'pending' | 'sent' | 'failed'
}

export function parseAdminMessage(id: string, data: unknown): AdminMessage | null {
  if (!isRecord(data)) return null
  const firstName = str(data.firstName, 80)
  const lastName = str(data.lastName, 80)
  const email = str(data.email, 254)
  const message = str(data.message, 2000)
  if (!firstName || !lastName || !email || !message) return null
  return {
    id,
    firstName,
    lastName,
    email,
    subject: str(data.subject, 40) ?? 'other',
    message,
    status: (messageStatuses as readonly unknown[]).includes(data.status) ? (data.status as MessageStatus) : 'new',
    createdAt: toIsoDate(data.createdAt),
    ...(data.delivery === 'pending' || data.delivery === 'sent' || data.delivery === 'failed' ? { delivery: data.delivery } : {}),
  }
}

/** Seule une commande payée a un suivi de réalisation (comme côté serveur). */
export const hasFulfillment = (order: AdminOrder) => order.status === 'paid'

/**
 * Lien mailto sûr vers une adresse saisie par un visiteur : une adresse simple est utilisée
 * telle quelle, toute autre est encodée (pas d'injection de paramètres « ?cc= » ou « &body= »).
 */
export function mailtoHref(email: string, subject?: string): string {
  const address = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/.test(email) ? email : encodeURIComponent(email)
  return `mailto:${address}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`
}

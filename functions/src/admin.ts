/**
 * Contrôle d'accès administrateur et opérations privilégiées — logique pure (testée par admin.test.ts).
 *
 * Un appel d'administration est accepté uniquement si :
 *  1. il porte un jeton d'identité Firebase (Authorization: Bearer <ID token>) ;
 *  2. ce jeton est vérifié par l'Admin SDK (signature, expiration, révocation) ;
 *  3. il contient le custom claim { admin: true } — posé uniquement par scripts/admin.ts.
 * Aucune information envoyée par le navigateur (champ "role", en-tête, paramètre...) n'est prise en compte.
 */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Extrait le jeton d'un en-tête « Authorization: Bearer … ». */
export function readBearerToken(header: unknown): string | null {
  if (typeof header !== 'string') return null
  const match = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(header.trim())
  return match ? match[1] : null
}

/** Le claim doit valoir exactement true (ni "true", ni 1, ni un autre nom de champ). */
export function hasAdminClaim(decoded: unknown): boolean {
  return isRecord(decoded) && decoded.admin === true && typeof decoded.uid === 'string' && decoded.uid.length > 0
}

/* -------------------------------------------------------- Suivi des commandes */

/** Avancement de la prestation, distinct du statut de paiement (qui ne vient que de PayPal). */
export const fulfillmentStatuses = ['todo', 'in_progress', 'delivered'] as const
export type FulfillmentStatus = (typeof fulfillmentStatuses)[number]

const ORDER_ID = /^[A-Za-z0-9]{10,64}$/
const MESSAGE_ID = /^[A-Za-z0-9]{10,64}$/

export type OrderUpdate = { orderId: string; fulfillment: FulfillmentStatus; note?: string }

export function validateOrderUpdate(body: unknown): { ok: true; value: OrderUpdate } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: 'body' }
  if (typeof body.orderId !== 'string' || !ORDER_ID.test(body.orderId)) return { ok: false, error: 'orderId' }
  if (typeof body.fulfillment !== 'string' || !(fulfillmentStatuses as readonly string[]).includes(body.fulfillment)) {
    return { ok: false, error: 'fulfillment' }
  }
  let note: string | undefined
  if (body.note !== undefined && body.note !== null && body.note !== '') {
    if (typeof body.note !== 'string' || body.note.trim().length > 1000) return { ok: false, error: 'note' }
    note = body.note.trim()
  }
  return { ok: true, value: { orderId: body.orderId, fulfillment: body.fulfillment as FulfillmentStatus, note } }
}

/** Le suivi de réalisation ne concerne que les commandes réellement payées. */
export function canUpdateFulfillment(paymentStatus: unknown): boolean {
  return paymentStatus === 'paid'
}

/* ------------------------------------------------------- Messages de contact */

export const messageStatuses = ['new', 'read', 'archived'] as const
export type MessageStatus = (typeof messageStatuses)[number]

export function validateMessageUpdate(
  body: unknown,
): { ok: true; value: { messageId: string; status: MessageStatus } } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: 'body' }
  if (typeof body.messageId !== 'string' || !MESSAGE_ID.test(body.messageId)) return { ok: false, error: 'messageId' }
  if (typeof body.status !== 'string' || !(messageStatuses as readonly string[]).includes(body.status)) {
    return { ok: false, error: 'status' }
  }
  return { ok: true, value: { messageId: body.messageId, status: body.status as MessageStatus } }
}

/* ----------------------------------------------------------------- Journal */

export type AuditEntry = {
  action: string
  actorUid: string
  actorEmail: string | null
  target: string
  details?: Record<string, unknown>
}

export function auditEntry(action: string, actor: { uid: string; email?: string | null }, target: string, details?: Record<string, unknown>): AuditEntry {
  const entry: AuditEntry = { action, actorUid: actor.uid, actorEmail: actor.email ?? null, target }
  if (details && Object.keys(details).length) entry.details = details
  return entry
}

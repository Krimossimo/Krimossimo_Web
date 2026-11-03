/**
 * Cloud Functions Krimossimo — commandes, paiements PayPal, contact, administration.
 *
 * Paiement (logique dans payments.ts, documentation dans docs/paypal.md) :
 *  - createOrder        relit les offres dans Firestore, calcule et FIGE le montant, crée la commande ;
 *  - createPaypalOrder  relit les offres, régularise une éventuelle commande PayPal précédente, puis
 *                       crée (ou réutilise) la commande PayPal pour ce montant ;
 *  - capturePaypalOrder capture côté serveur et VÉRIFIE (montant, devise, références) → paid / payment_failed ;
 *  - cancelOrder        marque le paiement abandonné (une capture confirmée l'emporte toujours) ;
 *  - getOrder           statut réel, relu chez PayPal si un paiement est en attente ;
 *  - paypalWebhook      signature vérifiée par PayPal, puis commande relue chez PayPal.
 *
 * Formulaire de contact (logique dans contactService.ts) :
 *  - submitContact      revalide le message, filtre le spam, limite le débit par IP, l'enregistre
 *                       (contactMessages) puis l'envoie par e-mail (SMTP) à CONTACT_TO.
 *
 * Administration (jeton Firebase vérifié + custom claim { admin: true } obligatoires) :
 *  - adminUpdateOrder   met à jour le suivi de réalisation d'une commande PAYÉE (jamais son paiement) ;
 *  - adminUpdateMessage change le statut d'un message de contact (nouveau, lu, archivé).
 * Chaque action d'administration est inscrite dans adminAudit.
 * Le rôle administrateur ne s'obtient PAS par une fonction : uniquement par scripts/admin.ts.
 *
 * Le navigateur s'authentifie sur SA commande avec un jeton aléatoire remis à la création
 * (seule son empreinte SHA-256 est stockée). Les commandes ne sont pas lisibles depuis le
 * navigateur via Firestore (voir firestore.rules).
 *
 * Configuration (aucune de ces valeurs ne va dans les variables VITE_*) :
 *   Secrets   : firebase functions:secrets:set PAYPAL_CLIENT_ID
 *               firebase functions:secrets:set PAYPAL_CLIENT_SECRET
 *               firebase functions:secrets:set SMTP_PASSWORD
 *   Paramètres (functions/.env, voir functions/.env.example) :
 *               PAYPAL_ENV=sandbox|live, ALLOWED_ORIGINS, PAYPAL_WEBHOOK_ID,
 *               SMTP_HOST, SMTP_PORT, SMTP_USER, CONTACT_TO
 * Le plan Blaze de Firebase est requis pour déployer des Cloud Functions.
 */
import { onRequest, type Request } from 'firebase-functions/v2/https'
import { defineSecret, defineString } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { initializeApp } from 'firebase-admin/app'
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import {
  auditEntry,
  canUpdateFulfillment,
  hasAdminClaim,
  readBearerToken,
  validateMessageUpdate,
  validateOrderUpdate,
} from './admin.js'
import { clientIp } from './contact.js'
import { createContactService } from './contactService.js'
import { firestoreContactStore, firestoreOrderStore } from './firestoreStore.js'
import { createSmtpMailer, smtpConfig, type Mailer } from './mailer.js'
import { createPaymentService, type Logger, type Reply } from './payments.js'
import { createPayPalClient, type PayPalApi, type PayPalEnv } from './paypal.js'
import { allowedOrigins, parsePayPalEnv } from './config.js'

initializeApp()

const PAYPAL_CLIENT_ID = defineSecret('PAYPAL_CLIENT_ID')
const PAYPAL_CLIENT_SECRET = defineSecret('PAYPAL_CLIENT_SECRET')
const PAYPAL_ENV = defineString('PAYPAL_ENV', { default: 'sandbox' })
const ALLOWED_ORIGINS = defineString('ALLOWED_ORIGINS', { default: 'http://localhost:5173' })
const PAYPAL_WEBHOOK_ID = defineString('PAYPAL_WEBHOOK_ID', { default: '' })
// Envoi des messages de contact (voir docs/integrations.md).
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD')
const SMTP_HOST = defineString('SMTP_HOST', { default: 'smtp.gmail.com' })
const SMTP_PORT = defineString('SMTP_PORT', { default: '465' })
const SMTP_USER = defineString('SMTP_USER', { default: '' })
const CONTACT_TO = defineString('CONTACT_TO', { default: 'krimossimo.contact@gmail.com' })

const REGION = 'europe-west1'

const db = () => getFirestore()
const orders = () => db().collection('orders')
const salt = () => process.env.GCLOUD_PROJECT ?? 'krimossimo'

const log: Logger = {
  info: (message, data) => logger.info(message, data),
  warn: (message, data) => logger.warn(message, data),
  error: (message, data) => logger.error(message, data),
}

/** Un client PayPal par instance (le jeton OAuth est mis en cache), recréé si la configuration change. */
let paypalClient: { key: string; client: PayPalApi } | null = null
function paypal(): PayPalApi | null {
  const env: PayPalEnv | null = parsePayPalEnv(PAYPAL_ENV.value())
  const clientId = PAYPAL_CLIENT_ID.value().trim()
  const clientSecret = PAYPAL_CLIENT_SECRET.value().trim()
  if (!env) {
    logger.error('PAYPAL_ENV must be "sandbox" or "live"')
    return null
  }
  if (!clientId || !clientSecret) return null
  const key = `${env}|${clientId}`
  if (paypalClient?.key !== key) paypalClient = { key, client: createPayPalClient({ clientId, clientSecret, env }) }
  return paypalClient.client
}

const payments = createPaymentService({
  store: firestoreOrderStore(getFirestore(), salt()),
  paypal,
  webhookId: () => PAYPAL_WEBHOOK_ID.value().trim(),
  log,
})

type EndpointOptions = { paypal?: boolean; secrets?: ReturnType<typeof defineSecret>[]; maxInstances?: number }

/** Point d'accès JSON : origine autorisée, POST uniquement, corps borné, erreurs génériques. */
function endpoint(
  name: string,
  handler: (body: Record<string, unknown>, req: Request) => Promise<Reply>,
  { paypal: usesPaypal, secrets, maxInstances = 10 }: EndpointOptions = {},
) {
  // Par défaut, les secrets PayPal ; un point d'accès qui précise `secrets` ne reçoit que ceux-là.
  const granted = secrets ?? (usesPaypal === false ? [] : [PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET])
  return onRequest(
    { region: REGION, cors: true, maxInstances, ...(granted.length ? { secrets: granted } : {}) },
    async (req: Request, res) => {
      res.set('Cache-Control', 'no-store')
      const allowed = allowedOrigins(ALLOWED_ORIGINS.value(), parsePayPalEnv(PAYPAL_ENV.value()) ?? 'sandbox')
      if (!allowed.includes(String(req.headers.origin ?? ''))) {
        res.status(403).json({ error: 'origin_not_allowed' })
        return
      }
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'method_not_allowed' })
        return
      }
      if ((req.rawBody?.length ?? 0) > 20_000) {
        res.status(413).json({ error: 'too_large' })
        return
      }
      const body = typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : null
      if (!body) {
        res.status(400).json({ error: 'invalid_request' })
        return
      }
      try {
        const reply = await handler(body, req)
        res.status(reply.status).json(reply.json)
      } catch (error) {
        logger.error(`${name} failed`, error instanceof Error ? error.message : error)
        res.status(500).json({ error: 'server' })
      }
    },
  )
}

/* ----------------------------------------------------------------- Paiement */

export const createOrder = endpoint('createOrder', (body, req) => payments.createOrder(body, clientIp(req.headers['x-forwarded-for'], req.ip)))
export const createPaypalOrder = endpoint('createPaypalOrder', (body) => payments.createPaypalOrder(body))
export const capturePaypalOrder = endpoint('capturePaypalOrder', (body) => payments.capturePaypalOrder(body))
export const cancelOrder = endpoint('cancelOrder', (body) => payments.cancelOrder(body))
export const getOrder = endpoint('getOrder', (body) => payments.getOrder(body))

/**
 * Webhook PayPal (à déclarer dans le tableau de bord développeur PayPal, voir docs/paypal.md).
 * Pas de contrôle d'origine (appel serveur à serveur) : l'authenticité est vérifiée par PayPal
 * à partir des en-têtes de signature et du corps BRUT de la requête.
 */
export const paypalWebhook = onRequest(
  { region: REGION, maxInstances: 5, secrets: [PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).end()
      return
    }
    const raw = req.rawBody
    if (!raw || raw.length === 0 || raw.length > 200_000) {
      res.status(400).json({ error: 'invalid_body' })
      return
    }
    const header = (name: string) => (typeof req.headers[name] === 'string' ? (req.headers[name] as string) : undefined)
    const reply = await payments.handleWebhook(
      {
        authAlgo: header('paypal-auth-algo'),
        certUrl: header('paypal-cert-url'),
        transmissionId: header('paypal-transmission-id'),
        transmissionSig: header('paypal-transmission-sig'),
        transmissionTime: header('paypal-transmission-time'),
      },
      raw.toString('utf8'),
    )
    res.status(reply.status).json(reply.json)
  },
)

/* ------------------------------------------------------------ submitContact */

/**
 * Message du formulaire de contact (URL à indiquer dans VITE_CONTACT_ENDPOINT) : validé,
 * filtré (piège, délai de saisie, liens, débit par IP), enregistré dans contactMessages
 * puis envoyé par e-mail à CONTACT_TO. « ok » uniquement si le serveur SMTP a accepté l'e-mail.
 */
let mailerCache: { key: string; mailer: Mailer } | null = null
function mailer(): Mailer | null {
  const config = smtpConfig({ host: SMTP_HOST.value(), port: SMTP_PORT.value(), user: SMTP_USER.value(), pass: SMTP_PASSWORD.value() })
  if (!config) return null
  const key = `${config.host}|${config.port}|${config.user}`
  if (mailerCache?.key !== key) mailerCache = { key, mailer: createSmtpMailer(config) }
  return mailerCache.mailer
}

const contact = createContactService({
  store: firestoreContactStore(getFirestore(), salt()),
  mailer,
  to: () => CONTACT_TO.value(),
  log,
})

export const submitContact = endpoint(
  'submitContact',
  (body, req) => contact.submit(body, clientIp(req.headers['x-forwarded-for'], req.ip)),
  { secrets: [SMTP_PASSWORD], maxInstances: 5 },
)

/* ---------------------------------------------------------- Administration */

type Actor = { uid: string; email: string | null }

/**
 * Point d'accès d'administration : en plus des contrôles de endpoint(), exige un jeton
 * d'identité Firebase valide, non révoqué, portant le claim { admin: true }.
 */
function adminEndpoint(name: string, handler: (body: Record<string, unknown>, actor: Actor) => Promise<Reply>) {
  return endpoint(
    name,
    async (body, req) => {
      const token = readBearerToken(req.headers.authorization)
      if (!token) return { status: 401, json: { error: 'unauthenticated' } }
      let decoded: DecodedIdToken
      try {
        decoded = await getAuth().verifyIdToken(token, true)
      } catch {
        return { status: 401, json: { error: 'unauthenticated' } }
      }
      if (!hasAdminClaim(decoded)) {
        logger.warn('admin access refused', { name, uid: decoded.uid })
        return { status: 403, json: { error: 'forbidden' } }
      }
      return handler(body, { uid: decoded.uid, email: decoded.email ?? null })
    },
    { paypal: false, maxInstances: 3 },
  )
}

async function writeAudit(action: string, actor: Actor, target: string, details?: Record<string, unknown>) {
  await db()
    .collection('adminAudit')
    .add({ ...auditEntry(action, actor, target, details), at: FieldValue.serverTimestamp() })
}

/** Suivi de réalisation d'une commande payée. Le statut de paiement n'est jamais modifiable ici. */
export const adminUpdateOrder = adminEndpoint('adminUpdateOrder', async (body, actor) => {
  const check = validateOrderUpdate(body)
  if (!check.ok) return { status: 400, json: { error: 'invalid_request', field: check.error } }
  const { orderId, fulfillment, note } = check.value
  const ref = orders().doc(orderId)
  const result = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return 'not_found' as const
    if (!canUpdateFulfillment(snap.get('status'))) return 'invalid_state' as const
    tx.update(ref, {
      fulfillment,
      ...(note !== undefined ? { fulfillmentNote: note } : {}),
      fulfillmentUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion({ fulfillment, at: Timestamp.now(), by: actor.uid }),
    })
    return 'ok' as const
  })
  if (result === 'not_found') return { status: 404, json: { error: 'order_not_found' } }
  if (result === 'invalid_state') return { status: 409, json: { error: 'invalid_state' } }
  await writeAudit('order.fulfillment', actor, orderId, { fulfillment })
  return { status: 200, json: { orderId, fulfillment } }
})

/** Statut d'un message de contact (nouveau, lu, archivé). */
export const adminUpdateMessage = adminEndpoint('adminUpdateMessage', async (body, actor) => {
  const check = validateMessageUpdate(body)
  if (!check.ok) return { status: 400, json: { error: 'invalid_request', field: check.error } }
  const { messageId, status } = check.value
  const ref = db().collection('contactMessages').doc(messageId)
  if (!(await ref.get()).exists) return { status: 404, json: { error: 'message_not_found' } }
  await ref.update({ status, updatedAt: FieldValue.serverTimestamp() })
  await writeAudit('message.status', actor, messageId, { status })
  return { status: 200, json: { messageId, status } }
})

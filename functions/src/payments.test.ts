/**
 * Scénarios de paiement de bout en bout côté serveur : le VRAI service (payments.ts) et le
 * VRAI client REST (paypal.ts), branchés sur un stockage en mémoire et sur le simulateur de
 * l'API Sandbox (testkit/paypalSandbox.ts). Aucun appel réseau.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { allowedOrigins, parsePayPalEnv } from './config.js'
import { MAX_PAYPAL_ATTEMPTS, ORDER_RATE_LIMIT, createPaymentService, webhookTarget, type Logger } from './payments.js'
import { createPayPalClient, isPayPalCertUrl } from './paypal.js'
import { memoryStore } from './testkit/memoryStore.js'
import { paypalSandbox } from './testkit/paypalSandbox.js'

const offer = (price: number, extra: Record<string, unknown> = {}) => ({
  title: { fr: 'Prestation', en: 'Service' },
  publication: 'published',
  availability: 'available',
  price,
  currency: 'EUR',
  ...extra,
})

const body = (extra: Record<string, unknown> = {}) => ({
  items: [
    { offerId: 'site-vitrine', quantity: 1 },
    { offerId: 'publication', quantity: 2 },
  ],
  customer: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', country: 'France' },
  project: { details: 'Un site vitrine pour présenter mon activité et mes services.' },
  locale: 'fr',
  website: '',
  ...extra,
})

function setup({ env = 'sandbox' as 'sandbox' | 'live', configured = true, webhookId = 'WH-TEST-ID' } = {}) {
  const store = memoryStore({ 'site-vitrine': offer(149), publication: offer(39.9, { maxQuantity: 5 }) })
  const sim = paypalSandbox()
  let clock = new Date('2026-11-03T10:00:00Z')
  const logs: string[] = []
  const log: Logger = {
    info: (m, d) => logs.push(`info ${m} ${JSON.stringify(d ?? {})}`),
    warn: (m, d) => logs.push(`warn ${m} ${JSON.stringify(d ?? {})}`),
    error: (m, d) => logs.push(`error ${m} ${JSON.stringify(d ?? {})}`),
  }
  const client = createPayPalClient({ clientId: sim.clientId, clientSecret: sim.clientSecret, env: 'sandbox' }, { fetch: sim.fetch, now: () => clock.getTime() })
  let paypal = configured ? client : null
  const service = createPaymentService({ store, paypal: () => paypal, webhookId: () => webhookId, now: () => new Date(clock), log })
  return {
    store,
    sim,
    logs,
    service,
    advance: (ms: number) => (clock = new Date(clock.getTime() + ms)),
    /** Remplace le client PayPal (par ex. bascule simulée vers Live). */
    usePaypal: (p: typeof client | null) => (paypal = p),
    async order(extra: Record<string, unknown> = {}) {
      const reply = await service.createOrder(body(extra), '203.0.113.7')
      assert.equal(reply.status, 201, JSON.stringify(reply.json))
      return { orderId: reply.json.orderId as string, accessToken: reply.json.accessToken as string, reply }
    },
    stored: (orderId: string) => store.orders.get(orderId)!,
    creates: () => sim.calls.filter((c) => c.method === 'POST' && c.path === '/v2/checkout/orders').length,
    captureCalls: () => sim.calls.filter((c) => c.path.endsWith('/capture')).length,
  }
}

type T = ReturnType<typeof setup>
type Ref = { orderId: string; accessToken: string }

async function startPayment(t: T, ref: Ref) {
  const reply = await t.service.createPaypalOrder(ref)
  assert.equal(reply.status, 200, JSON.stringify(reply.json))
  return reply.json.paypalOrderId as string
}

describe('paiement réussi', () => {
  it('commande → commande PayPal au montant du serveur → approbation → capture vérifiée → payée', async () => {
    const t = setup()
    const { orderId, accessToken, reply } = await t.order()
    assert.equal(reply.json.totalCents, 14900 + 2 * 3990)
    assert.deepEqual(reply.json.customer, { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' })
    assert.deepEqual(reply.json.payment, { provider: 'paypal', env: 'sandbox', clientId: t.sim.clientId })
    assert.ok(!JSON.stringify(reply.json).includes(t.sim.clientSecret), 'le secret ne sort jamais du serveur')
    assert.ok(!JSON.stringify(t.stored(orderId)).includes(accessToken), 'seule l’empreinte du jeton est stockée')

    const paypalOrderId = await startPayment(t, { orderId, accessToken })
    const atPaypal = t.sim.orders.get(paypalOrderId)!
    assert.deepEqual(atPaypal.purchase_units[0]!.amount, {
      currency_code: 'EUR',
      value: '228.80',
      breakdown: { item_total: { currency_code: 'EUR', value: '228.80' } },
    })
    assert.equal(atPaypal.purchase_units[0]!.reference_id, orderId)
    assert.equal(t.stored(orderId).status, 'payment_pending')

    // Avant approbation : la capture est refusée par PayPal, rien n'est encaissé.
    const early = await t.service.capturePaypalOrder({ orderId, accessToken, paypalOrderId })
    assert.deepEqual(early, { status: 409, json: { error: 'not_approved', status: 'payment_pending' } })

    t.sim.approve(paypalOrderId)
    const capture = await t.service.capturePaypalOrder({ orderId, accessToken, paypalOrderId })
    assert.deepEqual(capture, { status: 200, json: { status: 'paid' } })
    const stored = t.stored(orderId)
    assert.equal(stored.status, 'paid')
    assert.match(stored.paypalCaptureId ?? '', /^CAP/)
    assert.deepEqual(stored.paidAmount, { currency: 'EUR', value: '228.80' })
    assert.deepEqual(stored.history.map((h) => h.status), ['created', 'payment_pending', 'paid'])
    assert.equal(stored.paymentEnv, 'sandbox')
  })
})

describe('annulation', () => {
  it('fenêtre PayPal fermée : commande annulée, puis nouvel essai sur la MÊME commande PayPal', async () => {
    const t = setup()
    const ref = await t.order()
    const first = await startPayment(t, ref)
    assert.deepEqual(await t.service.cancelOrder(ref), { status: 200, json: { status: 'cancelled' } })
    assert.equal(t.stored(ref.orderId).status, 'cancelled')

    const again = await startPayment(t, ref)
    assert.equal(again, first, 'la commande PayPal encore valide est réutilisée')
    assert.equal(t.creates(), 1)
    t.sim.approve(again)
    assert.equal((await t.service.capturePaypalOrder({ ...ref, paypalOrderId: again })).json.status, 'paid')
  })

  it('une commande payée ne peut pas être annulée', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    await t.service.capturePaypalOrder({ ...ref, paypalOrderId: id })
    assert.deepEqual(await t.service.cancelOrder(ref), { status: 200, json: { status: 'paid' } })
    assert.equal(t.stored(ref.orderId).status, 'paid')
  })

  it('annulation après une capture dont la réponse s’est perdue : la commande est payée, pas annulée', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    t.sim.captures.push('network_after')
    assert.deepEqual(await t.service.capturePaypalOrder({ ...ref, paypalOrderId: id }), { status: 503, json: { error: 'payment_unconfirmed' } })
    assert.deepEqual(await t.service.cancelOrder(ref), { status: 200, json: { status: 'paid' } })
  })
})

describe('échec', () => {
  it('refus définitif (TRANSACTION_REFUSED) : échoué, puis nouvel essai avec une nouvelle commande PayPal', async () => {
    const t = setup()
    const ref = await t.order()
    const first = await startPayment(t, ref)
    t.sim.approve(first)
    t.sim.captures.push('refused')
    assert.deepEqual(await t.service.capturePaypalOrder({ ...ref, paypalOrderId: first }), { status: 200, json: { status: 'payment_failed' } })
    assert.equal(t.stored(ref.orderId).failureReason, 'TRANSACTION_REFUSED')
    assert.equal(t.stored(ref.orderId).paypalOrderId, null)

    const second = await startPayment(t, ref)
    assert.notEqual(second, first)
    t.sim.approve(second)
    assert.equal((await t.service.capturePaypalOrder({ ...ref, paypalOrderId: second })).json.status, 'paid')
    assert.deepEqual(t.stored(ref.orderId).paypalOrderIds, [first, second])
    assert.equal(t.store.orders.size, 1, 'une seule commande')
  })

  it('carte refusée (INSTRUMENT_DECLINED) : le client choisit un autre moyen, la capture suivante utilise une nouvelle clé', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    t.sim.captures.push('instrument_declined')
    assert.deepEqual(await t.service.capturePaypalOrder({ ...ref, paypalOrderId: id }), {
      status: 200,
      json: { status: 'payment_pending', retry: 'instrument_declined' },
    })
    t.sim.approve(id) // actions.restart() puis nouvelle approbation
    assert.equal((await t.service.capturePaypalOrder({ ...ref, paypalOrderId: id })).json.status, 'paid')
    const keys = t.sim.calls.filter((c) => c.path.endsWith('/capture')).map((c) => c.requestId)
    assert.equal(new Set(keys).size, 2, 'sinon PayPal rejouerait le refus mis en cache')
  })

  it('capture refusée (DECLINED) : échoué, jamais payé', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    t.sim.captures.push('declined')
    assert.equal((await t.service.capturePaypalOrder({ ...ref, paypalOrderId: id })).json.status, 'payment_failed')
    assert.equal(t.stored(ref.orderId).paypalCaptureId, undefined)
  })

  it('capture en examen (PENDING) : en attente, puis payée quand PayPal confirme (webhook)', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    t.sim.captures.push('pending')
    assert.deepEqual(await t.service.capturePaypalOrder({ ...ref, paypalOrderId: id }), { status: 200, json: { status: 'payment_pending', review: true } })
    assert.deepEqual(await t.service.getOrder(ref), { status: 200, json: { status: 'payment_pending', review: true } })
    // Un nouveau clic sur PayPal ne crée pas de seconde commande pendant l'examen.
    assert.deepEqual(await t.service.createPaypalOrder(ref), { status: 409, json: { error: 'invalid_state', status: 'payment_pending' } })
    assert.equal(t.creates(), 1)

    const capture = (t.sim.orders.get(id)!.purchase_units[0]!.payments as { captures: { status: string }[] }).captures[0]!
    capture.status = 'COMPLETED'
    const event = t.sim.webhook('PAYMENT.CAPTURE.COMPLETED', id)
    assert.equal((await t.service.handleWebhook(event.headers, event.rawBody)).status, 200)
    assert.equal(t.stored(ref.orderId).status, 'paid')
  })
})

describe('montant modifié par le client', () => {
  it('les prix envoyés par le navigateur sont ignorés', async () => {
    const t = setup()
    const { reply } = await t.order({
      items: [{ offerId: 'site-vitrine', quantity: 1, price: 1, unitCents: 1 }],
      totalCents: 1,
      amount: { value: '0.01' },
      currency: 'USD',
    })
    assert.equal(reply.json.totalCents, 14900)
    assert.equal(reply.json.currency, 'EUR')
  })

  it('commande PayPal créée par le navigateur à un autre montant : capture refusée, rien n’est encaissé', async () => {
    const t = setup()
    const ref = await t.order()
    await startPayment(t, ref)
    const forged = t.sim.foreignOrder('1.00', ref.orderId)
    t.sim.approve(forged)
    assert.deepEqual(await t.service.capturePaypalOrder({ ...ref, paypalOrderId: forged }), {
      status: 409,
      json: { error: 'paypal_order_mismatch', status: 'payment_pending' },
    })
    assert.equal(t.sim.orders.get(forged)!.status, 'APPROVED', 'jamais capturée')
    assert.equal(t.stored(ref.orderId).status, 'payment_pending')
  })

  it('montant capturé différent du montant figé : jamais « payé », alerte enregistrée', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    t.sim.tamperCapturedValue = '1.00'
    assert.equal((await t.service.capturePaypalOrder({ ...ref, paypalOrderId: id })).json.status, 'payment_failed')
    const stored = t.stored(ref.orderId)
    assert.equal(stored.failureReason, 'amount_mismatch')
    assert.equal(stored.paymentAlerts?.[0]?.kind, 'amount_mismatch')
    assert.ok(t.logs.some((l) => l.startsWith('error captured amount does not match')))
  })

  it('statut « payé » affirmé par le navigateur : ignoré ; mauvais jeton : commande introuvable', async () => {
    const t = setup()
    const ref = await t.order()
    assert.deepEqual(await t.service.getOrder({ ...ref, status: 'paid', paid: true }), { status: 200, json: { status: 'created' } })
    assert.equal((await t.service.getOrder({ ...ref, accessToken: 'x'.repeat(43) })).status, 404)
    assert.equal((await t.service.capturePaypalOrder({ orderId: ref.orderId, paypalOrderId: 'PAY00000000000001' })).status, 404)
  })

  it('prix modifié ou offre retirée entre la commande et le paiement : paiement bloqué', async () => {
    const t = setup()
    const ref = await t.order()
    t.store.offers.set('site-vitrine', offer(159))
    assert.deepEqual(await t.service.createPaypalOrder(ref), { status: 409, json: { error: 'price_changed', status: 'created' } })
    t.store.offers.set('site-vitrine', offer(149, { availability: 'out_of_stock' }))
    assert.deepEqual(await t.service.createPaypalOrder(ref), { status: 422, json: { error: 'offer_unavailable' } })
    assert.equal(t.creates(), 0)
  })

  it('commande de plus de 24 h : paiement refusé (prix à relire)', async () => {
    const t = setup()
    const ref = await t.order()
    t.advance(25 * 60 * 60 * 1000)
    assert.deepEqual(await t.service.createPaypalOrder(ref), { status: 409, json: { error: 'order_expired', status: 'created' } })
  })
})

describe('répétitions et doublons', () => {
  it('double clic sur PayPal : une seule commande PayPal', async () => {
    const t = setup()
    const ref = await t.order()
    const [a, b] = await Promise.all([t.service.createPaypalOrder(ref), t.service.createPaypalOrder(ref)])
    assert.equal(a.json.paypalOrderId, b.json.paypalOrderId)
    assert.equal(t.sim.orders.size, 1)
  })

  it('capture envoyée deux fois en même temps : un seul encaissement', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    const replies = await Promise.all([1, 2, 3].map(() => t.service.capturePaypalOrder({ ...ref, paypalOrderId: id })))
    assert.deepEqual(replies.map((r) => r.json.status), ['paid', 'paid', 'paid'])
    const captures = (t.sim.orders.get(id)!.purchase_units[0]!.payments as { captures: unknown[] }).captures
    assert.equal(captures.length, 1)
    assert.equal(t.stored(ref.orderId).paymentAlerts, undefined)
  })

  it('après paiement : capture et création PayPal ne font plus rien', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    await t.service.capturePaypalOrder({ ...ref, paypalOrderId: id })
    const before = t.sim.calls.length
    assert.deepEqual(await t.service.capturePaypalOrder({ ...ref, paypalOrderId: id }), { status: 200, json: { status: 'paid' } })
    assert.deepEqual(await t.service.createPaypalOrder(ref), { status: 409, json: { error: 'invalid_state', status: 'paid' } })
    assert.equal(t.sim.calls.length, before, 'aucun appel PayPal')
  })

  it('webhook reçu deux fois : traité une fois', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    await t.service.capturePaypalOrder({ ...ref, paypalOrderId: id })
    const event = t.sim.webhook('PAYMENT.CAPTURE.COMPLETED', id)
    assert.deepEqual(await t.service.handleWebhook(event.headers, event.rawBody), { status: 200, json: { received: true } })
    assert.deepEqual(await t.service.handleWebhook(event.headers, event.rawBody), { status: 200, json: { received: true, duplicate: true } })
    assert.deepEqual(t.stored(ref.orderId).history.map((h) => h.status), ['created', 'payment_pending', 'paid'])
  })

  it('commande PayPal expirée chez PayPal : une nouvelle est créée, l’ancienne reste rattachée', async () => {
    const t = setup()
    const ref = await t.order()
    const first = await startPayment(t, ref)
    t.sim.expire(first)
    const second = await startPayment(t, ref)
    assert.notEqual(second, first)
    assert.deepEqual(t.stored(ref.orderId).paypalOrderIds, [first, second])
  })

  it('second encaissement pour la même commande : signalé pour remboursement', async () => {
    const t = setup()
    const ref = await t.order()
    const first = await startPayment(t, ref)
    t.sim.expire(first)
    const second = await startPayment(t, ref)
    t.sim.approve(second)
    await t.service.capturePaypalOrder({ ...ref, paypalOrderId: second })
    // Cas extrême : une ancienne commande PayPal de la même commande apparaît encaissée.
    const old = t.sim.foreignOrder('228.80', ref.orderId)
    t.store.orders.get(ref.orderId)!.paypalOrderIds.push(old)
    t.sim.approve(old)
    const client = createPayPalClient({ clientId: t.sim.clientId, clientSecret: t.sim.clientSecret, env: 'sandbox' }, { fetch: t.sim.fetch })
    await client.captureOrder(old, 'outside')
    const event = t.sim.webhook('PAYMENT.CAPTURE.COMPLETED', old)
    await t.service.handleWebhook(event.headers, event.rawBody)
    const stored = t.stored(ref.orderId)
    assert.equal(stored.status, 'paid')
    assert.equal(stored.paymentAlerts?.[0]?.kind, 'duplicate_capture')
    assert.ok(t.logs.some((l) => l.startsWith('error duplicate capture: refund required')))
  })

  it('limites : commandes par IP et commandes PayPal par commande', async () => {
    const t = setup()
    for (let i = 1; i < ORDER_RATE_LIMIT.max; i++) await t.order()
    const ref = await t.order()
    assert.deepEqual(await t.service.createOrder(body(), '203.0.113.7'), { status: 429, json: { error: 'rate_limited' } })
    assert.equal((await t.service.createOrder(body(), '198.51.100.2')).status, 201, 'autre client')

    t.store.orders.get(ref.orderId)!.paypalAttempts = MAX_PAYPAL_ATTEMPTS
    assert.deepEqual(await t.service.createPaypalOrder(ref), { status: 429, json: { error: 'too_many_attempts' } })
  })
})

describe('erreurs réseau', () => {
  it('réponse de capture perdue : « non confirmé », puis le nouvel essai du client NE repaie PAS', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    t.sim.captures.push('network_after')
    assert.deepEqual(await t.service.capturePaypalOrder({ ...ref, paypalOrderId: id }), { status: 503, json: { error: 'payment_unconfirmed' } })
    assert.equal(t.stored(ref.orderId).status, 'payment_pending', 'jamais « échoué » sur une issue inconnue')

    // Le client reclique sur PayPal : le serveur constate l'encaissement au lieu de créer une 2e commande.
    assert.deepEqual(await t.service.createPaypalOrder(ref), { status: 409, json: { error: 'invalid_state', status: 'paid' } })
    assert.equal(t.creates(), 1)
    assert.equal(t.stored(ref.orderId).status, 'paid')
  })

  it('capture jamais arrivée chez PayPal : la vérification du statut capture la commande approuvée, une seule fois', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    t.sim.captures.push('network_before')
    assert.equal((await t.service.capturePaypalOrder({ ...ref, paypalOrderId: id })).status, 503)
    assert.deepEqual(await t.service.getOrder(ref), { status: 200, json: { status: 'paid' } })
    assert.deepEqual(await t.service.getOrder(ref), { status: 200, json: { status: 'paid' } })
    const captures = (t.sim.orders.get(id)!.purchase_units[0]!.payments as { captures: unknown[] }).captures
    assert.equal(captures.length, 1)
  })

  it('erreur 500 de PayPal à la capture : issue inconnue, commande non échouée', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    t.sim.captures.push('server_error')
    assert.deepEqual(await t.service.capturePaypalOrder({ ...ref, paypalOrderId: id }), { status: 503, json: { error: 'payment_unconfirmed' } })
    assert.equal(t.stored(ref.orderId).status, 'payment_pending')
  })

  it('PayPal injoignable : rien n’est créé ni modifié, statut relu sans erreur', async () => {
    const t = setup()
    const ref = await t.order()
    t.sim.offline = true
    assert.deepEqual(await t.service.createPaypalOrder(ref), { status: 503, json: { error: 'paypal_unreachable' } })
    assert.equal(t.stored(ref.orderId).status, 'created')
    t.sim.offline = false
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    t.sim.offline = true
    assert.deepEqual(await t.service.getOrder(ref), { status: 200, json: { status: 'payment_pending', stale: true } })
    assert.deepEqual(await t.service.createPaypalOrder(ref), { status: 503, json: { error: 'paypal_unreachable' } })
    t.sim.offline = false
    assert.equal(t.creates(), 1)
  })

  it('jeton OAuth mis en cache puis renouvelé à expiration', async () => {
    const t = setup()
    const ref = await t.order()
    await startPayment(t, ref)
    await t.service.getOrder(ref)
    const tokens = () => t.sim.calls.filter((c) => c.path === '/v1/oauth2/token').length
    assert.equal(tokens(), 1)
    t.advance(9 * 60 * 60 * 1000)
    await t.service.getOrder(ref)
    assert.equal(tokens(), 2)
  })

  it('les journaux ne contiennent ni secret, ni jeton, ni e-mail', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    t.sim.tamperCapturedValue = '1.00'
    await t.service.capturePaypalOrder({ ...ref, paypalOrderId: id })
    const all = t.logs.join('\n')
    assert.ok(all.length > 0)
    for (const secret of [t.sim.clientSecret, ref.accessToken, 'ada@example.com']) assert.ok(!all.includes(secret))
  })
})

describe('webhook', () => {
  it('client parti juste après l’approbation : le webhook capture et la commande est payée', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    const event = t.sim.webhook('CHECKOUT.ORDER.APPROVED', id)
    assert.equal((await t.service.handleWebhook(event.headers, event.rawBody)).status, 200)
    assert.equal(t.stored(ref.orderId).status, 'paid')
    assert.equal(t.captureCalls(), 1)
  })

  it('signature invalide, corps modifié ou en-têtes absents : refusé, rien ne change', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    t.sim.approve(id)
    const forged = t.sim.webhook('CHECKOUT.ORDER.APPROVED', id, { tamperSignature: true })
    assert.deepEqual(await t.service.handleWebhook(forged.headers, forged.rawBody), { status: 400, json: { error: 'invalid_signature' } })
    const genuine = t.sim.webhook('CHECKOUT.ORDER.APPROVED', id)
    const altered = genuine.rawBody.replace('CHECKOUT.ORDER.APPROVED', 'CHECKOUT.ORDER.COMPLETED')
    assert.equal((await t.service.handleWebhook(genuine.headers, altered)).status, 400)
    assert.equal((await t.service.handleWebhook({}, genuine.rawBody)).status, 400)
    assert.equal((await t.service.handleWebhook({ ...genuine.headers, certUrl: 'https://evil.example/cert' }, genuine.rawBody)).status, 400)
    assert.equal((await t.service.handleWebhook(genuine.headers, 'pas du JSON')).status, 400)
    assert.equal(t.stored(ref.orderId).status, 'payment_pending')
    assert.equal(t.captureCalls(), 0)
  })

  it('événement authentique mais contredit par PayPal : le contenu n’est pas cru sur parole', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref) // non approuvée
    const event = t.sim.webhook('PAYMENT.CAPTURE.COMPLETED', id)
    assert.equal((await t.service.handleWebhook(event.headers, event.rawBody)).status, 200)
    assert.equal(t.stored(ref.orderId).status, 'payment_pending')
  })

  it('commande inconnue ou commande PayPal étrangère : acquitté et ignoré', async () => {
    const t = setup()
    const ref = await t.order()
    await startPayment(t, ref)
    const stranger = t.sim.foreignOrder('1.00', ref.orderId)
    t.sim.approve(stranger)
    const event = t.sim.webhook('CHECKOUT.ORDER.APPROVED', stranger)
    assert.equal((await t.service.handleWebhook(event.headers, event.rawBody)).status, 200)
    assert.equal(t.sim.orders.get(stranger)!.status, 'APPROVED')
    assert.equal(t.stored(ref.orderId).status, 'payment_pending')
  })

  it('paiement confirmé sur une commande annulée : payée et signalée (« paiement tardif »)', async () => {
    const t = setup()
    const ref = await t.order()
    const id = await startPayment(t, ref)
    await t.service.cancelOrder(ref)
    t.sim.approve(id) // approuvée dans un autre onglet
    const approved = t.sim.webhook('CHECKOUT.ORDER.APPROVED', id)
    await t.service.handleWebhook(approved.headers, approved.rawBody)
    assert.equal(t.stored(ref.orderId).status, 'cancelled', 'pas de capture automatique d’une commande annulée')
    // Le client revient et clique de nouveau : la commande approuvée est capturée, sans seconde commande PayPal.
    assert.deepEqual(await t.service.createPaypalOrder(ref), { status: 409, json: { error: 'invalid_state', status: 'paid' } })
    assert.equal(t.stored(ref.orderId).lateCapture, true)
    assert.equal(t.creates(), 1)
  })

  it('webhook non configuré : point d’accès désactivé', async () => {
    const t = setup({ webhookId: '' })
    assert.equal((await t.service.handleWebhook({}, '{}')).status, 404)
  })

  it('identifie la commande visée par un événement', () => {
    assert.deepEqual(
      webhookTarget({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { custom_id: 'Order0001abcdefgh', supplementary_data: { related_ids: { order_id: 'PAY00000000000001' } } } }),
      { orderId: 'Order0001abcdefgh', paypalOrderId: 'PAY00000000000001' },
    )
    assert.equal(webhookTarget({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { custom_id: '../x' } }), null)
    assert.equal(isPayPalCertUrl('https://api.paypal.com/v1/notifications/certs/CERT-1'), true)
    assert.equal(isPayPalCertUrl('https://paypal.com.evil.example/cert'), false)
    assert.equal(isPayPalCertUrl('http://api.paypal.com/cert'), false)
  })
})

describe('environnements Sandbox / Live', () => {
  it('PayPal non configuré : aucune commande n’est créée', async () => {
    const t = setup({ configured: false })
    assert.deepEqual(await t.service.createOrder(body(), '203.0.113.7'), { status: 503, json: { error: 'payments_unavailable' } })
    assert.equal(t.store.orders.size, 0)
  })

  it('commande Sandbox après la bascule en Live : jamais payable en Live', async () => {
    const t = setup()
    const ref = await t.order()
    const live = createPayPalClient({ clientId: 'live-id', clientSecret: 'live-secret', env: 'live' }, { fetch: t.sim.fetch })
    t.usePaypal(live)
    assert.deepEqual(await t.service.createPaypalOrder(ref), { status: 409, json: { error: 'env_mismatch' } })
    assert.equal((await t.service.capturePaypalOrder({ ...ref, paypalOrderId: 'PAY00000000000001' })).json.error, 'env_mismatch')
  })

  it('PAYPAL_ENV strict et origines HTTPS seulement en Live', () => {
    assert.equal(parsePayPalEnv('sandbox'), 'sandbox')
    assert.equal(parsePayPalEnv(' live '), 'live')
    assert.equal(parsePayPalEnv('production'), null)
    assert.equal(parsePayPalEnv(''), null)
    assert.deepEqual(allowedOrigins('http://localhost:5173, https://krimossimo.github.io/', 'sandbox'), ['http://localhost:5173', 'https://krimossimo.github.io'])
    assert.deepEqual(allowedOrigins('http://localhost:5173, https://krimossimo.github.io/', 'live'), ['https://krimossimo.github.io'])
  })

  it('simulation de refus PayPal (negative testing) : jamais envoyée en Live', async () => {
    const seen: { url: string; mock: string | null }[] = []
    const fetchSpy = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(input), mock: new Headers(init?.headers).get('PayPal-Mock-Response') })
      const body = String(input).endsWith('/token') ? { access_token: 't', expires_in: 3600 } : { id: 'PAY00000000000001', status: 'COMPLETED' }
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch
    for (const env of ['sandbox', 'live'] as const) {
      await createPayPalClient({ clientId: 'id', clientSecret: 's', env }, { fetch: fetchSpy }).captureOrder('PAY00000000000001', 'k', { mock: 'INSTRUMENT_DECLINED' })
    }
    const captures = seen.filter((c) => c.url.endsWith('/capture'))
    assert.equal(captures[0]!.mock, '{"mock_application_codes":"INSTRUMENT_DECLINED"}')
    assert.ok(captures[0]!.url.startsWith('https://api-m.sandbox.paypal.com'))
    assert.equal(captures[1]!.mock, null)
    assert.ok(captures[1]!.url.startsWith('https://api-m.paypal.com'))
  })

  it('le client REST n’appelle que l’hôte de son environnement', async () => {
    const t = setup()
    const live = createPayPalClient({ clientId: 'x', clientSecret: 'y', env: 'live' }, { fetch: t.sim.fetch })
    await assert.rejects(live.getOrder('PAY00000000000001'), { name: 'PayPalUnreachable' })
  })
})

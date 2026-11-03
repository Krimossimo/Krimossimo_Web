import { describe, expect, it } from 'vitest'
import { OrderApiError, createOrdersClient, isUnconfirmed, isValidApiBaseUrl, parseServerOrder } from './orders'
import { buildOrderRequest, emptyCheckout } from './checkout'

const serverOrder = {
  orderId: 'AbCdEf1234567890',
  accessToken: 'x'.repeat(43),
  status: 'created',
  currency: 'EUR',
  totalCents: 26870,
  items: [
    { offerId: 'fixe', title: 'Prestation', unitCents: 14900, quantity: 1 },
    { offerId: 'multi', title: 'Publication', unitCents: 3990, quantity: 3 },
  ],
  customer: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
  payment: { provider: 'paypal', env: 'sandbox', clientId: 'AbC-sandbox_client1' },
}

/** Faux serveur : renvoie la réponse demandée et mémorise les appels. */
function fakeFetch(reply: { status?: number; body?: unknown } | Error) {
  const calls: { url: string; body: unknown }[] = []
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (reply instanceof Error) throw reply
    return new Response(JSON.stringify(reply.body ?? null), { status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
  return { impl, calls }
}

const request = buildOrderRequest(
  { ...emptyCheckout, firstName: 'Ada', lastName: 'L', email: 'a@b.fr', country: 'France', details: 'x'.repeat(40), consent: true },
  [{ offerId: 'fixe', quantity: 1 }],
  'fr',
)

describe('configuration', () => {
  it('exige HTTPS (sauf émulateur local)', () => {
    expect(isValidApiBaseUrl('https://europe-west1-projet.cloudfunctions.net')).toBe(true)
    expect(isValidApiBaseUrl('http://localhost:5001/projet/europe-west1')).toBe(true)
    expect(isValidApiBaseUrl('http://api.example.com')).toBe(false)
    expect(isValidApiBaseUrl('')).toBe(false)
  })

  it('sans URL, aucun appel n’est tenté', async () => {
    const { impl, calls } = fakeFetch({ body: serverOrder })
    const client = createOrdersClient({ baseUrl: '', fetch: impl })
    await expect(client.createOrder(request)).rejects.toThrow(OrderApiError)
    expect(calls).toHaveLength(0)
  })
})

describe('réponses du serveur', () => {
  it('accepte une commande cohérente', () => {
    expect(parseServerOrder(serverOrder)).toMatchObject({ orderId: 'AbCdEf1234567890', totalCents: 26870, status: 'created' })
  })

  it('rejette une réponse incohérente (total, statut, devise, identifiant)', () => {
    expect(parseServerOrder({ ...serverOrder, totalCents: 100 })).toBeNull()
    expect(parseServerOrder({ ...serverOrder, status: 'shipped' })).toBeNull()
    expect(parseServerOrder({ ...serverOrder, currency: 'BTC' })).toBeNull()
    expect(parseServerOrder({ ...serverOrder, orderId: 'x' })).toBeNull()
    expect(parseServerOrder({ ...serverOrder, items: [] })).toBeNull()
  })

  it('exige les coordonnées enregistrées et un paiement PayPal valide', () => {
    expect(parseServerOrder(serverOrder)?.payment).toEqual({ provider: 'paypal', env: 'sandbox', clientId: 'AbC-sandbox_client1' })
    expect(parseServerOrder({ ...serverOrder, customer: undefined })).toBeNull()
    expect(parseServerOrder({ ...serverOrder, payment: { ...serverOrder.payment, env: 'prod' } })).toBeNull()
    expect(parseServerOrder({ ...serverOrder, payment: { ...serverOrder.payment, clientId: '<script>' } })).toBeNull()
    expect(parseServerOrder({ ...serverOrder, payment: undefined })).toBeNull()
  })
})

describe('appels', () => {
  const base = 'https://api.test'

  it('createOrder envoie la demande et renvoie la commande du serveur', async () => {
    const { impl, calls } = fakeFetch({ status: 201, body: serverOrder })
    const order = await createOrdersClient({ baseUrl: base, fetch: impl }).createOrder(request)
    expect(order.totalCents).toBe(26870)
    expect(calls[0].url).toBe('https://api.test/createOrder')
    expect(JSON.stringify(calls[0].body)).not.toContain('price')
  })

  it('traduit les erreurs HTTP en codes compréhensibles', async () => {
    const cases: [number, unknown, string][] = [
      [422, { error: 'offer_unavailable' }, 'offer-unavailable'],
      [400, { error: 'invalid_request' }, 'invalid-request'],
      [404, { error: 'order_not_found' }, 'order-not-found'],
      [409, { error: 'invalid_state' }, 'invalid-state'],
      [409, { error: 'price_changed' }, 'price-changed'],
      [409, { error: 'order_expired' }, 'order-expired'],
      [409, { error: 'not_approved' }, 'not-approved'],
      [409, { error: 'env_mismatch' }, 'env-mismatch'],
      [429, { error: 'rate_limited' }, 'rate-limited'],
      [503, { error: 'payments_unavailable' }, 'payments-unavailable'],
      [503, { error: 'payment_unconfirmed' }, 'payment-unconfirmed'],
      [503, { error: 'paypal_unreachable' }, 'paypal-unreachable'],
      [502, { error: 'paypal_error' }, 'paypal-error'],
      [500, { error: 'server' }, 'server'],
      [503, null, 'server'],
    ]
    for (const [status, body, code] of cases) {
      const { impl } = fakeFetch({ status, body })
      await expect(createOrdersClient({ baseUrl: base, fetch: impl }).createOrder(request)).rejects.toMatchObject({ code })
    }
  })

  it('erreur réseau et réponse invalide', async () => {
    const network = fakeFetch(new TypeError('Failed to fetch'))
    await expect(createOrdersClient({ baseUrl: base, fetch: network.impl }).getOrderStatus({ orderId: 'AbCdEf1234567890', accessToken: 'x'.repeat(43) })).rejects.toMatchObject({ code: 'network' })
    const bad = fakeFetch({ body: { status: 'livrée' } })
    await expect(createOrdersClient({ baseUrl: base, fetch: bad.impl }).getOrderStatus({ orderId: 'AbCdEf1234567890', accessToken: 'x'.repeat(43) })).rejects.toMatchObject({ code: 'bad-response' })
  })

  it('les statuts viennent uniquement du serveur', async () => {
    const ref = { orderId: 'AbCdEf1234567890', accessToken: 'x'.repeat(43) }
    const paypal = fakeFetch({ body: { paypalOrderId: 'PAYPAL1234567', status: 'payment_pending' } })
    expect(await createOrdersClient({ baseUrl: base, fetch: paypal.impl }).createPaypalOrder(ref)).toEqual({
      paypalOrderId: 'PAYPAL1234567',
      status: 'payment_pending',
    })
    const failed = fakeFetch({ body: { status: 'payment_failed' } })
    expect(await createOrdersClient({ baseUrl: base, fetch: failed.impl }).capturePaypalOrder(ref, 'PAYPAL1234567')).toEqual({
      status: 'payment_failed',
    })
    expect(failed.calls[0].body).toEqual({ ...ref, paypalOrderId: 'PAYPAL1234567' })
  })

  it('transmet les indications du serveur (examen, nouveau moyen de paiement, statut non vérifié)', async () => {
    const ref = { orderId: 'AbCdEf1234567890', accessToken: 'x'.repeat(43) }
    const declined = fakeFetch({ body: { status: 'payment_pending', retry: 'instrument_declined', paid: true } })
    expect(await createOrdersClient({ baseUrl: base, fetch: declined.impl }).capturePaypalOrder(ref, 'PAYPAL1234567')).toEqual({
      status: 'payment_pending',
      retry: 'instrument_declined',
    })
    const stale = fakeFetch({ body: { status: 'payment_pending', review: true, stale: true } })
    expect(await createOrdersClient({ baseUrl: base, fetch: stale.impl }).getOrderStatus(ref)).toEqual({ status: 'payment_pending', review: true, stale: true })
  })

  it('un refus 409 indique le statut réel (par ex. déjà payé)', async () => {
    const ref = { orderId: 'AbCdEf1234567890', accessToken: 'x'.repeat(43) }
    const paid = fakeFetch({ status: 409, body: { error: 'invalid_state', status: 'paid' } })
    await expect(createOrdersClient({ baseUrl: base, fetch: paid.impl }).createPaypalOrder(ref)).rejects.toMatchObject({ code: 'invalid-state', orderStatus: 'paid' })
    const bogus = fakeFetch({ status: 409, body: { error: 'invalid_state', status: 'livrée' } })
    await expect(createOrdersClient({ baseUrl: base, fetch: bogus.impl }).createPaypalOrder(ref)).rejects.toMatchObject({ orderStatus: undefined })
  })

  it('issue inconnue : jamais présentée comme un échec à repayer', () => {
    expect(isUnconfirmed('payment-unconfirmed')).toBe(true)
    expect(isUnconfirmed('network')).toBe(true)
    expect(isUnconfirmed('timeout')).toBe(true)
    expect(isUnconfirmed('not-approved')).toBe(false)
    expect(isUnconfirmed(null)).toBe(false)
  })
})

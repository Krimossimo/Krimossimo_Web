/**
 * Tests de la logique serveur des commandes (node:test) : `npm test` dans functions/.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canTransition,
  centsToValue,
  classifyCaptureIssue,
  createAccessToken,
  isExpired,
  paypalOrderAmountMatches,
  priceOrder,
  samePricing,
  tokenMatches,
  validateOrderRequest,
  verifyCapture,
  type StoredOrder,
} from './orders.js'

const validBody = {
  items: [{ offerId: 'site-vitrine', quantity: 1 }],
  customer: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', country: 'France' },
  project: { details: 'Un site vitrine pour présenter mon activité et mes services.' },
  locale: 'fr',
  website: '',
}

const offer = (extra: Record<string, unknown> = {}) => ({
  title: { fr: 'Site vitrine', en: 'Showcase site' },
  publication: 'published',
  availability: 'available',
  price: 149,
  currency: 'EUR',
  ...extra,
})

describe('validateOrderRequest', () => {
  it('accepte une demande complète et nettoie les champs facultatifs vides', () => {
    const result = validateOrderRequest({ ...validBody, customer: { ...validBody.customer, phone: '', company: '' } })
    assert.equal(result.ok, true)
    if (result.ok) assert.deepEqual(Object.keys(result.value.customer).sort(), ['country', 'email', 'firstName', 'lastName'])
  })

  it('refuse le champ piège rempli', () => {
    assert.deepEqual(validateOrderRequest({ ...validBody, website: 'http://spam' }), { ok: false, error: 'honeypot' })
  })

  it('refuse prix, quantités et identifiants invalides envoyés par le navigateur', () => {
    assert.equal(validateOrderRequest({ ...validBody, items: [] }).ok, false)
    assert.equal(validateOrderRequest({ ...validBody, items: [{ offerId: 'x', quantity: 0 }] }).ok, false)
    assert.equal(validateOrderRequest({ ...validBody, items: [{ offerId: 'x', quantity: 1.5 }] }).ok, false)
    assert.equal(validateOrderRequest({ ...validBody, items: [{ offerId: '../admin', quantity: 1 }] }).ok, false)
    assert.equal(
      validateOrderRequest({ ...validBody, items: [{ offerId: 'a', quantity: 1 }, { offerId: 'a', quantity: 1 }] }).ok,
      false,
    )
    // Un prix envoyé par le navigateur est tout simplement ignoré : il n'existe pas dans le résultat.
    const result = validateOrderRequest({ ...validBody, items: [{ offerId: 'site-vitrine', quantity: 1, price: 1 }] })
    assert.equal(result.ok, true)
    if (result.ok) assert.deepEqual(result.value.items, [{ offerId: 'site-vitrine', quantity: 1 }])
  })

  it('refuse e-mail, téléphone, lien et description invalides', () => {
    assert.equal(validateOrderRequest({ ...validBody, customer: { ...validBody.customer, email: 'pas-un-email' } }).ok, false)
    assert.equal(validateOrderRequest({ ...validBody, customer: { ...validBody.customer, phone: 'abc' } }).ok, false)
    assert.equal(validateOrderRequest({ ...validBody, project: { details: 'trop court' } }).ok, false)
    assert.equal(
      validateOrderRequest({ ...validBody, project: { ...validBody.project, referenceUrl: 'javascript:alert(1)' } }).ok,
      false,
    )
  })
})

describe('priceOrder', () => {
  const request = (items: { offerId: string; quantity: number }[]) => ({ items, locale: 'fr' as const })

  it('calcule le total à partir des prix Firestore, en centimes', () => {
    const result = priceOrder(
      request([
        { offerId: 'a', quantity: 1 },
        { offerId: 'b', quantity: 3 },
      ]),
      new Map([
        ['a', offer()],
        ['b', offer({ price: 39.9, maxQuantity: 5, title: 'Publication' })],
      ]),
    )
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.totalCents, 14900 + 3 * 3990)
      assert.equal(result.currency, 'EUR')
      assert.deepEqual(result.items[1], { offerId: 'b', title: 'Publication', unitCents: 3990, quantity: 3 })
    }
  })

  it('refuse une offre absente, non publiée, indisponible, sans prix ou à prix « à partir de »', () => {
    const one = request([{ offerId: 'a', quantity: 1 }])
    assert.deepEqual(priceOrder(one, new Map()), { ok: false, error: 'offer_unavailable' })
    assert.deepEqual(priceOrder(one, new Map([['a', offer({ publication: 'draft' })]])), { ok: false, error: 'offer_unavailable' })
    assert.deepEqual(priceOrder(one, new Map([['a', offer({ availability: 'unavailable' })]])), { ok: false, error: 'offer_unavailable' })
    assert.deepEqual(priceOrder(one, new Map([['a', offer({ availability: 'out_of_stock' })]])), { ok: false, error: 'offer_unavailable' })
    assert.deepEqual(priceOrder(one, new Map([['a', offer({ price: null })]])), { ok: false, error: 'offer_unavailable' })
    assert.deepEqual(priceOrder(one, new Map([['a', offer({ priceFrom: true })]])), { ok: false, error: 'offer_unavailable' })
  })

  it('applique la quantité maximale (1 par défaut pour une prestation)', () => {
    assert.deepEqual(priceOrder(request([{ offerId: 'a', quantity: 2 }]), new Map([['a', offer()]])), { ok: false, error: 'quantity' })
    assert.equal(priceOrder(request([{ offerId: 'a', quantity: 2 }]), new Map([['a', offer({ maxQuantity: 2 })]])).ok, true)
  })

  it('refuse un panier en plusieurs devises', () => {
    const result = priceOrder(
      request([
        { offerId: 'a', quantity: 1 },
        { offerId: 'b', quantity: 1 },
      ]),
      new Map([
        ['a', offer()],
        ['b', offer({ currency: 'USD' })],
      ]),
    )
    assert.deepEqual(result, { ok: false, error: 'currency_mismatch' })
  })
})

describe('statuts', () => {
  it('n’autorise que les transitions prévues', () => {
    assert.equal(canTransition('created', 'payment_pending'), true)
    assert.equal(canTransition('payment_pending', 'paid'), true)
    assert.equal(canTransition('payment_failed', 'payment_pending'), true)
    assert.equal(canTransition('created', 'paid'), false)
    assert.equal(canTransition('paid', 'cancelled'), false)
    assert.equal(canTransition('paid', 'payment_pending'), false)
    assert.equal(canTransition('paid', 'payment_failed'), false)
  })

  it('une commande annulée peut être payée à nouveau, et une capture confirmée l’emporte', () => {
    assert.equal(canTransition('cancelled', 'payment_pending'), true)
    assert.equal(canTransition('cancelled', 'paid'), true)
    assert.equal(canTransition('payment_failed', 'paid'), true)
  })

  it('expiration : 24 h après la création', () => {
    const created = new Date('2026-11-01T10:00:00Z')
    assert.equal(isExpired(created, new Date('2026-11-02T09:59:00Z')), false)
    assert.equal(isExpired(created, new Date('2026-11-02T10:01:00Z')), true)
  })
})

describe('tarifs relus avant paiement', () => {
  const frozen = { items: [{ offerId: 'a', title: 'A', unitCents: 14900, quantity: 1 }], totalCents: 14900, currency: 'EUR' }
  it('détecte un prix, une quantité ou une devise différents', () => {
    assert.equal(samePricing(frozen, { ...frozen, items: [{ ...frozen.items[0]!, title: 'Autre titre' }] }), true)
    assert.equal(samePricing(frozen, { items: [{ ...frozen.items[0]!, unitCents: 15900 }], totalCents: 15900, currency: 'EUR' }), false)
    assert.equal(samePricing(frozen, { ...frozen, currency: 'USD' }), false)
    assert.equal(samePricing(frozen, { items: [], totalCents: 14900, currency: 'EUR' }), false)
  })
})

describe('jeton d’accès', () => {
  it('ne correspond qu’au bon jeton', () => {
    const { token, hash } = createAccessToken()
    assert.equal(tokenMatches(token, hash), true)
    assert.equal(tokenMatches(`${token}x`, hash), false)
    assert.equal(tokenMatches(undefined, hash), false)
    assert.ok(!hash.includes(token))
  })
})

describe('vérification de la capture', () => {
  const order: StoredOrder = {
    status: 'payment_pending',
    totalCents: 14900,
    currency: 'EUR',
    paypalOrderId: 'PAYPAL1234567',
    paypalOrderIds: ['PAYPALOLD1234', 'PAYPAL1234567'],
  }
  const capture = (extra: Record<string, unknown> = {}, captureExtra: Record<string, unknown> = {}) => ({
    id: 'PAYPAL1234567',
    status: 'COMPLETED',
    purchase_units: [
      {
        reference_id: 'order123456',
        amount: { currency_code: 'EUR', value: '149.00' },
        payments: { captures: [{ id: 'CAP1', status: 'COMPLETED', amount: { currency_code: 'EUR', value: '149.00' }, ...captureExtra }] },
      },
    ],
    ...extra,
  })

  it('accepte une capture conforme', () => {
    assert.deepEqual(verifyCapture(capture(), 'order123456', order), {
      ok: true,
      capture: { captureId: 'CAP1', paypalOrderId: 'PAYPAL1234567', amount: { currency: 'EUR', value: '149.00' } },
    })
    assert.equal(centsToValue(14900), '149.00')
  })

  it('accepte une ancienne commande PayPal de la même commande (nouvelle tentative)', () => {
    const result = verifyCapture(capture({ id: 'PAYPALOLD1234' }), 'order123456', order)
    assert.equal(result.ok, true)
  })

  it('refuse montant, devise, référence ou identifiant PayPal différents', () => {
    const lower = verifyCapture(capture({}, { amount: { currency_code: 'EUR', value: '1.00' } }), 'order123456', order)
    assert.deepEqual(lower, { ok: false, reason: 'amount_mismatch', mismatch: true })
    assert.equal(verifyCapture(capture({}, { amount: { currency_code: 'USD', value: '149.00' } }), 'order123456', order).ok, false)
    assert.equal(verifyCapture(capture(), 'autre-commande', order).ok, false)
    assert.deepEqual(verifyCapture(capture({ id: 'AUTREPAYPAL123' }), 'order123456', order), { ok: false, reason: 'paypal_order_mismatch' })
    assert.equal(verifyCapture(capture({ status: 'APPROVED' }, { status: 'X' }), 'order123456', order).ok, false)
    assert.equal(verifyCapture(null, 'order123456', order).ok, false)
  })

  it('capture PENDING : en attente ; DECLINED : refusée', () => {
    assert.deepEqual(verifyCapture(capture({}, { status: 'PENDING' }), 'order123456', order), { ok: false, reason: 'capture_pending', pending: true })
    assert.deepEqual(verifyCapture(capture({}, { status: 'DECLINED' }), 'order123456', order), { ok: false, reason: 'capture_declined', declined: true })
  })

  it('réutilisation d’une commande PayPal : montant et référence identiques', () => {
    assert.equal(paypalOrderAmountMatches(capture(), 'order123456', order), true)
    assert.equal(paypalOrderAmountMatches(capture(), 'autre123456', order), false)
    assert.equal(paypalOrderAmountMatches(capture({ purchase_units: [{ reference_id: 'order123456', amount: { currency_code: 'EUR', value: '1.00' } }] }), 'order123456', order), false)
  })

  it('classe les refus de capture de PayPal', () => {
    assert.equal(classifyCaptureIssue('INSTRUMENT_DECLINED'), 'retry')
    assert.equal(classifyCaptureIssue('ORDER_NOT_APPROVED'), 'notReady')
    assert.equal(classifyCaptureIssue('ORDER_ALREADY_CAPTURED'), 'captured')
    assert.equal(classifyCaptureIssue('TRANSACTION_REFUSED'), 'failed')
    assert.equal(classifyCaptureIssue(undefined), 'failed')
  })
})

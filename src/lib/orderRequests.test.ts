import { describe, expect, it } from 'vitest'
import { summarizeCart } from '../cart/cart'
import type { Offer } from '../types/content'
import { emptyCheckout, type CheckoutValues } from './checkout'
import {
  OrderRequestError,
  REFERENCE_PATTERN,
  buildOrderRequestDoc,
  makeReference,
  orderRequestEmail,
  submitOrderRequest,
  type OrderRequestDoc,
} from './orderRequests'

const offer = (id: string, price: number, extra: Partial<Offer> = {}): Offer =>
  ({
    id,
    title: { fr: `Offre ${id}`, en: `Offer ${id}` },
    description: 'Description',
    price,
    priceFrom: false,
    currency: 'EUR',
    availability: 'available',
    publication: 'published',
    contactSubject: 'website',
    maxQuantity: 3,
    ...extra,
  }) as Offer

const catalog = [offer('site', 490), offer('logo', 120.5)]
const summary = summarizeCart({ lines: [{ offerId: 'site', quantity: 1 }, { offerId: 'logo', quantity: 2 }] }, catalog)

const values: CheckoutValues = {
  ...emptyCheckout,
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  country: 'France',
  details: 'Un site vitrine de cinq pages pour présenter mon atelier.',
  deadline: 'one-month',
  consent: true,
}

describe('commande sans paiement en ligne', () => {
  it('référence lisible et conforme', () => {
    const ref = makeReference(new Date('2026-11-12T10:00:00Z'), (n) => new Uint8Array(n).fill(0))
    expect(ref).toBe('KRM-20261112-AAAAAA')
    expect(REFERENCE_PATTERN.test(ref)).toBe(true)
    expect(REFERENCE_PATTERN.test(makeReference())).toBe(true)
  })

  it('document : prix du catalogue, champs vides retirés', () => {
    const doc = buildOrderRequestDoc(summary, values, 'fr', 'KRM-20261112-ABCDEF')
    expect(doc).toEqual({
      reference: 'KRM-20261112-ABCDEF',
      items: [
        { offerId: 'site', title: 'Offre site', quantity: 1, unitCents: 49000 },
        { offerId: 'logo', title: 'Offre logo', quantity: 2, unitCents: 12050 },
      ],
      currency: 'EUR',
      totalCents: 73100,
      customer: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', country: 'France' },
      project: { details: values.details, deadline: 'one-month' },
      locale: 'fr',
      status: 'new',
    })
  })

  it('e-mail récapitulatif', () => {
    const fields = orderRequestEmail(buildOrderRequestDoc(summary, values, 'fr', 'KRM-20261112-ABCDEF'))
    expect(fields.subject).toContain('KRM-20261112-ABCDEF')
    expect(fields.replyto).toBe('ada@example.com')
    expect(fields.prestations).toContain('Offre logo × 2')
    expect(fields.delai).toBe('D’ici un mois')
    expect(fields.message).toBe(values.details)
  })

  it('reçue si au moins un canal confirme, jamais sinon', async () => {
    const saved: OrderRequestDoc[] = []
    const ok = await submitOrderRequest(summary, values, 'fr', 10000, {
      save: async (_ref, doc) => {
        saved.push(doc)
      },
      email: async () => {
        throw new Error('down')
      },
    })
    expect(ok).toMatchObject({ stored: true, emailed: false })
    expect(saved[0].reference).toBe(ok.reference)

    const mailOnly = await submitOrderRequest(summary, values, 'fr', 10000, { save: null, email: async () => {} })
    expect(mailOnly).toMatchObject({ stored: false, emailed: true })

    const fail = async () => {
      throw new Error('x')
    }
    await expect(submitOrderRequest(summary, values, 'fr', 10000, { save: fail, email: fail })).rejects.toMatchObject({ code: 'failed' })
    await expect(submitOrderRequest(summary, values, 'fr', 10000, { save: null, email: null })).rejects.toMatchObject({ code: 'not-configured' })
  })

  it('refuse les robots avant tout envoi', async () => {
    let calls = 0
    const deps = { save: async () => void calls++, email: async () => void calls++ }
    await expect(submitOrderRequest(summary, values, 'fr', 1000, deps)).rejects.toMatchObject({ code: 'too-fast' })
    await expect(submitOrderRequest(summary, { ...values, website: 'x' }, 'fr', 10000, deps)).rejects.toBeInstanceOf(OrderRequestError)
    expect(calls).toBe(0)
  })
})

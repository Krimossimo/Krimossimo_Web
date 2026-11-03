import { describe, expect, it } from 'vitest'
import type { Offer } from '../types/content'
import {
  CART_TTL_MS,
  addOffer,
  emptyCart,
  hasQuantity,
  lineCount,
  parseStoredCart,
  purchaseBlock,
  removeLine,
  serializeCart,
  setQuantity,
  summarizeCart,
  toCents,
  type CartState,
} from './cart'

const offer = (id: string, extra: Partial<Offer> = {}): Offer => ({
  id,
  title: id,
  description: 'd',
  price: 149,
  currency: 'EUR',
  availability: 'available',
  contactSubject: 'other',
  createdAt: '2026-01-01T00:00:00.000Z',
  publication: 'published',
  ...extra,
})

const fixed = offer('fixe')
const multi = offer('multi', { price: 39.9, maxQuantity: 5 })
const onQuote = offer('devis', { price: null })
const fromPrice = offer('a-partir', { price: 290, priceFrom: true })
const unavailable = offer('indispo', { availability: 'unavailable' })
const dollars = offer('dollars', { currency: 'USD' })
const catalog = [fixed, multi, onQuote, fromPrice, unavailable, dollars]

const add = (state: CartState, o: Offer) => {
  const result = addOffer(state, o, catalog)
  if (!result.ok) throw new Error(result.reason)
  return result.state
}

describe('règles d’achat', () => {
  it('seules les offres disponibles à prix fixe sont achetables', () => {
    expect(purchaseBlock(fixed)).toBeNull()
    expect(purchaseBlock(onQuote)).toBe('quote-only')
    expect(purchaseBlock(fromPrice)).toBe('quote-only')
    expect(purchaseBlock(unavailable)).toBe('unavailable')
    expect(purchaseBlock(offer('complet', { availability: 'out_of_stock' }))).toBe('out-of-stock')
    expect(purchaseBlock(offer('brouillon', { publication: 'draft' }))).toBe('unpublished')
  })

  it('une prestation n’a pas de quantité, sauf si l’offre l’autorise', () => {
    expect(hasQuantity(fixed)).toBe(false)
    expect(hasQuantity(multi)).toBe(true)
  })
})

describe('ajout', () => {
  it('ajoute une offre achetable', () => {
    expect(add(emptyCart, fixed).lines).toEqual([{ offerId: 'fixe', quantity: 1 }])
  })

  it('refuse les offres indisponibles ou sur devis', () => {
    expect(addOffer(emptyCart, unavailable, catalog)).toEqual({ ok: false, reason: 'unavailable' })
    expect(addOffer(emptyCart, onQuote, catalog)).toEqual({ ok: false, reason: 'quote-only' })
    expect(addOffer(emptyCart, fromPrice, catalog)).toEqual({ ok: false, reason: 'quote-only' })
  })

  it('ne duplique pas une prestation unique', () => {
    const state = add(emptyCart, fixed)
    expect(addOffer(state, fixed, catalog)).toEqual({ ok: false, reason: 'max-quantity' })
  })

  it('incrémente une offre à plusieurs unités jusqu’au maximum', () => {
    let state = emptyCart
    for (let i = 0; i < 5; i++) state = add(state, multi)
    expect(state.lines).toEqual([{ offerId: 'multi', quantity: 5 }])
    expect(addOffer(state, multi, catalog)).toEqual({ ok: false, reason: 'max-quantity' })
  })

  it('refuse de mélanger les devises', () => {
    expect(addOffer(add(emptyCart, fixed), dollars, catalog)).toEqual({ ok: false, reason: 'currency-mismatch' })
  })
})

describe('modification et suppression', () => {
  it('borne la quantité entre 1 et le maximum', () => {
    const state = add(emptyCart, multi)
    expect(setQuantity(state, 'multi', 3, 5).lines[0].quantity).toBe(3)
    expect(setQuantity(state, 'multi', 99, 5).lines[0].quantity).toBe(5)
    expect(setQuantity(state, 'multi', 0, 5).lines[0].quantity).toBe(1)
    expect(setQuantity(state, 'multi', Number.NaN, 5).lines[0].quantity).toBe(1)
  })

  it('retire une ligne', () => {
    const state = add(add(emptyCart, fixed), multi)
    expect(removeLine(state, 'fixe').lines.map((l) => l.offerId)).toEqual(['multi'])
    expect(lineCount(state)).toBe(2)
  })
})

describe('calculs', () => {
  it('calcule en centimes sans erreur d’arrondi', () => {
    expect(toCents(39.9)).toBe(3990)
    expect(toCents(0.1 + 0.2)).toBe(30)
    const state = setQuantity(add(add(emptyCart, fixed), multi), 'multi', 3, 5)
    const summary = summarizeCart(state, catalog)
    expect(summary.totalCents).toBe(14900 + 3 * 3990)
    expect(summary.itemCount).toBe(4)
    expect(summary.currency).toBe('EUR')
    expect(summary.canCheckout).toBe(true)
  })

  it('relit les prix dans le catalogue actuel (jamais depuis le stockage)', () => {
    const state = add(emptyCart, fixed)
    const updated = summarizeCart(state, [offer('fixe', { price: 199 })])
    expect(updated.totalCents).toBe(19900)
  })

  it('isole les lignes devenues inachetables et bloque la commande', () => {
    const state = add(add(emptyCart, fixed), multi)
    const summary = summarizeCart(state, [fixed, offer('multi', { availability: 'unavailable' })])
    expect(summary.lines.map((l) => l.offer.id)).toEqual(['fixe'])
    expect(summary.blocked).toMatchObject([{ offerId: 'multi', reason: 'unavailable' }])
    expect(summary.totalCents).toBe(14900)
    expect(summary.canCheckout).toBe(false)
  })

  it('signale une offre retirée du catalogue', () => {
    const summary = summarizeCart({ lines: [{ offerId: 'disparue', quantity: 1 }] }, catalog)
    expect(summary.blocked).toMatchObject([{ offerId: 'disparue', reason: 'unknown' }])
    expect(summary.canCheckout).toBe(false)
  })

  it('panier vide : total nul, commande impossible', () => {
    const summary = summarizeCart(emptyCart, catalog)
    expect(summary.totalCents).toBe(0)
    expect(summary.currency).toBeNull()
    expect(summary.canCheckout).toBe(false)
  })
})

describe('persistance', () => {
  const now = Date.parse('2026-10-22T12:00:00Z')

  it('aller-retour sans prix ni donnée personnelle', () => {
    const state = add(emptyCart, fixed)
    const raw = serializeCart(state, now)
    expect(JSON.parse(raw)).toEqual({ v: 1, savedAt: now, lines: [{ offerId: 'fixe', quantity: 1 }] })
    expect(parseStoredCart(raw, now)).toEqual(state)
  })

  it('ignore un panier expiré, corrompu ou falsifié', () => {
    expect(parseStoredCart(serializeCart({ lines: [{ offerId: 'fixe', quantity: 1 }] }, now - CART_TTL_MS - 1), now)).toEqual(emptyCart)
    expect(parseStoredCart('{pas du json', now)).toEqual(emptyCart)
    expect(parseStoredCart(null, now)).toEqual(emptyCart)
    expect(parseStoredCart(JSON.stringify({ v: 2, savedAt: now, lines: [] }), now)).toEqual(emptyCart)
    const tampered = JSON.stringify({
      v: 1,
      savedAt: now,
      lines: [
        { offerId: 'ok', quantity: 2 },
        { offerId: '<script>', quantity: 1 },
        { offerId: 'quantite', quantity: 999 },
        { offerId: 'ok', quantity: 1 },
        { offerId: 'prix', quantity: 1, price: 0 },
      ],
    })
    expect(parseStoredCart(tampered, now)).toEqual({
      lines: [
        { offerId: 'ok', quantity: 2 },
        { offerId: 'prix', quantity: 1 },
      ],
    })
  })
})

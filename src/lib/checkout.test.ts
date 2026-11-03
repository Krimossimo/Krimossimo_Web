import { describe, expect, it } from 'vitest'
import { buildOrderRequest, emptyCheckout, validateCheckout, validateCheckoutField, type CheckoutValues } from './checkout'

const valid: CheckoutValues = {
  ...emptyCheckout,
  firstName: ' Ada ',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  country: 'France',
  details: 'Un site vitrine pour présenter mon activité et mes services.',
  consent: true,
}

describe('validation du formulaire de commande', () => {
  it('formulaire vide : nom, prénom, e-mail, pays, besoin et consentement requis', () => {
    expect(Object.keys(validateCheckout(emptyCheckout)).sort()).toEqual(
      ['consent', 'country', 'details', 'email', 'firstName', 'lastName'].sort(),
    )
  })

  it('formulaire valide : aucune erreur', () => {
    expect(validateCheckout(valid)).toEqual({})
  })

  it('les champs facultatifs vides sont acceptés, remplis ils sont vérifiés', () => {
    expect(validateCheckoutField('phone', valid)).toBeUndefined()
    expect(validateCheckoutField('phone', { ...valid, phone: '+33 6 12 34 56 78' })).toBeUndefined()
    expect(validateCheckoutField('phone', { ...valid, phone: 'abc' })).toEqual({ code: 'phone' })
    expect(validateCheckoutField('referenceUrl', { ...valid, referenceUrl: 'https://example.com' })).toBeUndefined()
    expect(validateCheckoutField('referenceUrl', { ...valid, referenceUrl: 'javascript:alert(1)' })).toEqual({ code: 'url' })
    expect(validateCheckoutField('referenceUrl', { ...valid, referenceUrl: 'exemple.fr' })).toEqual({ code: 'url' })
  })

  it('messages précis : e-mail, longueur, consentement', () => {
    expect(validateCheckoutField('email', { ...valid, email: 'ada@' })).toEqual({ code: 'email' })
    expect(validateCheckoutField('details', { ...valid, details: 'Trop court' })).toEqual({ code: 'tooShort', min: 30 })
    expect(validateCheckoutField('firstName', { ...valid, firstName: 'x'.repeat(81) })).toEqual({ code: 'tooLong', max: 80 })
    expect(validateCheckoutField('consent', { ...valid, consent: false })).toEqual({ code: 'consent' })
  })
})

describe('demande envoyée au serveur', () => {
  it('ne contient que des identifiants et des quantités, aucun prix', () => {
    const request = buildOrderRequest(valid, [{ offerId: 'fixe', quantity: 1 }], 'fr')
    expect(request.items).toEqual([{ offerId: 'fixe', quantity: 1 }])
    expect(JSON.stringify(request)).not.toContain('price')
    expect(request.customer).toEqual({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', country: 'France' })
    expect(request.project).toEqual({ details: valid.details })
  })
})

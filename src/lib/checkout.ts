/**
 * Formulaire de commande : champs, validation et construction de la demande envoyée
 * au serveur. Le serveur refait toutes ces vérifications : celles-ci servent au confort
 * de saisie, pas à la sécurité.
 */
import { EMAIL_PATTERN } from './patterns'

export const checkoutLimits = {
  name: 80,
  company: 120,
  country: 60,
  phone: 25,
  detailsMin: 30,
  detailsMax: 3000,
  url: 500,
} as const

export const deadlines = ['flexible', 'asap', 'one-month', 'three-months'] as const
export type Deadline = (typeof deadlines)[number]

export type CheckoutValues = {
  firstName: string
  lastName: string
  email: string
  phone: string
  company: string
  country: string
  details: string
  referenceUrl: string
  deadline: Deadline | ''
  consent: boolean
  /** Champ piège invisible : doit rester vide. */
  website: string
}

export type CheckoutField = Exclude<keyof CheckoutValues, 'website'>

export const checkoutFields: CheckoutField[] = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'country',
  'details',
  'referenceUrl',
  'deadline',
  'consent',
]

export const requiredCheckoutFields: CheckoutField[] = ['firstName', 'lastName', 'email', 'country', 'details', 'consent']

export type CheckoutError =
  | { code: 'required' }
  | { code: 'email' }
  | { code: 'phone' }
  | { code: 'url' }
  | { code: 'consent' }
  | { code: 'tooShort'; min: number }
  | { code: 'tooLong'; max: number }

export type CheckoutErrors = Partial<Record<CheckoutField, CheckoutError>>

export const emptyCheckout: CheckoutValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  country: '',
  details: '',
  referenceUrl: '',
  deadline: '',
  consent: false,
  website: '',
}

const PHONE_PATTERN = /^\+?[0-9][0-9 ().-]{5,23}$/

function text(value: string, { required, max, min }: { required: boolean; max: number; min?: number }): CheckoutError | undefined {
  const trimmed = value.trim()
  if (!trimmed) return required ? { code: 'required' } : undefined
  if (min !== undefined && trimmed.length < min) return { code: 'tooShort', min }
  if (trimmed.length > max) return { code: 'tooLong', max }
  return undefined
}

export function validateCheckoutField(field: CheckoutField, values: CheckoutValues): CheckoutError | undefined {
  switch (field) {
    case 'firstName':
    case 'lastName':
      return text(values[field], { required: true, max: checkoutLimits.name })
    case 'email': {
      const value = values.email.trim()
      if (!value) return { code: 'required' }
      if (value.length > 254) return { code: 'tooLong', max: 254 }
      return EMAIL_PATTERN.test(value) ? undefined : { code: 'email' }
    }
    case 'phone': {
      const value = values.phone.trim()
      if (!value) return undefined
      return PHONE_PATTERN.test(value) ? undefined : { code: 'phone' }
    }
    case 'company':
      return text(values.company, { required: false, max: checkoutLimits.company })
    case 'country':
      return text(values.country, { required: true, max: checkoutLimits.country })
    case 'details':
      return text(values.details, { required: true, min: checkoutLimits.detailsMin, max: checkoutLimits.detailsMax })
    case 'referenceUrl': {
      const value = values.referenceUrl.trim()
      if (!value) return undefined
      if (value.length > checkoutLimits.url) return { code: 'tooLong', max: checkoutLimits.url }
      try {
        const url = new URL(value)
        return url.protocol === 'https:' || url.protocol === 'http:' ? undefined : { code: 'url' }
      } catch {
        return { code: 'url' }
      }
    }
    case 'deadline':
      return values.deadline === '' || (deadlines as readonly string[]).includes(values.deadline) ? undefined : { code: 'required' }
    case 'consent':
      return values.consent ? undefined : { code: 'consent' }
  }
}

export function validateCheckout(values: CheckoutValues): CheckoutErrors {
  const errors: CheckoutErrors = {}
  for (const field of checkoutFields) {
    const error = validateCheckoutField(field, values)
    if (error) errors[field] = error
  }
  return errors
}

/** Demande de commande envoyée au serveur : identifiants et quantités, jamais de prix. */
export type OrderRequest = {
  items: { offerId: string; quantity: number }[]
  customer: { firstName: string; lastName: string; email: string; phone?: string; company?: string; country: string }
  project: { details: string; referenceUrl?: string; deadline?: Deadline }
  locale: 'fr' | 'en'
  /** Champ piège transmis tel quel : le serveur rejette la demande s'il est rempli. */
  website: string
}

export function buildOrderRequest(
  values: CheckoutValues,
  items: { offerId: string; quantity: number }[],
  locale: 'fr' | 'en',
): OrderRequest {
  const optional = (value: string) => (value.trim() ? value.trim() : undefined)
  return {
    items: items.map(({ offerId, quantity }) => ({ offerId, quantity })),
    customer: {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim(),
      phone: optional(values.phone),
      company: optional(values.company),
      country: values.country.trim(),
    },
    project: {
      details: values.details.trim(),
      referenceUrl: optional(values.referenceUrl),
      deadline: values.deadline || undefined,
    },
    locale,
    website: values.website,
  }
}

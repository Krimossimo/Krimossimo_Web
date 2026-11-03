import { useTranslation } from 'react-i18next'
import type { Currency, Locale, Money, Translatable } from '../types/content'

export type { Locale }

/** Langue active du site, réduite à 'fr' ou 'en'. */
export function useLocale(): Locale {
  const { i18n } = useTranslation()
  return i18n.resolvedLanguage === 'en' ? 'en' : 'fr'
}

/** Texte dans la langue active (un texte simple est identique dans les deux langues). */
export function pick(text: Translatable, locale: Locale): string {
  return typeof text === 'string' ? text : text[locale]
}

/** Premier paragraphe d'un texte (pour un résumé de carte). */
export function firstParagraph(text: string): string {
  return text.split(/\n\s*\n/)[0]?.trim() ?? ''
}

const intlLocale: Record<Locale, string> = { fr: 'fr-FR', en: 'en-GB' }

export function formatPrice(amount: number, currency: Currency, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount)
}

/** Montant en centimes (calculs du panier et réponses du serveur). */
export function formatCents(cents: number, currency: Currency, locale: Locale): string {
  return formatPrice(cents / 100, currency, locale)
}

export function formatMoney(money: Money, locale: Locale): string {
  return formatPrice(money.amount, money.currency, locale)
}

export function formatDate(iso: string, locale: Locale): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(intlLocale[locale], { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

export function yearOf(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : String(date.getUTCFullYear())
}

/** Préfixe un chemin de public/ avec la base du site (utile sur GitHub Pages). */
export function assetUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}

/**
 * Formulaires d'administration (projets, offres, jeux) — logique pure, testée.
 *
 * Chaque formulaire manipule des chaînes (valeurs des champs), puis :
 *  1. validateXxx() renvoie des erreurs par champ, traduites dans l'interface ;
 *  2. xxxInput() construit le document attendu par content/validation.ts ;
 *  3. prepareContentWrite() (contentAdmin.ts) revalide et ajoute auteur + horodatage serveur.
 * Les règles Firestore refont tous ces contrôles côté serveur.
 */
import { isRecord, safeExternalUrl, safeImageSrc, toIsoDate } from '../content/validation'
import {
  contactSubjects,
  currencies,
  offerAvailabilities,
  projectCategories,
  projectProgresses,
  type ContactSubject,
  type Currency,
  type OfferAvailability,
  type ProjectCategory,
  type ProjectProgress,
  type PublicationStatus,
  type Translatable,
} from '../types/content'

/* ----------------------------------------------------------------- Communs */

export type Bilingual = { fr: string; en: string }
export const emptyBilingual: Bilingual = { fr: '', en: '' }

/** Français obligatoire ; anglais facultatif (à défaut, le texte français est affiché partout). */
export function toTranslatable(value: Bilingual): Translatable {
  const fr = value.fr.trim()
  const en = value.en.trim()
  return en ? { fr, en } : fr
}

export function fromTranslatable(value: unknown): Bilingual {
  if (typeof value === 'string') return { fr: value, en: '' }
  if (isRecord(value)) {
    const fr = typeof value.fr === 'string' ? value.fr : ''
    const en = typeof value.en === 'string' ? value.en : ''
    return fr === en ? { fr, en: '' } : { fr, en }
  }
  return { ...emptyBilingual }
}

export const limits = { title: 140, description: 6000, alt: 250, conditions: 600, url: 2048, storeName: 60, stack: 20, tech: 40 }

export type FieldError =
  | { code: 'required' }
  | { code: 'tooLong'; max: number }
  | { code: 'slug' }
  | { code: 'slugTaken' }
  | { code: 'url' }
  | { code: 'date' }
  | { code: 'price' }
  | { code: 'quantity' }
  | { code: 'imageRequired' }
  | { code: 'stack' }

export type FormErrors = Record<string, FieldError>

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Identifiant d'URL à partir d'un titre : minuscules, chiffres, tirets. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Date AAAA-MM-JJ pour un champ <input type="date">. */
export function dateField(value: unknown): string {
  const iso = toIsoDate(value)
  return iso ? iso.slice(0, 10) : today()
}

function checkBilingual(errors: FormErrors, key: string, value: Bilingual, max: number, required = true) {
  const fr = value.fr.trim()
  const en = value.en.trim()
  if (!fr) {
    if (required || en) errors[`${key}.fr`] = { code: 'required' }
  } else if (fr.length > max) errors[`${key}.fr`] = { code: 'tooLong', max }
  if (en.length > max) errors[`${key}.en`] = { code: 'tooLong', max }
}

function checkSlug(errors: FormErrors, id: string) {
  if (!id) errors.id = { code: 'required' }
  // « new » est réservé à l'adresse de création (/admin/…/new).
  else if (id.length > 80 || !SLUG.test(id) || id === 'new') errors.id = { code: 'slug' }
}

function checkDate(errors: FormErrors, key: string, value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !toIsoDate(value)) errors[key] = { code: 'date' }
}

function checkUrl(errors: FormErrors, key: string, value: string, required: boolean) {
  const v = value.trim()
  if (!v) {
    if (required) errors[key] = { code: 'required' }
    return
  }
  if (v.length > limits.url || !safeExternalUrl(v)) errors[key] = { code: 'url' }
}

/** Montant saisi (« 149 », « 39,90 », « 39.9 ») → nombre, ou null si invalide. */
export function parseAmount(value: string): number | null {
  const v = value.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(v)) return null
  const n = Number(v)
  return Number.isFinite(n) && n <= 1_000_000 ? n : null
}

export function amountField(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value).replace('.', ',') : ''
}

/** Image : adresse actuelle + texte alternatif. */
export type ImageFormValue = { src: string; alt: Bilingual }

function imageFromDoc(value: unknown): ImageFormValue {
  if (isRecord(value) && typeof value.src === 'string') return { src: value.src, alt: fromTranslatable(value.alt) }
  return { src: '', alt: { ...emptyBilingual } }
}

function checkImage(errors: FormErrors, image: ImageFormValue, hasNewFile: boolean, required: boolean) {
  const present = Boolean(image.src) || hasNewFile
  if (!present) {
    if (required) errors.image = { code: 'imageRequired' }
    return
  }
  if (image.src && !hasNewFile && !safeImageSrc(image.src)) errors.image = { code: 'url' }
  checkBilingual(errors, 'alt', image.alt, limits.alt)
}

/** Champs non gérés par le formulaire, recopiés tels quels pour ne rien perdre à l'enregistrement. */
function preserve(data: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((k) => data[k] !== undefined && data[k] !== null).map((k) => [k, data[k]]))
}

/* ----------------------------------------------------------------- Projets */

export type ProjectForm = {
  id: string
  title: Bilingual
  description: Bilingual
  category: ProjectCategory
  image: ImageFormValue
  externalUrl: string
  progress: ProjectProgress | ''
  stack: string
  featured: boolean
  createdAt: string
  publication: PublicationStatus
  preserved: Record<string, unknown>
}

export function emptyProjectForm(): ProjectForm {
  return {
    id: '',
    title: { ...emptyBilingual },
    description: { ...emptyBilingual },
    category: 'website',
    image: { src: '', alt: { ...emptyBilingual } },
    externalUrl: '',
    progress: '',
    stack: '',
    featured: false,
    createdAt: today(),
    publication: 'draft',
    preserved: {},
  }
}

export function projectFormFromDoc(id: string, data: Record<string, unknown>): ProjectForm {
  return {
    id,
    title: fromTranslatable(data.title),
    description: fromTranslatable(data.description),
    category: (projectCategories as readonly unknown[]).includes(data.category) ? (data.category as ProjectCategory) : 'website',
    image: imageFromDoc(data.cover),
    externalUrl: typeof data.externalUrl === 'string' ? data.externalUrl : '',
    progress: (projectProgresses as readonly unknown[]).includes(data.progress) ? (data.progress as ProjectProgress) : '',
    stack: Array.isArray(data.stack) ? data.stack.filter((s) => typeof s === 'string').join(', ') : '',
    featured: data.featured === true,
    createdAt: dateField(data.createdAt),
    publication: data.publication === 'published' ? 'published' : 'draft',
    preserved: preserve(data, ['summary', 'order']),
  }
}

export function splitStack(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function validateProjectForm(form: ProjectForm, { hasNewFile = false } = {}): FormErrors {
  const errors: FormErrors = {}
  checkSlug(errors, form.id)
  checkBilingual(errors, 'title', form.title, limits.title)
  checkBilingual(errors, 'description', form.description, limits.description)
  checkImage(errors, form.image, hasNewFile, false)
  checkUrl(errors, 'externalUrl', form.externalUrl, false)
  const stack = splitStack(form.stack)
  if (stack.length > limits.stack || stack.some((s) => s.length > limits.tech)) errors.stack = { code: 'stack' }
  checkDate(errors, 'createdAt', form.createdAt)
  return errors
}

/** Document « projet » (sans auteur ni horodatage) à partir du formulaire et de l'adresse d'image finale. */
export function projectInput(form: ProjectForm, imageSrc: string): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    ...form.preserved,
    id: form.id,
    title: toTranslatable(form.title),
    description: toTranslatable(form.description),
    category: form.category,
    createdAt: form.createdAt,
    publication: form.publication,
  }
  if (imageSrc) doc.cover = { src: imageSrc, alt: toTranslatable(form.image.alt) }
  if (form.externalUrl.trim()) doc.externalUrl = form.externalUrl.trim()
  if (form.progress) doc.progress = form.progress
  const stack = splitStack(form.stack)
  if (stack.length) doc.stack = stack
  if (form.featured) doc.featured = true
  return doc
}

/* ------------------------------------------------------------------ Offres */

export const priceModes = ['fixed', 'from', 'quote'] as const
export type PriceMode = (typeof priceModes)[number]

export type OfferForm = {
  id: string
  title: Bilingual
  description: Bilingual
  priceMode: PriceMode
  price: string
  currency: Currency
  availability: OfferAvailability
  maxQuantity: string
  conditions: Bilingual
  contactSubject: ContactSubject
  createdAt: string
  publication: PublicationStatus
  preserved: Record<string, unknown>
}

export function emptyOfferForm(): OfferForm {
  return {
    id: '',
    title: { ...emptyBilingual },
    description: { ...emptyBilingual },
    priceMode: 'quote',
    price: '',
    currency: 'EUR',
    availability: 'available',
    maxQuantity: '',
    conditions: { ...emptyBilingual },
    contactSubject: 'other',
    createdAt: today(),
    publication: 'draft',
    preserved: {},
  }
}

export function offerFormFromDoc(id: string, data: Record<string, unknown>): OfferForm {
  const hasPrice = typeof data.price === 'number'
  return {
    id,
    title: fromTranslatable(data.title),
    description: fromTranslatable(data.description),
    priceMode: !hasPrice ? 'quote' : data.priceFrom === true ? 'from' : 'fixed',
    price: amountField(data.price),
    currency: (currencies as readonly unknown[]).includes(data.currency) ? (data.currency as Currency) : 'EUR',
    availability: (offerAvailabilities as readonly unknown[]).includes(data.availability) ? (data.availability as OfferAvailability) : 'available',
    maxQuantity: typeof data.maxQuantity === 'number' ? String(data.maxQuantity) : '',
    conditions: fromTranslatable(data.conditions),
    contactSubject: (contactSubjects as readonly unknown[]).includes(data.contactSubject) ? (data.contactSubject as ContactSubject) : 'other',
    createdAt: dateField(data.createdAt),
    publication: data.publication === 'published' ? 'published' : 'draft',
    preserved: preserve(data, ['order']),
  }
}

export function validateOfferForm(form: OfferForm): FormErrors {
  const errors: FormErrors = {}
  checkSlug(errors, form.id)
  checkBilingual(errors, 'title', form.title, limits.title)
  checkBilingual(errors, 'description', form.description, limits.description)
  checkBilingual(errors, 'conditions', form.conditions, limits.conditions, false)
  if (form.priceMode !== 'quote') {
    const amount = parseAmount(form.price)
    if (!form.price.trim()) errors.price = { code: 'required' }
    else if (amount === null || amount <= 0) errors.price = { code: 'price' }
  }
  if (form.maxQuantity.trim()) {
    const n = Number(form.maxQuantity.trim())
    if (!Number.isInteger(n) || n < 1 || n > 20) errors.maxQuantity = { code: 'quantity' }
  }
  checkDate(errors, 'createdAt', form.createdAt)
  return errors
}

export function offerInput(form: OfferForm): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    ...form.preserved,
    id: form.id,
    title: toTranslatable(form.title),
    description: toTranslatable(form.description),
    price: form.priceMode === 'quote' ? null : parseAmount(form.price),
    currency: form.currency,
    availability: form.availability,
    contactSubject: form.contactSubject,
    createdAt: form.createdAt,
    publication: form.publication,
  }
  if (form.priceMode === 'from') doc.priceFrom = true
  if (form.maxQuantity.trim()) doc.maxQuantity = Number(form.maxQuantity.trim())
  if (form.conditions.fr.trim()) doc.conditions = toTranslatable(form.conditions)
  return doc
}

/* -------------------------------------------------------------------- Jeux */

export type GameForm = {
  id: string
  title: Bilingual
  description: Bilingual
  image: ImageFormValue
  pricing: 'free' | 'paid'
  priceAmount: string
  priceCurrency: Currency
  linkUrl: string
  linkKind: 'download' | 'store'
  storeName: string
  createdAt: string
  publication: PublicationStatus
  preserved: Record<string, unknown>
}

export function emptyGameForm(): GameForm {
  return {
    id: '',
    title: { ...emptyBilingual },
    description: { ...emptyBilingual },
    image: { src: '', alt: { ...emptyBilingual } },
    pricing: 'free',
    priceAmount: '',
    priceCurrency: 'EUR',
    linkUrl: '',
    linkKind: 'store',
    storeName: '',
    createdAt: today(),
    publication: 'draft',
    preserved: {},
  }
}

export function gameFormFromDoc(id: string, data: Record<string, unknown>): GameForm {
  const pricing = isRecord(data.pricing) ? data.pricing : {}
  const price = isRecord(pricing.price) ? pricing.price : {}
  const link = isRecord(data.link) ? data.link : {}
  return {
    id,
    title: fromTranslatable(data.title),
    description: fromTranslatable(data.description),
    image: imageFromDoc(data.cover),
    pricing: pricing.type === 'paid' ? 'paid' : 'free',
    priceAmount: amountField(price.amount),
    priceCurrency: (currencies as readonly unknown[]).includes(price.currency) ? (price.currency as Currency) : 'EUR',
    linkUrl: typeof link.url === 'string' ? link.url : '',
    linkKind: link.kind === 'download' ? 'download' : 'store',
    storeName: typeof link.storeName === 'string' ? link.storeName : '',
    createdAt: dateField(data.createdAt),
    publication: data.publication === 'published' ? 'published' : 'draft',
    preserved: preserve(data, ['order']),
  }
}

export function validateGameForm(form: GameForm, { hasNewFile = false } = {}): FormErrors {
  const errors: FormErrors = {}
  checkSlug(errors, form.id)
  checkBilingual(errors, 'title', form.title, limits.title)
  checkBilingual(errors, 'description', form.description, limits.description)
  checkImage(errors, form.image, hasNewFile, true)
  if (form.pricing === 'paid' && form.priceAmount.trim()) {
    const amount = parseAmount(form.priceAmount)
    if (amount === null || amount <= 0) errors.priceAmount = { code: 'price' }
  }
  checkUrl(errors, 'linkUrl', form.linkUrl, true)
  if (form.storeName.trim().length > limits.storeName) errors.storeName = { code: 'tooLong', max: limits.storeName }
  checkDate(errors, 'createdAt', form.createdAt)
  return errors
}

export function gameInput(form: GameForm, imageSrc: string): Record<string, unknown> {
  const amount = form.pricing === 'paid' && form.priceAmount.trim() ? parseAmount(form.priceAmount) : null
  const link: Record<string, unknown> = { url: form.linkUrl.trim(), kind: form.linkKind }
  if (form.storeName.trim()) link.storeName = form.storeName.trim()
  return {
    ...form.preserved,
    id: form.id,
    title: toTranslatable(form.title),
    description: toTranslatable(form.description),
    cover: { src: imageSrc, alt: toTranslatable(form.image.alt) },
    pricing: form.pricing === 'free' ? { type: 'free' } : amount !== null ? { type: 'paid', price: { amount, currency: form.priceCurrency } } : { type: 'paid' },
    link,
    createdAt: form.createdAt,
    publication: form.publication,
  }
}

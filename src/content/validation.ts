/**
 * Validation des contenus à l'exécution.
 *
 * Toute donnée qui arrive d'une source externe (Firestore, plus tard l'administration)
 * passe par ces parseurs avant d'atteindre l'interface. Un document invalide est
 * écarté (et signalé en développement) au lieu de casser une page.
 *
 * Règles de sécurité appliquées ici :
 * - les liens externes doivent être en http(s) : pas de "javascript:" ni de "data:" ;
 * - les images sont soit un chemin relatif sans "..", soit une URL https ;
 * - les textes ont une longueur maximale, les identifiants un format strict.
 */
import {
  contactSubjects,
  currencies,
  offerAvailabilities,
  projectCategories,
  projectProgresses,
  publicationStatuses,
  type Game,
  type GamePricing,
  type ImageAsset,
  type Money,
  type Offer,
  type Project,
  type Translatable,
  type Video,
} from '../types/content'

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const IMAGE_PATH_PATTERN = /^(?!\/\/)[\w\-./]+\.(?:webp|avif|png|jpe?g|gif|svg)$/i
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

const limits = { title: 140, summary: 400, description: 6000, alt: 250, conditions: 600, storeName: 60, tech: 40 }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Accepte uniquement une URL http(s) bien formée. */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/** Accepte un chemin relatif d'image (sans "..") ou une URL https. */
export function safeImageSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const src = value.trim()
  if (/^https:\/\//i.test(src)) return safeExternalUrl(src)
  // Refuse les URL « protocol-relative » (//autre-site/...) avant de retirer le "/" initial.
  if (src.startsWith('//')) return null
  const path = src.replace(/^\//, '')
  return IMAGE_PATH_PATTERN.test(path) && !path.split('/').includes('..') ? path : null
}

/**
 * Convertit une date en chaîne ISO. Accepte une chaîne ISO, un objet Date,
 * ou un Timestamp Firestore ({ toDate() } ou { seconds }).
 */
export function toIsoDate(value: unknown): string | null {
  let date: Date | null = null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) date = new Date(value)
  else if (value instanceof Date) date = value
  else if (isRecord(value) && typeof value.toDate === 'function') date = (value.toDate as () => Date)()
  else if (isRecord(value) && typeof value.seconds === 'number') date = new Date(value.seconds * 1000)
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

/** Lecteur de champs qui accumule les erreurs au lieu de lever une exception. */
class FieldReader {
  readonly errors: string[] = []
  constructor(private readonly data: Record<string, unknown>) {}

  private fail(key: string, message: string) {
    this.errors.push(`${key}: ${message}`)
  }

  string(key: string, max: number, optional = false): string | undefined {
    const value = this.data[key]
    if (value === undefined || value === null || value === '') {
      if (!optional) this.fail(key, 'requis')
      return undefined
    }
    if (typeof value !== 'string') {
      this.fail(key, 'doit être un texte')
      return undefined
    }
    const trimmed = value.trim()
    if (trimmed.length > max) {
      this.fail(key, `${max} caractères maximum`)
      return undefined
    }
    return trimmed
  }

  id(key = 'id'): string | undefined {
    const value = this.string(key, 80)
    if (value !== undefined && !ID_PATTERN.test(value)) {
      this.fail(key, 'format attendu : minuscules, chiffres et tirets')
      return undefined
    }
    return value
  }

  translatable(key: string, max: number, optional = false): Translatable | undefined {
    const value = this.data[key]
    if (value === undefined || value === null || value === '') {
      if (!optional) this.fail(key, 'requis')
      return undefined
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed || trimmed.length > max) {
        this.fail(key, `1 à ${max} caractères`)
        return undefined
      }
      return trimmed
    }
    if (isRecord(value) && typeof value.fr === 'string' && typeof value.en === 'string') {
      const fr = value.fr.trim()
      const en = value.en.trim()
      if (!fr || !en || fr.length > max || en.length > max) {
        this.fail(key, `fr et en requis, ${max} caractères maximum`)
        return undefined
      }
      return { fr, en }
    }
    this.fail(key, 'texte ou { fr, en } attendu')
    return undefined
  }

  oneOf<T extends string>(key: string, allowed: readonly T[], optional = false): T | undefined {
    const value = this.data[key]
    if (value === undefined || value === null) {
      if (!optional) this.fail(key, 'requis')
      return undefined
    }
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
    this.fail(key, `valeur attendue parmi ${allowed.join(', ')}`)
    return undefined
  }

  date(key: string): string | undefined {
    const iso = toIsoDate(this.data[key])
    if (!iso) this.fail(key, 'date invalide')
    return iso ?? undefined
  }

  url(key: string, optional = false): string | undefined {
    const value = this.data[key]
    if (value === undefined || value === null || value === '') {
      if (!optional) this.fail(key, 'requis')
      return undefined
    }
    const url = safeExternalUrl(value)
    if (!url) this.fail(key, 'URL http(s) attendue')
    return url ?? undefined
  }

  number(key: string, { min = 0, max = 1_000_000 } = {}): number | undefined {
    const value = this.data[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      this.fail(key, `nombre entre ${min} et ${max} attendu`)
      return undefined
    }
    return value
  }

  optionalNumber(key: string, opts?: { min?: number; max?: number }): number | undefined {
    return this.data[key] === undefined || this.data[key] === null ? undefined : this.number(key, opts)
  }

  boolean(key: string): boolean | undefined {
    const value = this.data[key]
    if (value === undefined || value === null) return undefined
    if (typeof value !== 'boolean') {
      this.fail(key, 'booléen attendu')
      return undefined
    }
    return value
  }

  image(key: string, optional = false): ImageAsset | undefined {
    const value = this.data[key]
    if (value === undefined || value === null) {
      if (!optional) this.fail(key, 'requis')
      return undefined
    }
    if (!isRecord(value)) {
      this.fail(key, '{ src, alt } attendu')
      return undefined
    }
    const sub = new FieldReader(value)
    const src = safeImageSrc(value.src)
    if (!src) sub.fail('src', 'chemin relatif ou URL https vers une image attendu')
    const alt = sub.translatable('alt', limits.alt)
    sub.errors.forEach((e) => this.errors.push(`${key}.${e}`))
    return src && alt !== undefined ? { src, alt } : undefined
  }

  money(key: string, optional = false): Money | undefined {
    const value = this.data[key]
    if (value === undefined || value === null) {
      if (!optional) this.fail(key, 'requis')
      return undefined
    }
    if (!isRecord(value)) {
      this.fail(key, '{ amount, currency } attendu')
      return undefined
    }
    const sub = new FieldReader(value)
    const amount = sub.number('amount')
    const currency = sub.oneOf('currency', currencies)
    sub.errors.forEach((e) => this.errors.push(`${key}.${e}`))
    return amount !== undefined && currency ? { amount, currency } : undefined
  }

  stringList(key: string, maxItem: number, maxCount = 20): string[] | undefined {
    const value = this.data[key]
    if (value === undefined || value === null) return undefined
    if (!Array.isArray(value) || value.length > maxCount || value.some((v) => typeof v !== 'string' || v.length > maxItem)) {
      this.fail(key, `liste de ${maxCount} textes maximum attendue`)
      return undefined
    }
    return value.map((v: string) => v.trim()).filter(Boolean)
  }

  result<T>(value: T): ParseResult<T> {
    return this.errors.length ? { ok: false, errors: this.errors } : { ok: true, value }
  }
}

/** Copie un champ seulement s'il est défini (évite les clés "undefined"). */
function withOptional<T extends object>(base: T, optional: Record<string, unknown>): T {
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) (base as Record<string, unknown>)[key] = value
  }
  return base
}

function readBase(r: FieldReader) {
  return {
    id: r.id(),
    createdAt: r.date('createdAt'),
    publication: r.oneOf('publication', publicationStatuses),
    order: r.optionalNumber('order', { min: -1000, max: 100000 }),
    isDemo: r.boolean('isDemo'),
  }
}

export function parseProject(input: unknown): ParseResult<Project> {
  if (!isRecord(input)) return { ok: false, errors: ['document : objet attendu'] }
  const r = new FieldReader(input)
  const base = readBase(r)
  const title = r.translatable('title', limits.title)
  const description = r.translatable('description', limits.description)
  const category = r.oneOf('category', projectCategories)
  const value = withOptional(
    { ...base, title, description, category } as Project,
    {
      summary: r.translatable('summary', limits.summary, true),
      cover: r.image('cover', true),
      externalUrl: r.url('externalUrl', true),
      progress: r.oneOf('progress', projectProgresses, true),
      stack: r.stringList('stack', limits.tech),
      featured: r.boolean('featured'),
    },
  )
  stripUndefined(value)
  return r.result(value)
}

export function parseOffer(input: unknown): ParseResult<Offer> {
  if (!isRecord(input)) return { ok: false, errors: ['document : objet attendu'] }
  const r = new FieldReader(input)
  const base = readBase(r)
  const price = input.price === null || input.price === undefined ? null : r.number('price')
  if (typeof input.maxQuantity === 'number' && !Number.isInteger(input.maxQuantity)) {
    r.errors.push('maxQuantity: nombre entier attendu')
  }
  const value = withOptional(
    {
      ...base,
      title: r.translatable('title', limits.title),
      description: r.translatable('description', limits.description),
      price: price ?? null,
      currency: r.oneOf('currency', currencies),
      availability: r.oneOf('availability', offerAvailabilities),
      contactSubject: r.oneOf('contactSubject', contactSubjects),
    } as Offer,
    {
      priceFrom: r.boolean('priceFrom'),
      maxQuantity: r.optionalNumber('maxQuantity', { min: 1, max: 20 }),
      conditions: r.translatable('conditions', limits.conditions, true),
    },
  )
  stripUndefined(value)
  return r.result(value)
}

export function parseGame(input: unknown): ParseResult<Game> {
  if (!isRecord(input)) return { ok: false, errors: ['document : objet attendu'] }
  const r = new FieldReader(input)
  const base = readBase(r)

  let pricing: GamePricing | undefined
  if (!isRecord(input.pricing)) r.errors.push('pricing: { type: "free" } ou { type: "paid", price? } attendu')
  else {
    const pr = new FieldReader(input.pricing)
    const type = pr.oneOf('type', ['free', 'paid'] as const)
    if (type === 'free') pricing = { type }
    else if (type === 'paid') {
      const price = pr.money('price', true)
      pricing = price ? { type, price } : { type }
    }
    pr.errors.forEach((e) => r.errors.push(`pricing.${e}`))
  }

  let link: Game['link'] | undefined
  if (!isRecord(input.link)) r.errors.push('link: { url, kind } attendu')
  else {
    const lr = new FieldReader(input.link)
    const url = lr.url('url')
    const kind = lr.oneOf('kind', ['download', 'store'] as const)
    const storeName = lr.string('storeName', limits.storeName, true)
    lr.errors.forEach((e) => r.errors.push(`link.${e}`))
    if (url && kind) link = storeName ? { url, kind, storeName } : { url, kind }
  }

  const value = {
    ...base,
    title: r.translatable('title', limits.title),
    description: r.translatable('description', limits.description),
    cover: r.image('cover'),
    pricing,
    link,
  } as Game
  stripUndefined(value)
  return r.result(value)
}

export function parseVideo(input: unknown): ParseResult<Video> {
  if (!isRecord(input)) return { ok: false, errors: ['document : objet attendu'] }
  const r = new FieldReader(input)
  const youtubeId = r.string('youtubeId', 11)
  if (youtubeId !== undefined && !YOUTUBE_ID_PATTERN.test(youtubeId)) r.errors.push('youtubeId: identifiant YouTube invalide')
  const thumbnail = input.thumbnail === undefined ? undefined : safeImageSrc(input.thumbnail)
  if (input.thumbnail !== undefined && !thumbnail) r.errors.push('thumbnail: image invalide')
  const value = withOptional(
    { youtubeId, title: r.string('title', limits.title), publishedAt: r.date('publishedAt') } as Video,
    { thumbnail: thumbnail ?? undefined, isDemo: r.boolean('isDemo') },
  )
  return r.result(value)
}

/** Retire les clés dont la valeur est undefined (objets plus propres, égalité stricte dans les tests). */
function stripUndefined(value: object) {
  for (const key of Object.keys(value)) {
    if ((value as Record<string, unknown>)[key] === undefined) delete (value as Record<string, unknown>)[key]
  }
}

/**
 * Valide une liste de documents : garde les valides, écarte les autres
 * (et les doublons d'identifiant) en signalant le problème en développement.
 */
export function parseList<T>(
  items: unknown[],
  parse: (input: unknown) => ParseResult<T>,
  label: string,
  keyOf: (item: T) => string,
): T[] {
  const seen = new Set<string>()
  const valid: T[] = []
  items.forEach((item, index) => {
    const result = parse(item)
    if (!result.ok) {
      reportInvalid(label, index, result.errors)
      return
    }
    const key = keyOf(result.value)
    if (seen.has(key)) {
      reportInvalid(label, index, [`identifiant en double : ${key}`])
      return
    }
    seen.add(key)
    valid.push(result.value)
  })
  return valid
}

function reportInvalid(label: string, index: number, errors: string[]) {
  if (import.meta.env?.DEV) console.warn(`[contenu] ${label} n°${index + 1} ignoré :`, errors.join(' ; '))
}

/**
 * Préparation des écritures de contenu par l'administration — logique pure (testée).
 *
 * Chaque document est validé avec les mêmes parseurs que l'affichage (content/validation.ts),
 * puis converti au format Firestore attendu par firestore.rules :
 *  - pas de champ "id" (l'identifiant est celui du document) ni "isDemo" ;
 *  - updatedBy = uid de l'administrateur, updatedAt = horodatage SERVEUR.
 * Les règles Firestore refont ces contrôles côté serveur : cette étape évite seulement
 * d'envoyer une écriture qui serait refusée.
 */
import { parseGame, parseOffer, parseProject, parseVideo, type ParseResult } from '../content/validation'
import type { PublicationStatus } from '../types/content'

export const managedCollections = ['projects', 'offers', 'games', 'videos'] as const
export type ManagedCollection = (typeof managedCollections)[number]

/** Marqueur remplacé par serverTimestamp() au moment de l'écriture. */
export const SERVER_TIMESTAMP = '__serverTimestamp__' as const
export type Payload = Record<string, unknown>

export type PreparedWrite = { ok: true; id: string; data: Payload } | { ok: false; errors: string[] }

const parsers: Record<Exclude<ManagedCollection, 'videos'>, (input: unknown) => ParseResult<{ id: string }>> = {
  projects: parseProject,
  offers: parseOffer,
  games: parseGame,
}

function stamp(uid: string): Payload {
  return { updatedAt: SERVER_TIMESTAMP, updatedBy: uid }
}

export function prepareContentWrite(collection: ManagedCollection, input: unknown, uid: string): PreparedWrite {
  if (!uid) return { ok: false, errors: ['session : administrateur non identifié'] }

  if (collection === 'videos') {
    const result = parseVideo(input)
    if (!result.ok) return result
    const { youtubeId, isDemo: _demo, ...rest } = result.value
    void _demo
    return { ok: true, id: youtubeId, data: { ...rest, ...stamp(uid) } }
  }

  const result = parsers[collection](input)
  if (!result.ok) return result
  const { id, isDemo: _demo, ...rest } = result.value as { id: string; isDemo?: boolean } & Payload
  void _demo
  return { ok: true, id, data: { ...rest, ...stamp(uid) } }
}

/** Publier ou repasser en brouillon (les autres champs ne changent pas). */
export function publicationUpdate(publication: PublicationStatus, uid: string): Payload {
  return { publication, ...stamp(uid) }
}

/** Nom affichable d'un document brut (liste d'administration). */
export function displayTitle(data: Payload, fallback: string): string {
  const title = data.title
  if (typeof title === 'string' && title.trim()) return title.trim()
  if (typeof title === 'object' && title !== null) {
    const fr = (title as { fr?: unknown }).fr
    if (typeof fr === 'string' && fr.trim()) return fr.trim()
  }
  return fallback
}

/** Valide un document brut lu dans Firestore, pour signaler les documents incorrects. */
export function checkStoredDocument(collection: ManagedCollection, id: string, data: Payload): string[] {
  const result =
    collection === 'videos' ? parseVideo({ youtubeId: id, ...data }) : parsers[collection]({ ...data, id })
  return result.ok ? [] : result.errors
}

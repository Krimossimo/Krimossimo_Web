/**
 * Images gérées dans Firebase Storage — repérage et suppression SÛRE des fichiers inutiles.
 *
 * Une image n'est supprimée que si :
 *  - c'est un fichier de NOTRE espace Storage, dans public/images/ (jamais une image du site
 *    dans public/ ni une adresse externe) ;
 *  - plus aucun document (projet, jeu, offre) ne la référence, vérifié APRÈS l'enregistrement.
 * storage.rules réserve de toute façon la suppression aux administrateurs.
 */
import { isRecord } from '../content/validation'

const env: Partial<ImportMetaEnv> = import.meta.env ?? {}
const configuredBucket = (env.VITE_FIREBASE_STORAGE_BUCKET ?? '').trim()

/**
 * Chemin Storage d'une adresse de téléchargement Firebase
 * (https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<chemin encodé>?alt=media&token=…),
 * ou null si l'adresse n'est pas un fichier géré par l'administration.
 */
export function storagePathFromUrl(url: string, bucket = configuredBucket): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'firebasestorage.googleapis.com') return null
  const match = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(parsed.pathname)
  if (!match) return null
  if (bucket && decodeURIComponent(match[1]) !== bucket) return null
  let path: string
  try {
    path = decodeURIComponent(match[2])
  } catch {
    return null
  }
  if (!/^public\/images\/(projects|games|offers|site)\/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(path)) return null
  return path
}

/** Adresses d'images référencées par des documents (couvertures). */
export function referencedImages(docs: { data: Record<string, unknown> }[]): Set<string> {
  const refs = new Set<string>()
  for (const { data } of docs) {
    if (isRecord(data.cover) && typeof data.cover.src === 'string') {
      const path = storagePathFromUrl(data.cover.src, '')
      if (path) refs.add(path)
    }
  }
  return refs
}

export type CleanupResult = 'deleted' | 'in-use' | 'not-managed' | 'already-gone' | 'failed'

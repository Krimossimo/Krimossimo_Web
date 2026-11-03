/**
 * Opérations d'administration sur les contenus : enregistrement avec image, suppression,
 * import du contenu local. Les accès Firestore/Storage sont injectés (testables) ;
 * l'adaptateur réel est dans contentDeps.ts.
 *
 * Ordre des opérations pour ne jamais casser un contenu publié :
 *  1. nouvelle image envoyée d'abord (si elle échoue, rien n'est modifié) ;
 *  2. document enregistré (si cela échoue, la nouvelle image, inutilisée, est supprimée) ;
 *  3. seulement ensuite, l'ancienne image est supprimée si plus rien ne l'utilise.
 */
import type { RawDoc } from './adminStore'
import { prepareContentWrite, type ManagedCollection, type Payload } from './contentAdmin'
import { referencedImages, storagePathFromUrl, type CleanupResult } from './images'
import type { ImageFolder } from './upload'

export type ContentCollection = Exclude<ManagedCollection, 'videos'>

export interface ContentDeps {
  uid: string
  getDoc(collection: ContentCollection, id: string): Promise<RawDoc | null>
  listDocs(collection: ContentCollection): Promise<RawDoc[]>
  save(collection: ContentCollection, id: string, data: Payload): Promise<void>
  remove(collection: ContentCollection, id: string): Promise<void>
  upload(file: File, folder: ImageFolder): Promise<{ path: string; url: string }>
  deleteFile(path: string): Promise<void>
}

export type ActionErrorCode = 'permission-denied' | 'unavailable' | 'quota' | 'unknown'

/** Erreur Firestore ou Storage → code affichable. */
export function actionErrorCode(error: unknown): ActionErrorCode {
  const code = typeof error === 'object' && error !== null ? String((error as { code?: unknown }).code ?? '') : ''
  if (code === 'permission-denied' || code === 'storage/unauthorized' || code === 'storage/unauthenticated') return 'permission-denied'
  if (code === 'unavailable' || code === 'storage/retry-limit-exceeded' || code === 'storage/canceled') return 'unavailable'
  if (code === 'storage/quota-exceeded' || code === 'resource-exhausted') return 'quota'
  return 'unknown'
}

export type SaveResult =
  | { ok: true; id: string; imageSrc: string; cleanup: CleanupResult | null }
  | { ok: false; reason: 'slug-taken' }
  | { ok: false; reason: 'invalid'; errors: string[] }
  | { ok: false; reason: 'upload' | 'save'; code: ActionErrorCode }

/** Supprime une image si c'est un fichier géré et si plus aucun contenu ne la référence. */
export async function removeImageIfUnused(deps: ContentDeps, src: string | null | undefined): Promise<CleanupResult> {
  const path = src ? storagePathFromUrl(src) : null
  if (!path) return 'not-managed'
  let docs: RawDoc[]
  try {
    const lists = await Promise.all((['projects', 'games', 'offers'] as const).map((c) => deps.listDocs(c)))
    docs = lists.flat()
  } catch {
    // Impossible de vérifier les références : on garde le fichier (prudence).
    return 'failed'
  }
  if (referencedImages(docs).has(path)) return 'in-use'
  try {
    await deps.deleteFile(path)
    return 'deleted'
  } catch (error) {
    return (error as { code?: unknown })?.code === 'storage/object-not-found' ? 'already-gone' : 'failed'
  }
}

export type SaveRequest = {
  collection: ContentCollection
  id: string
  isNew: boolean
  /** Construit le document à partir de l'adresse d'image finale ('' = aucune image). */
  build: (imageSrc: string) => Record<string, unknown>
  /** Image actuellement enregistrée (avant modification). */
  previousSrc: string
  /** Image à conserver si aucun nouveau fichier n'est envoyé ('' = image retirée). */
  keepSrc: string
  file: File | null
  folder: ImageFolder
}

export async function saveContentEntry(deps: ContentDeps, request: SaveRequest): Promise<SaveResult> {
  const { collection, id, isNew, build, previousSrc, keepSrc, file, folder } = request

  if (isNew) {
    try {
      if (await deps.getDoc(collection, id)) return { ok: false, reason: 'slug-taken' }
    } catch (error) {
      return { ok: false, reason: 'save', code: actionErrorCode(error) }
    }
  }

  let uploaded: { path: string; url: string } | null = null
  if (file) {
    try {
      uploaded = await deps.upload(file, folder)
    } catch (error) {
      return { ok: false, reason: 'upload', code: actionErrorCode(error) }
    }
  }
  const finalSrc = uploaded ? uploaded.url : keepSrc
  const discardUpload = async () => {
    if (uploaded) await deps.deleteFile(uploaded.path).catch(() => {})
  }

  const prepared = prepareContentWrite(collection, build(finalSrc), deps.uid)
  if (!prepared.ok || prepared.id !== id) {
    await discardUpload()
    return { ok: false, reason: 'invalid', errors: prepared.ok ? ['id'] : prepared.errors }
  }

  try {
    await deps.save(collection, id, prepared.data)
  } catch (error) {
    await discardUpload()
    return { ok: false, reason: 'save', code: actionErrorCode(error) }
  }

  const cleanup = previousSrc && previousSrc !== finalSrc ? await removeImageIfUnused(deps, previousSrc) : null
  return { ok: true, id, imageSrc: finalSrc, cleanup }
}

export type DeleteResult = { ok: true; cleanup: CleanupResult | null } | { ok: false; code: ActionErrorCode }

/** Supprime le document, puis son image si elle n'est plus utilisée ailleurs. */
export async function deleteContentEntry(deps: ContentDeps, collection: ContentCollection, id: string, imageSrc: string): Promise<DeleteResult> {
  try {
    await deps.remove(collection, id)
  } catch (error) {
    return { ok: false, code: actionErrorCode(error) }
  }
  return { ok: true, cleanup: imageSrc ? await removeImageIfUnused(deps, imageSrc) : null }
}

/* ------------------------------------------------------- Import du contenu local */

export type ImportItem = { collection: ContentCollection; item: { id: string } & Record<string, unknown> }
export type ImportReport = { imported: string[]; skipped: string[]; failed: string[] }

/**
 * Copie dans Firestore les contenus RÉELS de src/data/ qui n'y sont pas encore.
 * Un document existant n'est jamais remplacé.
 */
export async function importLocalContent(deps: ContentDeps, items: ImportItem[]): Promise<ImportReport> {
  const report: ImportReport = { imported: [], skipped: [], failed: [] }
  for (const { collection, item } of items) {
    const label = `${collection}/${item.id}`
    if (item.isDemo) continue
    const prepared = prepareContentWrite(collection, item, deps.uid)
    if (!prepared.ok) {
      report.failed.push(label)
      continue
    }
    try {
      if (await deps.getDoc(collection, prepared.id)) {
        report.skipped.push(label)
        continue
      }
      await deps.save(collection, prepared.id, prepared.data)
      report.imported.push(label)
    } catch {
      report.failed.push(label)
    }
  }
  return report
}

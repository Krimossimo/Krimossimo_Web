/**
 * Envoi d'images vers Firebase Storage (administration).
 *
 * Contrôles côté navigateur (confort) ; storage.rules impose les mêmes limites côté
 * serveur : administrateur uniquement, dossiers connus, images raster, 5 Mo maximum.
 */
import { getFileStorage } from '../lib/firebase'

export const imageFolders = ['projects', 'games', 'offers', 'site'] as const
export type ImageFolder = (typeof imageFolders)[number]

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const extensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
}

export type ImageCheck = 'type' | 'size' | 'empty' | null

export function checkImageFile(file: { type: string; size: number }): ImageCheck {
  if (!(file.type in extensions)) return 'type'
  if (file.size <= 0) return 'empty'
  if (file.size > MAX_IMAGE_BYTES) return 'size'
  return null
}

/** Nom de fichier sûr : date + nom nettoyé + extension tirée du type MIME (pas du nom fourni). */
function randomNonce(): string {
  const bytes = new Uint8Array(3)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Nom unique (date + suffixe aléatoire) : un envoi ne remplace jamais un fichier existant. */
export function storagePathFor(folder: ImageFolder, file: { name: string; type: string }, now = new Date(), nonce = randomNonce()): string {
  const base =
    file.name
      .replace(/\.[^.]*$/, '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'image'
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')
  return `public/images/${folder}/${stamp}-${nonce}-${base}.${extensions[file.type] ?? 'bin'}`
}

/** Envoie l'image et renvoie son URL publique (https) à utiliser dans un contenu. */
export async function uploadImage(file: File, folder: ImageFolder): Promise<{ path: string; url: string }> {
  const problem = checkImageFile(file)
  if (problem) throw new Error(`image refusée : ${problem}`)
  const [storage, { ref, uploadBytes, getDownloadURL }] = await Promise.all([getFileStorage(), import('firebase/storage')])
  const path = storagePathFor(folder, file)
  const target = ref(storage, path)
  await uploadBytes(target, file, { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' })
  return { path, url: await getDownloadURL(target) }
}

/** Supprime un fichier de public/images/ (les règles Storage réservent cette action aux administrateurs). */
export async function deleteStorageFile(path: string): Promise<void> {
  if (!path.startsWith('public/images/')) throw new Error('chemin refusé')
  const [storage, { ref, deleteObject }] = await Promise.all([getFileStorage(), import('firebase/storage')])
  await deleteObject(ref(storage, path))
}

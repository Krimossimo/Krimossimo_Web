import { deleteContent, getContent, listCollection, saveContent } from './adminStore'
import type { ContentDeps } from './contentActions'
import { deleteStorageFile, uploadImage } from './upload'

/** Accès réels (Firestore + Storage) pour l'administrateur connecté. */
export function contentDeps(uid: string): ContentDeps {
  return {
    uid,
    getDoc: getContent,
    listDocs: listCollection,
    save: saveContent,
    remove: deleteContent,
    upload: uploadImage,
    deleteFile: deleteStorageFile,
  }
}

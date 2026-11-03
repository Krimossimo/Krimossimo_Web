/**
 * Accès Firebase (Auth, Firestore, Storage), chargé à la demande.
 *
 * Les modules Firebase sont importés dynamiquement : ils ne pèsent rien sur la page
 * d'accueil et ne sont téléchargés que par les pages qui en ont besoin.
 * La configuration web Firebase est publique par conception (ce n'est pas un secret) ;
 * la sécurité repose sur firestore.rules, storage.rules et les Cloud Functions.
 */
import type { FirebaseApp, FirebaseOptions } from 'firebase/app'
import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'
import type { FirebaseStorage } from 'firebase/storage'

const env: Partial<ImportMetaEnv> = import.meta.env ?? {}

const config: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId)

/**
 * Émulateurs locaux (firebase emulators:start) : uniquement avec `npm run dev`,
 * jamais dans un build de production, même si la variable est renseignée.
 */
export const usesEmulators = Boolean(env.DEV) && env.VITE_FIREBASE_EMULATORS === 'true'
const EMULATOR_HOST = '127.0.0.1'

let appPromise: Promise<FirebaseApp> | undefined
let authPromise: Promise<Auth> | undefined
let dbPromise: Promise<Firestore> | undefined
let storagePromise: Promise<FirebaseStorage> | undefined

export function getFirebaseApp(): Promise<FirebaseApp> {
  if (!isFirebaseConfigured) {
    return Promise.reject(new Error('Firebase non configuré : renseigne les variables VITE_FIREBASE_* dans .env.local.'))
  }
  appPromise ??= import('firebase/app').then(({ initializeApp, getApps, getApp }) =>
    getApps().length ? getApp() : initializeApp(config),
  )
  return appPromise
}

/**
 * Authentification (administration uniquement). La session est conservée pour l'onglet
 * en cours seulement (sessionStorage) : fermer l'onglet déconnecte.
 */
export function getFirebaseAuth(): Promise<Auth> {
  authPromise ??= Promise.all([getFirebaseApp(), import('firebase/auth')]).then(
    ([app, { initializeAuth, browserSessionPersistence, connectAuthEmulator }]) => {
      const auth = initializeAuth(app, { persistence: browserSessionPersistence })
      if (usesEmulators) connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true })
      return auth
    },
  )
  return authPromise
}

export function getDb(): Promise<Firestore> {
  dbPromise ??= Promise.all([getFirebaseApp(), import('firebase/firestore')]).then(([app, { getFirestore, connectFirestoreEmulator }]) => {
    const db = getFirestore(app)
    if (usesEmulators) connectFirestoreEmulator(db, EMULATOR_HOST, 8080)
    return db
  })
  return dbPromise
}

export function getFileStorage(): Promise<FirebaseStorage> {
  storagePromise ??= Promise.all([getFirebaseApp(), import('firebase/storage')]).then(([app, { getStorage, connectStorageEmulator }]) => {
    const storage = getStorage(app)
    if (usesEmulators) connectStorageEmulator(storage, EMULATOR_HOST, 9199)
    return storage
  })
  return storagePromise
}

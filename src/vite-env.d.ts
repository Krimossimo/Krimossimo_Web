/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_EMULATORS?: 'true' | 'false'
  readonly VITE_FUNCTIONS_BASE_URL?: string
  readonly VITE_CONTACT_ENDPOINT?: string
  readonly VITE_CONTENT_SOURCE?: 'local' | 'firestore'
  readonly VITE_DEMO_CONTENT?: 'true' | 'false'
  readonly VITE_YOUTUBE_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

import { createContext, useContext } from 'react'
import type { AdminSession, AuthErrorCode } from './authService'

/**
 * État de la session dans l'interface d'administration.
 * - unconfigured : variables VITE_FIREBASE_* absentes ;
 * - loading      : session en cours de lecture ;
 * - signed-out   : personne n'est connecté ;
 * - admin        : compte connecté portant le claim admin (affichage uniquement :
 *                  chaque lecture/écriture reste contrôlée par Firebase côté serveur).
 * Un compte connecté sans le rôle est déconnecté immédiatement (voir signIn).
 */
export type AdminAuthState =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'signed-out'; error?: AuthErrorCode }
  | { status: 'admin'; session: AdminSession }

export const AdminAuthContext = createContext<AdminAuthState>({ status: 'loading' })

export function useAdminAuth(): AdminAuthState {
  return useContext(AdminAuthContext)
}

/** Session administrateur courante (à utiliser sous RequireAdmin). */
export function useAdminSession(): AdminSession {
  const state = useAdminAuth()
  if (state.status !== 'admin') throw new Error('useAdminSession hors d’une page protégée')
  return state.session
}

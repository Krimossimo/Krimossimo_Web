/**
 * Authentification administrateur (Firebase Authentication, e-mail + mot de passe).
 *
 * L'interface n'est qu'un confort : elle lit le custom claim { admin: true } pour savoir
 * quoi afficher, mais ce n'est PAS un contrôle de sécurité. Les vrais contrôles sont faits
 * par Firebase côté serveur (firestore.rules, storage.rules, vérification du jeton dans les
 * Cloud Functions), sur la base du même claim signé, impossible à modifier depuis le navigateur.
 */
import type { User } from 'firebase/auth'
import { getFirebaseAuth } from '../lib/firebase'

const authSdk = () => import('firebase/auth')

export type AdminSession = {
  uid: string
  email: string | null
  emailVerified: boolean
  /** Claim lu dans le jeton signé (affichage uniquement). */
  isAdmin: boolean
  lastSignInTime: string | null
}

export type AuthErrorCode =
  | 'invalid-credentials'
  | 'too-many-requests'
  | 'network'
  | 'weak-password'
  | 'requires-recent-login'
  | 'email-in-use'
  | 'invalid-email'
  | 'same-email'
  | 'not-configured'
  | 'unknown'

export class AdminAuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code)
    this.name = 'AdminAuthError'
  }
}

/**
 * Traduit les erreurs Firebase en codes affichables. Identifiant inconnu, mauvais mot de
 * passe et compte désactivé donnent le même message : on ne révèle pas quels comptes existent.
 */
export function authErrorCode(error: unknown): AuthErrorCode {
  if (error instanceof AdminAuthError) return error.code
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/user-disabled':
    case 'auth/missing-password':
      return 'invalid-credentials'
    case 'auth/too-many-requests':
      return 'too-many-requests'
    case 'auth/network-request-failed':
      return 'network'
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'weak-password'
    case 'auth/requires-recent-login':
    case 'auth/user-token-expired':
      return 'requires-recent-login'
    case 'auth/email-already-in-use':
      return 'email-in-use'
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return 'invalid-email'
    default:
      return 'unknown'
  }
}

/** Le claim doit valoir exactement true. */
export function readAdminClaim(claims: Record<string, unknown> | undefined): boolean {
  return claims?.admin === true
}

/** Politique de mot de passe de l'administration (identique au script de création). */
export function checkNewPassword(password: string): 'too-short' | 'too-long' | 'not-varied' | null {
  if (password.length < 12) return 'too-short'
  if (password.length > 128) return 'too-long'
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length
  return classes >= 3 ? null : 'not-varied'
}

async function toSession(user: User, forceRefresh = false): Promise<AdminSession> {
  const token = await user.getIdTokenResult(forceRefresh)
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    isAdmin: readAdminClaim(token.claims as Record<string, unknown>),
    lastSignInTime: user.metadata.lastSignInTime ?? null,
  }
}

async function run<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task()
  } catch (error) {
    throw new AdminAuthError(authErrorCode(error))
  }
}

/** Suit la session (connexion, déconnexion, renouvellement du jeton). */
export function watchSession(onChange: (session: AdminSession | null) => void, onError: (code: AuthErrorCode) => void): () => void {
  let unsubscribe: (() => void) | undefined
  let cancelled = false
  Promise.all([getFirebaseAuth(), authSdk()])
    .then(([auth, { onIdTokenChanged }]) => {
      if (cancelled) return
      unsubscribe = onIdTokenChanged(auth, (user) => {
        if (!user) onChange(null)
        else toSession(user).then(onChange, (error: unknown) => onError(authErrorCode(error)))
      })
    })
    .catch((error: unknown) => onError(authErrorCode(error)))
  return () => {
    cancelled = true
    unsubscribe?.()
  }
}

/**
 * Connexion. Le jeton est rafraîchi pour lire un rôle accordé récemment ; un compte
 * sans rôle administrateur est immédiatement déconnecté.
 */
export async function signIn(email: string, password: string): Promise<AdminSession> {
  return run(async () => {
    const [auth, { signInWithEmailAndPassword, signOut }] = await Promise.all([getFirebaseAuth(), authSdk()])
    const { user } = await signInWithEmailAndPassword(auth, email.trim(), password)
    const session = await toSession(user, true)
    if (!session.isAdmin) await signOut(auth)
    return session
  })
}

export async function signOutAdmin(): Promise<void> {
  const [auth, { signOut }] = await Promise.all([getFirebaseAuth(), authSdk()])
  await signOut(auth)
}

/** E-mail de réinitialisation. Même réponse que le compte existe ou non. */
export async function sendPasswordReset(email: string): Promise<void> {
  return run(async () => {
    const [auth, { sendPasswordResetEmail }] = await Promise.all([getFirebaseAuth(), authSdk()])
    try {
      await sendPasswordResetEmail(auth, email.trim())
    } catch (error) {
      // Compte inconnu : silence volontaire (pas d'énumération des comptes).
      if (authErrorCode(error) !== 'invalid-credentials') throw error
    }
  })
}

async function reauthenticated(currentPassword: string): Promise<User> {
  const [auth, { EmailAuthProvider, reauthenticateWithCredential }] = await Promise.all([getFirebaseAuth(), authSdk()])
  const user = auth.currentUser
  if (!user?.email) throw new AdminAuthError('requires-recent-login')
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword))
  return user
}

/**
 * Changement de mot de passe : le mot de passe actuel est revérifié par Firebase.
 * Firebase révoque ensuite les sessions ouvertes sur les autres appareils.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  if (checkNewPassword(newPassword)) throw new AdminAuthError('weak-password')
  return run(async () => {
    const { updatePassword } = await authSdk()
    const user = await reauthenticated(currentPassword)
    await updatePassword(user, newPassword)
  })
}

/**
 * Changement d'identifiant (adresse e-mail) : après revérification du mot de passe,
 * Firebase envoie un lien à la NOUVELLE adresse ; l'identifiant ne change qu'une fois
 * ce lien ouvert. L'ancienne adresse reçoit une alerte permettant d'annuler.
 * Le rôle administrateur est lié au compte (uid), pas à l'adresse : il est conservé.
 */
export async function requestEmailChange(currentPassword: string, newEmail: string): Promise<void> {
  return run(async () => {
    const { verifyBeforeUpdateEmail } = await authSdk()
    const user = await reauthenticated(currentPassword)
    if (user.email?.toLowerCase() === newEmail.trim().toLowerCase()) throw new AdminAuthError('same-email')
    await verifyBeforeUpdateEmail(user, newEmail.trim())
  })
}

/** Jeton d'identité à joindre aux appels des fonctions d'administration. */
export async function getIdToken(): Promise<string> {
  const auth = await getFirebaseAuth()
  const user = auth.currentUser
  if (!user) throw new AdminAuthError('requires-recent-login')
  return user.getIdToken()
}

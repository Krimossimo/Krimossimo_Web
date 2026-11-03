/**
 * Gestion des comptes administrateurs (custom claim { admin: true }).
 *
 * Utilisé UNIQUEMENT par le script local scripts/admin.ts, exécuté par le propriétaire
 * du projet avec ses identifiants Google (aucune fonction HTTP ne permet de devenir
 * administrateur). Le service d'authentification est injecté pour être testable.
 */

export type AdminUser = {
  uid: string
  email?: string
  disabled: boolean
  emailVerified?: boolean
  customClaims?: Record<string, unknown> | null
}

/** Sous-ensemble de firebase-admin/auth utilisé ici. */
export interface AuthLike {
  getUser(uid: string): Promise<AdminUser>
  getUserByEmail(email: string): Promise<AdminUser>
  createUser(props: { email: string; password: string; emailVerified?: boolean; disabled?: boolean }): Promise<AdminUser>
  setCustomUserClaims(uid: string, claims: Record<string, unknown> | null): Promise<void>
  revokeRefreshTokens(uid: string): Promise<void>
  listUsers(maxResults?: number, pageToken?: string): Promise<{ users: AdminUser[]; pageToken?: string }>
}

export class AdminRoleError extends Error {
  constructor(
    readonly code: 'invalid-email' | 'invalid-uid' | 'user-not-found' | 'user-disabled' | 'weak-password' | 'email-exists',
  ) {
    super(code)
    this.name = 'AdminRoleError'
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normalizeEmail(email: string): string {
  const value = email.trim().toLowerCase()
  if (!EMAIL.test(value) || value.length > 254) throw new AdminRoleError('invalid-email')
  return value
}

/**
 * Règles minimales d'un mot de passe administrateur (complétées par la politique de
 * mot de passe configurable dans la console Firebase).
 */
export function checkAdminPassword(password: string): 'too-short' | 'too-long' | 'not-varied' | null {
  if (password.length < 12) return 'too-short'
  if (password.length > 128) return 'too-long'
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length
  return classes >= 3 ? null : 'not-varied'
}

export const isAdmin = (user: AdminUser) => user.customClaims?.admin === true

/** Identifiant Firebase Auth (UID) : 1 à 128 caractères, sans espace ni caractère spécial. */
const UID = /^[A-Za-z0-9_-]{1,128}$/

/** Un compte se désigne par son adresse e-mail ou par son UID (visible dans la console). */
export type UserRef = { kind: 'email'; email: string } | { kind: 'uid'; uid: string }

export function parseUserRef(input: string): UserRef {
  const value = input.trim()
  if (value.includes('@')) return { kind: 'email', email: normalizeEmail(value) }
  if (!UID.test(value)) throw new AdminRoleError('invalid-uid')
  return { kind: 'uid', uid: value }
}

/** Retrouve le compte désigné (e-mail ou UID). */
export async function findUser(auth: AuthLike, identifier: string): Promise<AdminUser> {
  const ref = parseUserRef(identifier)
  try {
    return ref.kind === 'uid' ? await auth.getUser(ref.uid) : await auth.getUserByEmail(ref.email)
  } catch (error) {
    if (error instanceof AdminRoleError) throw error
    if ((error as { code?: string }).code === 'auth/user-not-found') throw new AdminRoleError('user-not-found')
    throw error
  }
}

/** Accorde le rôle à un compte existant (les autres claims éventuels sont conservés). */
export async function grantAdmin(auth: AuthLike, identifier: string): Promise<{ user: AdminUser; changed: boolean }> {
  const user = await findUser(auth, identifier)
  if (user.disabled) throw new AdminRoleError('user-disabled')
  if (isAdmin(user)) return { user, changed: false }
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), admin: true })
  return { user, changed: true }
}

/**
 * Retire le rôle et révoque les sessions : les fonctions serveur refusent immédiatement
 * le compte ; les règles Firestore/Storage le refusent au plus tard à l'expiration de
 * son jeton en cours (1 heure maximum).
 */
export async function revokeAdmin(auth: AuthLike, identifier: string): Promise<{ user: AdminUser; changed: boolean }> {
  const user = await findUser(auth, identifier)
  const claims = { ...(user.customClaims ?? {}) }
  const changed = 'admin' in claims
  delete claims.admin
  if (changed) await auth.setCustomUserClaims(user.uid, Object.keys(claims).length ? claims : null)
  await auth.revokeRefreshTokens(user.uid)
  return { user, changed }
}

/** Crée le compte administrateur initial (mot de passe saisi par le propriétaire, jamais stocké). */
export async function createAdmin(auth: AuthLike, email: string, password: string): Promise<AdminUser> {
  const normalized = normalizeEmail(email)
  if (checkAdminPassword(password)) throw new AdminRoleError('weak-password')
  let user: AdminUser
  try {
    user = await auth.createUser({ email: normalized, password, emailVerified: false, disabled: false })
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/email-already-exists') throw new AdminRoleError('email-exists')
    throw error
  }
  await auth.setCustomUserClaims(user.uid, { admin: true })
  return user
}

export async function listAdmins(auth: AuthLike): Promise<AdminUser[]> {
  const admins: AdminUser[] = []
  let pageToken: string | undefined
  do {
    const page = await auth.listUsers(1000, pageToken)
    admins.push(...page.users.filter(isAdmin))
    pageToken = page.pageToken
  } while (pageToken)
  return admins
}

/* ------------------------------------------------- Clé de compte de service */

export type KeyProblem = 'inside-project' | 'unreadable' | 'not-service-account' | 'project-mismatch'

/**
 * Contrôles de sécurité sur la clé désignée par GOOGLE_APPLICATION_CREDENTIALS :
 *  - elle doit se trouver HORS du dossier du projet (jamais dans un dépôt Git) ;
 *  - ce doit être une clé de compte de service du projet visé (évite d'agir sur un autre projet).
 * `normalizedKeyPath` et `normalizedProjectRoot` sont des chemins absolus normalisés.
 */
export function checkServiceAccountKey(
  normalizedKeyPath: string,
  normalizedProjectRoot: string,
  content: string | null,
  expectedProject: string,
): KeyProblem | null {
  const key = normalizedKeyPath.replace(/\\/g, '/').toLowerCase()
  const root = normalizedProjectRoot.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  if (key === root || key.startsWith(root + '/')) return 'inside-project'
  if (content === null) return 'unreadable'
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch {
    return 'not-service-account'
  }
  const record = data as { type?: unknown; project_id?: unknown; private_key?: unknown; client_email?: unknown }
  if (record.type !== 'service_account' || typeof record.private_key !== 'string' || typeof record.client_email !== 'string') {
    return 'not-service-account'
  }
  return record.project_id === expectedProject ? null : 'project-mismatch'
}

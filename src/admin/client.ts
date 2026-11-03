import { adminBaseUrl, createAdminClient } from './adminApi'
import { getIdToken } from './authService'

/** Client des fonctions d'administration, authentifié par le jeton de la session en cours. */
export const adminClient = createAdminClient({ baseUrl: adminBaseUrl, getToken: getIdToken })

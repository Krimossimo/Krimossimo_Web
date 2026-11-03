/**
 * Garde-fou : toute variable VITE_* est copiée dans le JavaScript public.
 * Une variable dont le nom évoque un secret ne doit donc jamais porter ce préfixe.
 * Utilisé par vite.config.ts : le dev et le build s'arrêtent si une telle variable existe.
 *
 * Les identifiants publics par conception restent autorisés (VITE_FIREBASE_API_KEY...) :
 * leur nom ne contient aucun des mots ci-dessous.
 */
export const SECRET_NAME_PATTERN = /SECRET|PRIVATE|PASSWORD|PASSWD|TOKEN|CREDENTIAL/i

export function findExposedSecrets(env: Record<string, string | undefined>, prefix = 'VITE_'): string[] {
  return Object.keys(env)
    .filter((name) => name.startsWith(prefix) && SECRET_NAME_PATTERN.test(name) && Boolean(env[name]))
    .sort()
}

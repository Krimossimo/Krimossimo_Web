/** Redirection après connexion : uniquement vers une page de l'administration (pas de redirection ouverte). */
export function safeNext(next: string | null): string {
  return next && /^\/admin(\/[a-z0-9-]{1,80}){0,2}$/.test(next) ? next : '/admin'
}

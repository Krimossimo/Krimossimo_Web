/**
 * Lecture des paramètres de déploiement (pure, testée par config.test.ts).
 */
import type { PayPalEnv } from './paypal.js'

/** « sandbox » ou « live » exactement ; toute autre valeur désactive les paiements (aucun repli silencieux). */
export function parsePayPalEnv(value: string | undefined): PayPalEnv | null {
  const v = (value ?? '').trim()
  return v === 'sandbox' || v === 'live' ? v : null
}

/**
 * Origines autorisées à appeler les fonctions (ALLOWED_ORIGINS, séparées par des virgules).
 * En mode live, seules les origines HTTPS sont retenues : une origine de développement
 * (http://localhost...) oubliée dans la configuration ne peut pas déclencher de vrai paiement.
 */
export function allowedOrigins(value: string, env: PayPalEnv): string[] {
  const list = value
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  return env === 'live' ? list.filter((o) => o.startsWith('https://')) : list
}

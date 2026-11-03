import { describe, expect, it } from 'vitest'
import { findExposedSecrets } from './envGuard'

describe('garde-fou des variables Vite', () => {
  it('signale toute variable VITE_* au nom de secret', () => {
    expect(
      findExposedSecrets({
        VITE_PAYPAL_CLIENT_SECRET: 'abc',
        VITE_STRIPE_PRIVATE_KEY: 'abc',
        VITE_ADMIN_PASSWORD: 'abc',
        VITE_API_TOKEN: 'abc',
      }),
    ).toEqual(['VITE_ADMIN_PASSWORD', 'VITE_API_TOKEN', 'VITE_PAYPAL_CLIENT_SECRET', 'VITE_STRIPE_PRIVATE_KEY'])
  })

  it('laisse passer les identifiants publics par conception et les variables serveur', () => {
    expect(
      findExposedSecrets({
        VITE_PAYPAL_CLIENT_ID: 'AbC',
        VITE_FIREBASE_API_KEY: 'AIza',
        VITE_FUNCTIONS_BASE_URL: 'https://x',
        PAYPAL_CLIENT_SECRET: 'serveur-uniquement',
        VITE_EMPTY_SECRET: '',
      }),
    ).toEqual([])
  })
})

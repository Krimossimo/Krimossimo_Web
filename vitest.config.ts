// Tests unitaires du site (`npm test`). Les tests des Cloud Functions (functions/, node:test)
// et ceux des règles de sécurité (rules-tests/, émulateurs) ont leurs propres commandes.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})

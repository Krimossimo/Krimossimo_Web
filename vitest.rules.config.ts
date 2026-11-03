// Configuration Vitest des tests de règles (exécutés par `npm run test:rules`,
// dans les émulateurs Firebase lancés par `firebase emulators:exec`).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['rules-tests/**/*.emulator.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
})

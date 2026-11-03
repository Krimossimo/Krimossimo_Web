import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { findExposedSecrets } from './src/lib/envGuard'

/**
 * Refuse de démarrer si une variable VITE_* ressemble à un secret : tout ce qui
 * commence par VITE_ est copié dans le JavaScript envoyé aux visiteurs.
 * Les secrets PayPal vont dans les secrets Firebase Functions (voir README).
 */
function forbidPublicSecrets(): Plugin {
  return {
    name: 'krimossimo:forbid-public-secrets',
    config(_config, { mode }) {
      const exposed = findExposedSecrets(loadEnv(mode, process.cwd(), 'VITE_'))
      if (exposed.length > 0) {
        throw new Error(
          `Variables secrètes exposées au navigateur : ${exposed.join(', ')}.\n` +
            'Retire-les de .env / .env.local et place-les dans les secrets Firebase Functions ' +
            '(firebase functions:secrets:set NOM).',
        )
      }
    },
  }
}

// BASE_PATH vaut "/" en local et pour un domaine personnalisé.
// Pour https://<utilisateur>.github.io/<depot>/, le workflow GitHub Actions
// passe BASE_PATH="/<depot>/".
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [forbidPublicSecrets(), react(), tailwindcss()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
})

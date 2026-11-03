// GitHub Pages ne connaît pas les routes de React Router.
// En copiant index.html vers 404.html, toute URL profonde (ex. /projects)
// charge l'application, qui affiche ensuite la bonne page.
import { copyFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const dist = resolve(import.meta.dirname, '..', 'dist')
const index = resolve(dist, 'index.html')

if (!existsSync(index)) {
  console.error('spa-fallback: dist/index.html introuvable, lance d’abord vite build.')
  process.exit(1)
}

copyFileSync(index, resolve(dist, '404.html'))
// Empêche GitHub Pages d’appliquer Jekyll (qui ignore les fichiers commençant par "_").
writeFileSync(resolve(dist, '.nojekyll'), '')
console.log('spa-fallback: 404.html et .nojekyll créés.')

import type { Game } from '../../types/content'

/**
 * ⚠ DONNÉES DE DÉMONSTRATION — JEUX FICTIFS.
 * Couvrent les trois cas d'affichage : gratuit, payant avec prix, payant sans prix.
 * Liens vers example.com. Affichés avec un badge « Démo », uniquement en mode démonstration.
 */
export const demoGames: Game[] = [
  {
    id: 'demo-jeu-gratuit',
    isDemo: true,
    order: 1,
    createdAt: '2026-08-20',
    publication: 'published',
    title: { fr: 'Exemple : jeu gratuit', en: 'Example: free game' },
    description: {
      fr: 'Jeu fictif de démonstration, téléchargeable gratuitement.',
      en: 'Fictional demo game, free to download.',
    },
    cover: {
      src: 'images/demo/demo-cover-1.webp',
      alt: { fr: 'Couverture de démonstration', en: 'Demo cover' },
    },
    pricing: { type: 'free' },
    link: { url: 'https://example.com/', kind: 'download' },
  },
  {
    id: 'demo-jeu-payant',
    isDemo: true,
    order: 2,
    createdAt: '2026-06-14',
    publication: 'published',
    title: { fr: 'Exemple : jeu payant', en: 'Example: paid game' },
    description: {
      fr: 'Jeu fictif de démonstration, vendu sur une boutique officielle.',
      en: 'Fictional demo game, sold on an official store.',
    },
    cover: {
      src: 'images/demo/demo-cover-4.webp',
      alt: { fr: 'Couverture de démonstration', en: 'Demo cover' },
    },
    pricing: { type: 'paid', price: { amount: 4.99, currency: 'EUR' } },
    link: { url: 'https://example.com/', kind: 'store', storeName: 'itch.io' },
  },
  {
    id: 'demo-jeu-prix-boutique',
    isDemo: true,
    order: 3,
    createdAt: '2026-04-02',
    publication: 'published',
    title: { fr: 'Exemple : prix sur la boutique', en: 'Example: price on the store' },
    description: {
      fr: 'Jeu fictif de démonstration, payant, dont le prix est indiqué sur la boutique.',
      en: 'Fictional demo game, paid, with its price shown on the store.',
    },
    cover: {
      src: 'images/demo/demo-cover-3.webp',
      alt: { fr: 'Couverture de démonstration', en: 'Demo cover' },
    },
    pricing: { type: 'paid' },
    link: { url: 'https://example.com/', kind: 'store' },
  },
]

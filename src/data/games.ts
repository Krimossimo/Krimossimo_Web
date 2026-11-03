import type { Game } from '../types/content'

/**
 * Jeux vidéo RÉELS (source locale, en attendant Firestore). Liste vide pour l'instant.
 *
 * Exemple (couverture dans public/images/games/) :
 * {
 *   id: 'mon-jeu',
 *   createdAt: '2026-11-01',
 *   publication: 'published',
 *   title: 'Mon jeu',
 *   description: { fr: 'Description du jeu.', en: 'Game description.' },
 *   cover: { src: 'images/games/mon-jeu.webp', alt: { fr: 'Couverture de Mon jeu', en: 'Mon jeu cover' } },
 *   pricing: { type: 'free' },   // ou { type: 'paid', price: { amount: 4.99, currency: 'EUR' } }
 *   link: { url: 'https://...', kind: 'store', storeName: 'itch.io' },   // ou kind: 'download'
 * }
 */
export const games: Game[] = []

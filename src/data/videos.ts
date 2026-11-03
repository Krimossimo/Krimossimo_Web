import type { Video } from '../types/content'

/**
 * Vidéos de la page Activités (source locale). Liste vide pour l'instant :
 * la récupération automatique des dernières vidéos YouTube (flux de la chaîne
 * lu côté serveur puis mis en cache dans Firestore) arrivera dans la phase
 * d'intégration. Aucune vidéo de démonstration n'est fournie : un faux
 * identifiant YouTube mènerait vers une page inexistante.
 *
 * Exemple manuel :
 * { youtubeId: 'IDENTIFIANT', title: 'Titre de la vidéo', publishedAt: '2026-10-01' }
 * (l'identifiant fait 11 caractères : la partie après "v=" dans l'URL YouTube)
 */
export const videos: Video[] = []

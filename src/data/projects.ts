import type { Project } from '../types/content'

/**
 * Projets RÉELS du portfolio (source locale, en attendant Firestore).
 * Les exemples fictifs sont dans src/data/demo/ et portent isDemo: true.
 *
 * Pour ajouter un projet : copie l'objet ci-dessous, change l'id (utilisé dans
 * l'URL /projects/<id>) et place la couverture dans public/images/projects/.
 * Catégories : 'website' | 'software' | 'cybersecurity' | 'uiux'.
 * publication: 'draft' masque le projet sans le supprimer.
 */
export const projects: Project[] = [
  {
    id: 'krimossimo-web',
    title: 'Krimossimo Web',
    category: 'website',
    createdAt: '2026-10-22',
    publication: 'published',
    progress: 'in-progress',
    featured: true,
    summary: {
      fr: 'Le site officiel de la marque Krimossimo : projets, offres, jeux vidéo et activités, en français et en anglais.',
      en: 'The official Krimossimo website: projects, services, video games and activities, in French and English.',
    },
    description: {
      fr: 'Le site officiel de la marque Krimossimo. Il réunit mes projets, mes offres, mes jeux vidéo et mes activités, en français et en anglais.\n\nIl est construit avec React, TypeScript et Tailwind CSS, propose un thème clair et un thème sombre, et s’adapte aux mobiles, tablettes et ordinateurs.',
      en: 'The official Krimossimo website. It brings together my projects, services, video games and activities, in French and English.\n\nIt is built with React, TypeScript and Tailwind CSS, offers light and dark themes, and adapts to phones, tablets and desktops.',
    },
    cover: {
      src: 'images/projects/krimossimo-web.webp',
      alt: { fr: 'Page d’accueil du site Krimossimo', en: 'Home page of the Krimossimo website' },
    },
    stack: ['React', 'TypeScript', 'Tailwind CSS', 'Vite'],
  },
]

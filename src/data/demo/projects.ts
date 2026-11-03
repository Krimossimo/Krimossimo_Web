import type { Project } from '../../types/content'

/**
 * ⚠ DONNÉES DE DÉMONSTRATION — PROJETS FICTIFS.
 * Affichées avec un badge « Démo », uniquement quand le mode démonstration est actif
 * (par défaut : `npm run dev` sans Firebase configuré). Jamais dans un build de
 * production, sauf si VITE_DEMO_CONTENT=true. Les liens pointent vers example.com,
 * un domaine réservé aux exemples.
 */
const demoText = {
  fr: 'Projet fictif de démonstration. Il illustre l’affichage de la galerie en attendant le vrai contenu.\n\nCe texte sera remplacé par la description personnalisée du projet.',
  en: 'Fictional demo project. It shows how the gallery looks until the real content is added.\n\nThis text will be replaced by the project’s own description.',
}

export const demoProjects: Project[] = [
  {
    id: 'demo-site-vitrine',
    isDemo: true,
    title: { fr: 'Exemple : site vitrine', en: 'Example: showcase website' },
    category: 'website',
    createdAt: '2026-09-18',
    publication: 'published',
    progress: 'completed',
    description: demoText,
    cover: {
      src: 'images/demo/demo-cover-1.webp',
      alt: { fr: 'Illustration de démonstration en pixels bleus', en: 'Demo illustration with blue pixels' },
    },
    externalUrl: 'https://example.com/',
  },
  {
    id: 'demo-outil-gestion',
    isDemo: true,
    title: { fr: 'Exemple : outil de gestion', en: 'Example: management tool' },
    category: 'software',
    createdAt: '2026-07-02',
    publication: 'published',
    progress: 'in-progress',
    description: demoText,
  },
  {
    id: 'demo-audit-securite',
    isDemo: true,
    title: { fr: 'Exemple : audit de sécurité', en: 'Example: security audit' },
    category: 'cybersecurity',
    createdAt: '2026-05-11',
    publication: 'published',
    progress: 'completed',
    description: demoText,
    cover: {
      src: 'images/demo/demo-cover-3.webp',
      alt: { fr: 'Illustration de démonstration en pixels clairs', en: 'Demo illustration with light pixels' },
    },
  },
  {
    id: 'demo-maquettes-mobile',
    isDemo: true,
    title: { fr: 'Exemple : maquettes d’application mobile', en: 'Example: mobile app mockups' },
    category: 'uiux',
    createdAt: '2026-03-27',
    publication: 'published',
    progress: 'completed',
    description: demoText,
    cover: {
      src: 'images/demo/demo-cover-2.webp',
      alt: { fr: 'Illustration de démonstration sur fond bleu clair', en: 'Demo illustration on a light blue background' },
    },
  },
  {
    // Brouillon : ne doit JAMAIS apparaître sur le site (vérifié par les tests).
    id: 'demo-brouillon',
    isDemo: true,
    title: { fr: 'Exemple : brouillon non publié', en: 'Example: unpublished draft' },
    category: 'website',
    createdAt: '2026-10-01',
    publication: 'draft',
    description: demoText,
  },
]

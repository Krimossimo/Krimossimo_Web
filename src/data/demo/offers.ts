import type { Offer } from '../../types/content'

/**
 * ⚠ DONNÉES DE DÉMONSTRATION — OFFRES FICTIVES, PRIX FICTIFS.
 * Elles couvrent tous les cas du parcours d'achat : prix fixe (ajout au panier),
 * quantité multiple, prix « à partir de » (sur devis) et offre indisponible.
 * Affichées avec un badge « Démo », uniquement en mode démonstration.
 */
export const demoOffers: Offer[] = [
  {
    id: 'demo-offre-prix-fixe',
    isDemo: true,
    order: 90,
    createdAt: '2026-10-01',
    publication: 'published',
    availability: 'available',
    price: 149,
    currency: 'EUR',
    contactSubject: 'other',
    title: { fr: 'Exemple : prestation à prix fixe', en: 'Example: fixed-price service' },
    description: {
      fr: 'Prestation fictive de démonstration, commandable en ligne une seule fois.',
      en: 'Fictional demo service that can be ordered online once.',
    },
  },
  {
    id: 'demo-offre-quantite',
    isDemo: true,
    order: 91,
    createdAt: '2026-10-01',
    publication: 'published',
    availability: 'available',
    price: 39.9,
    currency: 'EUR',
    maxQuantity: 5,
    contactSubject: 'promotion',
    title: { fr: 'Exemple : publication supplémentaire', en: 'Example: extra post' },
    description: {
      fr: 'Prestation fictive de démonstration, commandable en plusieurs unités (jusqu’à 5).',
      en: 'Fictional demo service that can be ordered in several units (up to 5).',
    },
    conditions: {
      fr: 'Conditions de démonstration.',
      en: 'Demo terms.',
    },
  },
  {
    id: 'demo-offre-a-partir',
    isDemo: true,
    order: 92,
    createdAt: '2026-10-01',
    publication: 'published',
    availability: 'available',
    price: 290,
    priceFrom: true,
    currency: 'EUR',
    contactSubject: 'website',
    title: { fr: 'Exemple : tarif « à partir de »', en: 'Example: “from” price' },
    description: {
      fr: 'Prestation fictive de démonstration avec un tarif indicatif : elle reste sur devis.',
      en: 'Fictional demo service with an indicative price: it stays quote-based.',
    },
  },
  {
    id: 'demo-offre-indisponible',
    isDemo: true,
    order: 93,
    createdAt: '2026-10-01',
    publication: 'published',
    availability: 'unavailable',
    price: 49,
    currency: 'EUR',
    contactSubject: 'other',
    title: { fr: 'Exemple : offre indisponible', en: 'Example: unavailable service' },
    description: {
      fr: 'Offre fictive de démonstration montrant l’affichage d’une offre temporairement indisponible.',
      en: 'Fictional demo service showing how a temporarily unavailable service is displayed.',
    },
  },
]

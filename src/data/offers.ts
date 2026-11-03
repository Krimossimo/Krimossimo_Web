import type { Offer } from '../types/content'

/**
 * Offres RÉELLES de la boutique (source locale, en attendant Firestore).
 *
 * Aucun prix n'est renseigné (price: null) : la carte affiche « Prix sur demande ».
 * Pour afficher un prix indicatif : price: 490, priceFrom: true → « À partir de 490 € ».
 * Ce prix sert uniquement à l'affichage : un paiement relit toujours le prix côté serveur.
 */
export const offers: Offer[] = [
  {
    id: 'website',
    order: 1,
    createdAt: '2026-10-22',
    publication: 'published',
    availability: 'available',
    price: null,
    currency: 'EUR',
    contactSubject: 'website',
    title: { fr: 'Création de site web avec l’IA', en: 'AI-assisted website creation' },
    description: {
      fr: 'Je crée votre site web avec l’aide de l’IA générative, selon vos besoins et votre image.',
      en: 'I build your website with the help of generative AI, tailored to your needs and your image.',
    },
  },
  {
    id: 'software',
    order: 2,
    createdAt: '2026-10-22',
    publication: 'published',
    availability: 'available',
    price: null,
    currency: 'EUR',
    contactSubject: 'software',
    title: { fr: 'Création d’application ou de logiciel', en: 'App or software development' },
    description: {
      fr: 'Je crée votre application ou votre logiciel avec l’aide de l’IA générative, pour répondre à votre besoin.',
      en: 'I build your app or software with the help of generative AI, to meet your needs.',
    },
  },
  {
    id: 'promotion',
    order: 3,
    createdAt: '2026-10-22',
    publication: 'published',
    availability: 'available',
    price: null,
    currency: 'EUR',
    contactSubject: 'promotion',
    title: { fr: 'Mise en avant de produit', en: 'Product promotion' },
    description: {
      fr: 'Je présente votre produit dans mes contenus, notamment en publicité dans une vidéo YouTube ou en Story.',
      en: 'I feature your product in my content, for example as an ad in a YouTube video or in a Story.',
    },
    conditions: {
      fr: 'Sous réserve d’acceptation, selon mes conditions.',
      en: 'Subject to approval, under my terms.',
    },
  },
]

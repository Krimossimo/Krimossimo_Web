/** Motifs de validation partagés (contact, commande). Le serveur refait ses propres vérifications. */

/** Volontairement simple : nom@domaine.ext. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

import { useEffect } from 'react'

/** Met à jour le titre de l'onglet : "Page | Krimossimo". */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} | Krimossimo` : 'Krimossimo'
  }, [title])
}

import { createContext, useContext } from 'react'
import type { AchievementId, GameState } from './achievements'

export type GameApi = {
  state: GameState
  /** Nombre de succès débloqués et total. */
  count: number
  total: number
  unlock: (id: AchievementId) => void
  /** Signale qu'un mode de l'accueil a été essayé. */
  trackMode: (mode: string) => void
  /** Efface la progression (bouton « Recommencer »). */
  reset: () => void
  /** Succès récemment débloqués, affichés en notification. */
  toasts: ReadonlyArray<{ key: number; id: AchievementId }>
  dismiss: (key: number) => void
}

export const GameContext = createContext<GameApi | null>(null)

/** Accès au jeu ; renvoie null hors du site public (administration), sans erreur. */
export function useGame(): GameApi | null {
  return useContext(GameContext)
}

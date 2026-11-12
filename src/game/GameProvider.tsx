import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme/theme-context'
import { useCart } from '../cart/cart-context'
import { pixelRain } from '../motion/effects'
import {
  SECRET_CODE,
  achievementIds,
  advanceCode,
  emptyState,
  isUnlocked,
  loadState,
  saveState,
  tryMode,
  unlock as unlockPure,
  unlockedCount,
  visitPage,
  type AchievementId,
  type GameState,
} from './achievements'
import { GameContext, type GameApi } from './game-context'

type Result = { state: GameState; unlocked: AchievementId[] }

const TOAST_MS = 5200

/**
 * Petit jeu d'exploration : des succès se débloquent en parcourant le site.
 * La progression reste dans le navigateur du visiteur (identifiants de succès uniquement).
 */
export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(loadState)
  const stateRef = useRef(state)
  const [toasts, setToasts] = useState<Array<{ key: number; id: AchievementId }>>([])
  const toastKey = useRef(0)

  const apply = useCallback((step: (s: GameState) => Result) => {
    const result = step(stateRef.current)
    if (result.state === stateRef.current) return
    stateRef.current = result.state
    setState(result.state)
    saveState(result.state)
    if (result.unlocked.length) {
      setToasts((list) => [...list, ...result.unlocked.map((id) => ({ key: ++toastKey.current, id }))].slice(-3))
      if (result.unlocked.includes('secret')) pixelRain()
    }
  }, [])

  const unlock = useCallback((id: AchievementId) => apply((s) => unlockPure(s, id)), [apply])
  const trackMode = useCallback((mode: string) => apply((s) => tryMode(s, mode)), [apply])
  const reset = useCallback(() => {
    const fresh = emptyState()
    stateRef.current = fresh
    setState(fresh)
    saveState(fresh)
    setToasts([])
  }, [])
  const dismiss = useCallback((key: number) => setToasts((list) => list.filter((t) => t.key !== key)), [])

  // Disparition automatique des notifications.
  useEffect(() => {
    if (toasts.length === 0) return
    const timer = window.setTimeout(() => setToasts((list) => list.slice(1)), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toasts])

  // Premier lancement.
  useEffect(() => {
    const timer = window.setTimeout(() => unlock('start'), 1400)
    return () => window.clearTimeout(timer)
  }, [unlock])

  // Pages visitées.
  const { pathname } = useLocation()
  useEffect(() => {
    apply((s) => visitPage(s, pathname))
  }, [pathname, apply])

  // Changement de thème (pas au chargement).
  const { theme } = useTheme()
  const firstTheme = useRef(theme)
  useEffect(() => {
    if (theme !== firstTheme.current) unlock('theme')
  }, [theme, unlock])

  // Changement de langue.
  const { i18n } = useTranslation()
  useEffect(() => {
    const onChange = () => unlock('language')
    i18n.on('languageChanged', onChange)
    return () => i18n.off('languageChanged', onChange)
  }, [i18n, unlock])

  // Ajout au panier.
  const { count: cartCount } = useCart()
  const lastCart = useRef(cartCount)
  useEffect(() => {
    if (cartCount > lastCart.current) unlock('loot')
    lastCart.current = cartCount
  }, [cartCount, unlock])

  // Bas de page atteint (sur une page assez longue pour défiler).
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement
      if (doc.scrollHeight < window.innerHeight * 1.4) return
      if (window.scrollY + window.innerHeight >= doc.scrollHeight - 48) unlock('bottom')
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [unlock])

  // Code secret au clavier (ignoré pendant la saisie dans un champ).
  useEffect(() => {
    let position = 0
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      position = advanceCode(position, e.key)
      if (position === SECRET_CODE.length) {
        position = 0
        // Déjà débloqué : la pluie de pixels reste offerte à chaque fois.
        if (isUnlocked(stateRef.current, 'secret')) pixelRain()
        else unlock('secret')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [unlock])

  const api = useMemo<GameApi>(
    () => ({
      state,
      count: unlockedCount(state),
      total: achievementIds.length,
      unlock,
      trackMode,
      reset,
      toasts,
      dismiss,
    }),
    [state, unlock, trackMode, reset, toasts, dismiss],
  )

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>
}

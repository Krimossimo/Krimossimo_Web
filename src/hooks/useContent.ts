import { useCallback, useEffect, useState } from 'react'

export type ContentState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: unknown }

/**
 * Charge un contenu via un service (src/content/) et expose son état.
 * `load` doit être stable (fonction du service, ou mémorisée avec useCallback).
 * `retry()` relance le chargement en ignorant le cache.
 */
export function useContent<T>(load: (fresh: boolean) => Promise<T>): ContentState<T> & { retry: () => void } {
  const [state, setState] = useState<ContentState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    load(attempt > 0).then(
      (data) => active && setState({ status: 'ready', data }),
      (error: unknown) => active && setState({ status: 'error', error }),
    )
    return () => {
      active = false
    }
  }, [load, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { ...state, retry }
}

/**
 * Vrai seulement si `active` le reste plus de `delay` ms : évite qu'un chargement
 * très court fasse clignoter un état de chargement.
 */
export function useDelayedFlag(active: boolean, delay = 250): boolean {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }
    const timer = window.setTimeout(() => setVisible(true), delay)
    return () => window.clearTimeout(timer)
  }, [active, delay])
  return visible
}

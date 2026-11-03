import { useCallback, useEffect, useState } from 'react'
import { firestoreErrorCode } from './adminStore'

export type AdminDataState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; code: ReturnType<typeof firestoreErrorCode> }

/** Chargement d'une liste d'administration, avec rechargement après une action. */
export function useAdminData<T>(load: () => Promise<T>) {
  const [state, setState] = useState<AdminDataState<T>>({ status: 'loading' })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }))
    load().then(
      (data) => active && setState({ status: 'ready', data }),
      (error: unknown) => active && setState({ status: 'error', code: firestoreErrorCode(error) }),
    )
    return () => {
      active = false
    }
  }, [load, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { state, reload, setState }
}

import { useEffect, useState, type ReactNode } from 'react'
import { isFirebaseConfigured } from '../lib/firebase'
import { AdminAuthContext, type AdminAuthState } from './admin-context'
import { signOutAdmin, watchSession } from './authService'

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminAuthState>(isFirebaseConfigured ? { status: 'loading' } : { status: 'unconfigured' })

  useEffect(() => {
    if (!isFirebaseConfigured) return
    return watchSession(
      (session) => {
        if (!session) setState({ status: 'signed-out' })
        else if (session.isAdmin) setState({ status: 'admin', session })
        else {
          // Compte valide mais sans rôle : aucune session administrateur n'est conservée.
          setState({ status: 'signed-out' })
          void signOutAdmin()
        }
      },
      (error) => setState({ status: 'signed-out', error }),
    )
  }, [])

  return <AdminAuthContext.Provider value={state}>{children}</AdminAuthContext.Provider>
}

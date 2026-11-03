import { useEffect, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAdminAuth } from './admin-context'
import { Notice } from './components/ui'

/**
 * Garde d'affichage des pages d'administration. Elle évite d'afficher une page vide à
 * un visiteur non connecté, mais ne protège rien à elle seule : sans le claim admin,
 * Firestore, Storage et les fonctions refusent toutes les lectures et écritures privées.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const state = useAdminAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    if (state.status === 'signed-out') navigate(`/admin/login?next=${encodeURIComponent(pathname)}`, { replace: true })
  }, [state.status, navigate, pathname])

  if (state.status === 'unconfigured') {
    return (
      <Notice tone="info" title={t('admin.notConfigured.title')}>
        {t('admin.notConfigured.text')}
      </Notice>
    )
  }
  if (state.status !== 'admin') {
    return (
      <p role="status" className="text-muted">
        {t('admin.loadingSession')}
      </p>
    )
  }
  return <>{children}</>
}

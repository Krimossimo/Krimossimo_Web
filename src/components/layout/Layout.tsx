import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Header } from './Header'
import { Footer } from './Footer'

export function Layout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  // Remonte en haut de page à chaque navigation.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-blue px-4 py-2 text-on-blue focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t('a11y.skipToContent')}
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

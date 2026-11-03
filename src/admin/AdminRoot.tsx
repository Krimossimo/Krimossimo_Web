/**
 * Espace d'administration (chargé à la demande : aucun code d'administration ni module
 * Firebase Auth n'est téléchargé par les visiteurs du site).
 *
 * Mise en page distincte du site public : navigation latérale sur ordinateur, barre
 * supérieure + menu déroulant sur mobile. L'adresse /admin n'est pas secrète : l'accès
 * aux données est contrôlé par Firebase (règles et fonctions serveur), pas par l'interface.
 */
import { Suspense, useEffect, useRef, useState, type ComponentType, type SVGProps } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { BrandLogo } from '../components/ui/BrandLogo'
import { CloseIcon, MenuIcon } from '../components/ui/Icons'
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { AdminAuthProvider } from './AdminAuthProvider'
import { useAdminAuth } from './admin-context'
import { signOutAdmin } from './authService'
import {
  AccountIcon,
  ExternalIcon,
  GamesIcon,
  MessagesIcon,
  OrdersIcon,
  OverviewIcon,
  ProjectsIcon,
  ShopIcon,
  SignOutIcon,
} from './components/icons'

type NavItem = { to: string; key: string; icon: ComponentType<SVGProps<SVGSVGElement>>; end?: boolean }

const navGroups: { key: string | null; items: NavItem[] }[] = [
  { key: null, items: [{ to: '/admin', key: 'overview', icon: OverviewIcon, end: true }] },
  {
    key: 'groupContent',
    items: [
      { to: '/admin/projects', key: 'projects', icon: ProjectsIcon },
      { to: '/admin/shop', key: 'shop', icon: ShopIcon },
      { to: '/admin/games', key: 'games', icon: GamesIcon },
    ],
  },
  {
    key: 'groupActivity',
    items: [
      { to: '/admin/orders', key: 'orders', icon: OrdersIcon },
      { to: '/admin/messages', key: 'messages', icon: MessagesIcon },
    ],
  },
  { key: 'groupAccount', items: [{ to: '/admin/account', key: 'account', icon: AccountIcon }] },
]

/** Demande aux moteurs de recherche de ne pas indexer l'administration. */
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
}

function NavLinks() {
  const { t } = useTranslation()
  return (
    <div className="space-y-5">
      {navGroups.map((group) => (
        <div key={group.key ?? 'main'}>
          {group.key && <p className="mb-1.5 px-3 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted">{t(`admin.nav.${group.key}`)}</p>}
          <ul className="space-y-0.5">
            {group.items.map(({ to, key, icon: Icon, end }) => (
              <li key={key}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.95rem] font-medium transition-colors ${
                      isActive ? 'bg-blue-tint text-ink' : 'text-ink-soft hover:bg-surface hover:text-ink'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={isActive ? 'text-blue' : 'text-muted'} />
                      {t(`admin.nav.${key}`)}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function SessionFooter({ email }: { email: string | null }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <p className="px-3 text-sm text-muted">
        {t('admin.nav.signedInAs')}
        <span className="block truncate font-medium text-ink" title={email ?? undefined}>
          {email ?? '—'}
        </span>
      </p>
      <div className="flex items-center gap-2 px-1">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className="grid gap-1">
        <Link to="/" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.95rem] text-ink-soft hover:bg-surface hover:text-ink">
          <ExternalIcon className="text-muted" />
          {t('admin.nav.viewSite')}
        </Link>
        <button
          type="button"
          disabled={leaving}
          onClick={async () => {
            setLeaving(true)
            await signOutAdmin().catch(() => {})
            navigate('/admin/login', { replace: true })
            setLeaving(false)
          }}
          className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-[0.95rem] text-ink-soft hover:bg-surface hover:text-ink disabled:opacity-60"
        >
          <SignOutIcon className="text-muted" />
          {t('admin.nav.signOut')}
        </button>
      </div>
    </div>
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <Link to="/admin" className="flex items-center gap-2.5 rounded-xl" aria-label={t('admin.title')}>
      <BrandLogo />
      <span className={`${compact ? 'hidden sm:inline' : ''} rounded-full border border-line-strong px-2 py-0.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-ink-soft`}>
        {t('admin.badge')}
      </span>
    </Link>
  )
}

/** Navigation latérale (ordinateur). */
function Sidebar({ email }: { email: string | null }) {
  const { t } = useTranslation()
  return (
    <aside className="sticky top-0 hidden h-dvh w-[17rem] shrink-0 flex-col border-r border-line bg-bg px-4 py-5 lg:flex">
      <div className="px-2">
        <Brand />
      </div>
      <nav aria-label={t('admin.nav.label')} className="mt-8 flex-1 overflow-y-auto">
        <NavLinks />
      </nav>
      <SessionFooter email={email} />
    </aside>
  )
}

/** Barre supérieure + menu (mobile et tablette). */
function MobileBar({ email }: { email: string | null }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="sticky top-0 z-30 border-b border-line bg-bg lg:hidden">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <Brand />
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls="admin-mobile-nav"
          aria-label={open ? t('admin.nav.closeMenu') : t('admin.nav.menu')}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex size-11 items-center justify-center rounded-xl border border-line text-ink hover:border-line-strong"
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>
      {open && (
        <nav id="admin-mobile-nav" aria-label={t('admin.nav.label')} className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-line px-4 pb-5 pt-4 sm:px-6">
          <NavLinks />
          <div className="mt-5">
            <SessionFooter email={email} />
          </div>
        </nav>
      )}
    </div>
  )
}

/** Barre minimale avant connexion. */
function GuestBar() {
  return (
    <header className="border-b border-line bg-bg">
      <div className="mx-auto flex h-16 max-w-[76rem] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Brand compact />
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

function AdminFallback() {
  const { t } = useTranslation()
  return (
    <p role="status" className="text-muted">
      {t('admin.fallback')}
    </p>
  )
}

function Shell() {
  const { t } = useTranslation()
  const state = useAdminAuth()
  const signedIn = state.status === 'admin'
  const email = signedIn ? state.session.email : null

  return (
    <div className={`min-h-dvh ${signedIn ? 'bg-surface lg:flex' : 'bg-bg'}`}>
      <a
        href="#admin-main"
        className="sr-only z-50 rounded-lg bg-blue px-4 py-2 text-on-blue focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t('a11y.skipToContent')}
      </a>
      {signedIn ? (
        <>
          <Sidebar email={email} />
          <MobileBar email={email} />
        </>
      ) : (
        <GuestBar />
      )}
      <main
        id="admin-main"
        tabIndex={-1}
        className={`min-w-0 flex-1 px-4 pb-16 pt-8 outline-none sm:px-6 sm:pt-10 ${signedIn ? 'lg:px-10' : 'mx-auto max-w-[76rem] lg:px-8'}`}
      >
        <div className={signedIn ? 'mx-auto max-w-[64rem]' : ''}>
          <Suspense fallback={<AdminFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  )
}

export default function AdminRoot() {
  const { pathname } = useLocation()
  useNoIndex()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <AdminAuthProvider>
      <Shell />
    </AdminAuthProvider>
  )
}

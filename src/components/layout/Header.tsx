import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { navItems } from '../../config/site'
import { BrandLogo } from '../ui/BrandLogo'
import { ThemeToggle } from '../ui/ThemeToggle'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { CloseIcon, MenuIcon } from '../ui/Icons'
import { MobileMenu } from './MobileMenu'
import { CartLink } from '../cart/CartLink'
import { AchievementChip } from '../game/AchievementChip'

export function Header() {
  const { t } = useTranslation()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) toggleRef.current?.focus()
  }, [])

  // Ferme le menu à chaque changement de page.
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // Bordure du header seulement après défilement.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Ferme le menu mobile si l'écran repasse en grand format.
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const onChange = () => media.matches && setOpen(false)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return (
    <header
      className={`sticky top-0 z-40 isolate transition-[border-color] duration-200 ${
        scrolled || open ? 'border-b border-line' : 'border-b border-transparent'
      }`}
    >
      {/* Fond vitré après défilement. Calque séparé : un flou posé sur le header lui-même
          deviendrait le repère des éléments fixes (menu mobile). */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 -z-10 transition-colors duration-300 ${
          scrolled && !open ? 'bg-bg/75 backdrop-blur-xl backdrop-saturate-150' : 'bg-bg'
        }`}
      />
      <div className="mx-auto flex h-[4.5rem] max-w-[76rem] items-center gap-3 px-4 sm:gap-6 sm:px-6 lg:px-8">
        <Link to="/" aria-label={t('a11y.home')} className="flex shrink-0 rounded-xl">
          <BrandLogo />
        </Link>

        <nav aria-label={t('a11y.mainNav')} className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {navItems.map((item) =>
              item.key === 'contact' ? null : (
                <li key={item.key}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      `group relative inline-flex h-11 items-center rounded-lg px-3 text-[0.95rem] font-medium transition-colors duration-150 ${
                        isActive ? 'text-ink' : 'text-muted hover:text-ink'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {t(`nav.${item.key}`)}
                        <span
                          aria-hidden="true"
                          className={`absolute bottom-1.5 left-1/2 size-1.5 -translate-x-1/2 rounded-[2px] bg-blue transition-[opacity,transform] duration-200 ${
                            isActive ? 'scale-100 opacity-100' : 'scale-0 opacity-0 group-hover:scale-75 group-hover:opacity-60'
                          }`}
                        />
                      </>
                    )}
                  </NavLink>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <NavLink
            to="/contact"
            className={({ isActive }) =>
              `hidden h-11 items-center rounded-xl border px-4 text-[0.95rem] font-medium transition-colors duration-150 lg:inline-flex ${
                isActive
                  ? 'border-blue bg-blue-tint text-ink'
                  : 'border-line-strong text-ink hover:border-ink'
              }`
            }
          >
            {t('nav.contact')}
          </NavLink>
          <AchievementChip className="hidden sm:inline-flex" />
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <CartLink />
          <ThemeToggle />
          <button
            ref={toggleRef}
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-xl border border-line text-ink transition-colors hover:border-line-strong lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? t('a11y.closeMenu') : t('a11y.openMenu')}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      <MobileMenu open={open} onClose={close} toggleRef={toggleRef} />
    </header>
  )
}

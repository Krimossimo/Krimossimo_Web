import { useEffect, useRef, type RefObject } from 'react'
import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import { navItems, socials } from '../../config/site'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { SocialIcon } from '../ui/Icons'

type Props = {
  open: boolean
  onClose: (restoreFocus?: boolean) => void
  toggleRef: RefObject<HTMLButtonElement | null>
}

/**
 * Menu plein écran pour mobile et tablette.
 * Accessibilité : focus placé sur le premier lien, piégé dans le menu (Tab),
 * fermeture avec Échap, défilement de la page bloqué pendant l'ouverture.
 */
export function MobileMenu({ open, onClose, toggleRef }: Props) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel?.querySelector<HTMLElement>('a, button')?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const focusables = [
        toggleRef.current,
        ...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      ].filter((el): el is HTMLElement => Boolean(el))
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose, toggleRef])

  return (
    <div
      id="mobile-menu"
      ref={panelRef}
      hidden={!open}
      className="fixed inset-x-0 bottom-0 top-[4.5rem] z-40 overflow-y-auto bg-bg lg:hidden"
    >
      <div className="swap-in mx-auto flex min-h-full max-w-[76rem] flex-col px-4 pb-8 pt-4 sm:px-6">
        <nav aria-label={t('a11y.mainNav')}>
          <ul className="divide-y divide-line border-b border-line">
            {navItems.map((item) => (
              <li key={item.key}>
                <NavLink
                  to={item.path}
                  onClick={() => onClose(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between py-4 font-display text-[1.6rem] font-medium tracking-[-0.02em] transition-colors sm:text-[2rem] ${
                      isActive ? 'text-blue' : 'text-ink hover:text-blue'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {t(`nav.${item.key}`)}
                      {isActive && <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-blue" />}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-4 pt-8">
          <LanguageSwitcher />
          <ul aria-label={t('a11y.socials')} className="flex flex-wrap items-center gap-1">
            {socials.map((s) => (
              <li key={s.id}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.label}
                  className="inline-flex size-11 items-center justify-center rounded-xl text-muted transition-colors hover:text-ink"
                >
                  <SocialIcon id={s.icon} />
                  <span className="sr-only">
                    {s.label} {t('a11y.external')}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

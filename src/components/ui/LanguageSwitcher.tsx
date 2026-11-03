import { useTranslation } from 'react-i18next'
import { languages, type Language } from '../../i18n'

/** Sélecteur FR/EN sous forme de commutateur segmenté. */
export function LanguageSwitcher({ className = 'inline-flex' }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const current: Language = i18n.resolvedLanguage === 'en' ? 'en' : 'fr'

  return (
    <div
      role="group"
      aria-label={t('a11y.language')}
      className={`h-11 items-center rounded-xl border border-line p-1 ${className}`}
    >
      {languages.map((lng) => {
        const active = lng === current
        return (
          <button
            key={lng}
            type="button"
            lang={lng}
            aria-pressed={active}
            onClick={() => void i18n.changeLanguage(lng)}
            className={`h-full min-w-10 rounded-lg px-2 text-sm font-semibold transition-colors duration-150 ${
              active ? 'bg-ink text-bg' : 'text-muted hover:text-ink'
            }`}
          >
            {lng.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}

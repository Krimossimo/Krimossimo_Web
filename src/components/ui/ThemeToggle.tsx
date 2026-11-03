import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/theme-context'
import { MoonIcon, SunIcon } from './Icons'

/** Bascule clair/sombre : l'icône affichée indique le mode vers lequel on passe. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const { t } = useTranslation()
  const isDark = theme === 'dark'
  const label = isDark ? t('a11y.toLight') : t('a11y.toDark')

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={`relative inline-flex size-11 items-center justify-center rounded-xl border border-line text-ink transition-colors duration-150 hover:border-line-strong hover:text-blue ${className}`}
    >
      <SunIcon
        className={`absolute transition-[opacity,transform] duration-200 ease-snap ${isDark ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
      />
      <MoonIcon
        className={`absolute transition-[opacity,transform] duration-200 ease-snap ${isDark ? 'scale-75 opacity-0' : 'scale-100 opacity-100'}`}
      />
    </button>
  )
}

import { useTranslation } from 'react-i18next'
import { PixelMark } from '../ui/PixelMark'

const roles = ['websites', 'apps', 'uiux', 'content', 'streaming', 'ai'] as const

/**
 * Bandeau défilant des activités, façon écran d'attente de borne d'arcade.
 * La liste est doublée pour boucler sans à-coup ; la copie est ignorée des lecteurs d'écran.
 * Se met en pause au survol, et devient une liste fixe avec « réduire les animations ».
 */
export function RolesMarquee() {
  const { t } = useTranslation()

  const row = (copy: boolean) => (
    <ul aria-hidden={copy || undefined} className={`flex shrink-0 items-center ${copy ? 'marquee-dup' : ''}`}>
      {roles.map((role, i) => (
        <li key={role} className="flex items-center">
          <span
            className={`whitespace-nowrap px-6 font-display text-[clamp(1.6rem,3.6vw,2.8rem)] font-semibold tracking-[-0.035em] sm:px-9 ${
              i % 2 ? 'text-transparent [-webkit-text-stroke:1.5px_var(--k-ink)]' : 'text-ink'
            }`}
          >
            {t(`about.roles.${role}.title`)}
          </span>
          <PixelMark seed={`role-${role}`} className="size-7 shrink-0 text-blue sm:size-8" />
        </li>
      ))}
    </ul>
  )

  return (
    <section aria-label={t('home.marqueeLabel')} className="marquee overflow-hidden border-y border-line py-6 sm:py-8">
      <div className="marquee-track">
        {row(false)}
        {row(true)}
      </div>
    </section>
  )
}

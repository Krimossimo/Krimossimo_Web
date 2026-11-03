import { useTranslation } from 'react-i18next'
import { useDelayedFlag } from '../../hooks/useContent'
import { AlertIcon, InfoIcon } from './Icons'

/**
 * Chargement : cartes fantômes statiques (aucune animation, aucun indicateur
 * circulaire), affichées seulement si l'attente dépasse un court délai.
 * Les lecteurs d'écran reçoivent un message texte.
 */
export function ContentLoading({ count = 3, className = '' }: { count?: number; className?: string }) {
  const { t } = useTranslation()
  const visible = useDelayedFlag(true)

  return (
    <div role="status" className={className}>
      <span className="sr-only">{t('content.loading')}</span>
      {visible && (
        <ul aria-hidden="true" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: count }, (_, i) => (
            <li key={i} className="rounded-[1.5rem] border border-line bg-raised p-3">
              <div className="aspect-[16/10] rounded-[1.1rem] bg-surface" />
              <div className="space-y-3 px-2 pb-3 pt-5">
                <div className="h-3 w-1/3 rounded-full bg-surface" />
                <div className="h-5 w-2/3 rounded-full bg-surface" />
                <div className="h-3 w-full rounded-full bg-surface" />
                <div className="h-3 w-4/5 rounded-full bg-surface" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Erreur de chargement (réseau, service indisponible) avec possibilité de réessayer. */
export function ContentError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-5 rounded-[1.5rem] border border-line-strong bg-surface p-7 sm:flex-row sm:items-center sm:p-9"
    >
      <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl bg-danger-tint text-danger">
        <AlertIcon className="size-6" />
      </span>
      <div className="flex-1">
        <h2 className="text-[1.25rem] font-semibold tracking-[-0.02em]">{t('content.errorTitle')}</h2>
        <p className="mt-2 max-w-xl text-muted">{t('content.errorText')}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-12 items-center rounded-xl bg-blue px-5 font-medium text-on-blue transition-colors hover:bg-blue-hover active:translate-y-px"
      >
        {t('content.retry')}
      </button>
    </div>
  )
}

/** Bandeau signalant la présence de contenus de démonstration sur la page. */
export function DemoNotice() {
  const { t } = useTranslation()
  return (
    <p className="flex items-start gap-2.5 rounded-xl border border-dashed border-blue bg-blue-tint px-4 py-3 text-[0.95rem] text-ink-soft">
      <InfoIcon className="mt-0.5 size-[18px] shrink-0 text-blue" />
      <span>
        <strong className="font-semibold text-ink">{t('content.demoNoticeTitle')}</strong> {t('content.demoNotice')}
      </span>
    </p>
  )
}

/** Badge « Démo » posé sur une carte de démonstration. */
export function DemoBadge({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      className={`inline-flex items-center rounded-full border border-dashed border-blue bg-bg px-2.5 py-0.5 text-[0.8rem] font-semibold text-blue ${className}`}
    >
      {t('content.demoBadge')}
    </span>
  )
}

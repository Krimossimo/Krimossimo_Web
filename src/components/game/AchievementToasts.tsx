import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useGame } from '../../game/game-context'
import { pixelBurst } from '../../motion/effects'
import { PixelMark } from '../ui/PixelMark'
import { CloseIcon } from '../ui/Icons'
import type { AchievementId } from '../../game/achievements'

/** Notifications « Succès débloqué », empilées en bas de l'écran. */
export function AchievementToasts() {
  const game = useGame()
  const { t } = useTranslation()
  if (!game) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-stretch gap-3 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[22rem]"
    >
      {game.toasts.map((toast) => (
        <Toast
          key={toast.key}
          id={toast.id}
          label={t('game.unlockedLabel')}
          title={t(`game.items.${toast.id}.title`)}
          text={t(`game.items.${toast.id}.text`)}
          dismissLabel={t('game.dismiss')}
          onDismiss={() => game.dismiss(toast.key)}
        />
      ))}
    </div>
  )
}

type ToastProps = {
  id: AchievementId
  label: string
  title: string
  text: string
  dismissLabel: string
  onDismiss: () => void
}

function Toast({ id, label, title, text, dismissLabel, onDismiss }: ToastProps) {
  const markRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const r = markRef.current?.getBoundingClientRect()
      if (r) pixelBurst(r.left + r.width / 2, r.top + r.height / 2, 18, 60)
    }, 260)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="toast-in pointer-events-auto flex items-center gap-4 rounded-2xl border border-blue bg-raised p-3.5 pr-2 shadow-lift">
      <div
        ref={markRef}
        className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-blue-tint"
      >
        <PixelMark seed={`achievement-${id}`} animate className="size-9 text-blue" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="hud-chip text-[0.8rem] font-semibold text-blue">{label}</p>
        <p className="font-display text-[1.02rem] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</p>
        <p className="mt-0.5 text-[0.88rem] leading-snug text-muted">{text}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="inline-flex size-9 shrink-0 items-center justify-center self-start rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <CloseIcon className="size-4" />
      </button>
    </div>
  )
}

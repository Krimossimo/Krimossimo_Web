import { useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useGame } from '../../game/game-context'
import { AchievementsPanel } from './AchievementsPanel'
import { TrophyIcon } from './GameIcons'

/**
 * Trophée du header : compteur de succès, qui ouvre le panneau des succès.
 * Fermeture : Échap, clic à l'extérieur, bouton de fermeture ou changement de page.
 */
export function AchievementChip({ className = '' }: { className?: string }) {
  const game = useGame()
  const { t } = useTranslation()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [bump, setBump] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const last = useRef(game?.count ?? 0)
  const { pathname } = useLocation()

  // Petit rebond du compteur à chaque nouveau succès.
  const count = game?.count ?? 0
  useEffect(() => {
    if (count > last.current) {
      setBump(true)
      const timer = window.setTimeout(() => setBump(false), 450)
      last.current = count
      return () => window.clearTimeout(timer)
    }
    last.current = count
  }, [count])

  // Fermé à chaque changement de page.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Ouverture : focus dans le panneau ; Échap et clic extérieur ferment.
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onPointer = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  if (!game) return null
  const label = t('game.chip', { count: game.count, total: game.total })

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((v) => !v)}
        className={`group inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-ink transition-colors duration-150 ${
          open ? 'border-blue bg-blue-tint' : 'border-line hover:border-line-strong'
        }`}
      >
        <TrophyIcon
          className={`size-[18px] text-blue transition-transform duration-300 ease-snap group-hover:-rotate-12 ${bump ? 'scale-125' : ''}`}
        />
        <span aria-hidden="true" className="hud-chip text-sm font-semibold max-[379px]:hidden">
          {game.count}
          <span className="text-muted">/{game.total}</span>
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          id={`${id}-panel`}
          role="dialog"
          aria-labelledby={`${id}-title`}
          tabIndex={-1}
          className="panel-in fixed inset-x-3 top-[4.75rem] z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-[1.5rem] border border-line bg-raised p-5 shadow-lift outline-none sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.6rem)] sm:w-[26rem]"
        >
          <AchievementsPanel
            titleId={`${id}-title`}
            onClose={() => {
              setOpen(false)
              buttonRef.current?.focus()
            }}
          />
        </div>
      )}
    </div>
  )
}

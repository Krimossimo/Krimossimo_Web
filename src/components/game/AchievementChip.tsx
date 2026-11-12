import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGame } from '../../game/game-context'
import { TrophyIcon } from './GameIcons'

/** Compteur de succès dans le header ; mène à la vitrine du pied de page. */
export function AchievementChip({ className = '' }: { className?: string }) {
  const game = useGame()
  const { t } = useTranslation()
  const [bump, setBump] = useState(false)
  const last = useRef(game?.count ?? 0)

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

  if (!game) return null
  const label = t('game.chip', { count: game.count, total: game.total })

  return (
    <a
      href="#achievements"
      aria-label={label}
      title={label}
      className={`group h-11 items-center gap-2 rounded-xl border border-line px-3 text-ink transition-colors duration-150 hover:border-line-strong ${className}`}
    >
      <TrophyIcon
        className={`size-[18px] text-blue transition-transform duration-300 ease-snap group-hover:-rotate-12 ${bump ? 'scale-125' : ''}`}
      />
      <span aria-hidden="true" className="hud-chip text-sm font-semibold">
        {game.count}
        <span className="text-muted">/{game.total}</span>
      </span>
    </a>
  )
}

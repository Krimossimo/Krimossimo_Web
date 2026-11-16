import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { achievementIds, hiddenAchievements, isUnlocked } from '../../game/achievements'
import { useGame } from '../../game/game-context'
import { PixelMark } from '../ui/PixelMark'
import { CloseIcon } from '../ui/Icons'
import { LockIcon } from './GameIcons'

/**
 * Contenu du panneau des succès (ouvert depuis le trophée du header) :
 * débloqués en bleu, les autres en attente.
 */
export function AchievementsPanel({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const game = useGame()
  const { t } = useTranslation()
  if (!game) return null

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={titleId} className="text-[1.3rem] font-semibold leading-tight tracking-[-0.025em]">
            {t('game.title')}
          </h2>
          <p className="mt-1 text-[0.92rem] text-muted">{t('game.lead')}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('game.close')}
          className="-mr-1 -mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-surface px-3.5 py-2.5">
        <p className="hud-chip font-display text-[1rem] font-semibold text-ink">
          {t('game.progress', { count: game.count, total: game.total })}
        </p>
        {game.count > 0 && (
          <button
            type="button"
            onClick={game.reset}
            className="text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            {t('game.reset')}
          </button>
        )}
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-2.5">
        {achievementIds.map((id, i) => {
          const done = isUnlocked(game.state, id)
          const secret = hiddenAchievements.has(id) && !done
          return (
            <li
              key={id}
              style={{ animationDelay: `${60 + i * 35}ms` } as CSSProperties}
              className={`swap-in flex h-full flex-col gap-2.5 rounded-2xl border p-3.5 ${
                done ? 'border-blue bg-blue-tint' : 'border-dashed border-line-strong bg-bg'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <PixelMark
                  seed={`achievement-${id}`}
                  animate={done}
                  className={`size-8 ${done ? 'text-blue' : 'text-line-strong'}`}
                />
                {!done && (
                  <span className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-muted">
                    <LockIcon className="size-3" />
                    {t('game.locked')}
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-sans text-[0.92rem] font-semibold leading-snug text-ink">
                  {secret ? '???' : t(`game.items.${id}.title`)}
                </h3>
                <p className="mt-0.5 text-[0.82rem] leading-snug text-muted">
                  {secret ? t('game.hiddenText') : t(`game.items.${id}.text`)}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

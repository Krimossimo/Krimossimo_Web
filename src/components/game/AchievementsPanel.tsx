import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { achievementIds, hiddenAchievements, isUnlocked } from '../../game/achievements'
import { useGame } from '../../game/game-context'
import { PixelMark } from '../ui/PixelMark'
import { LockIcon } from './GameIcons'

/** Vitrine des succès (pied de page) : débloqués en bleu, les autres en attente. */
export function AchievementsPanel() {
  const game = useGame()
  const { t } = useTranslation()
  if (!game) return null

  return (
    <section id="achievements" aria-labelledby="achievements-title" className="border-b border-line py-12 sm:py-16">
      <div data-reveal className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="achievements-title"
            className="text-[clamp(1.4rem,2.6vw,1.9rem)] font-semibold leading-[1.1] tracking-[-0.03em]"
          >
            {t('game.title')}
          </h2>
          <p className="mt-2 max-w-xl text-muted">{t('game.lead')}</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="hud-chip font-display text-[1.05rem] font-semibold text-ink">
            {t('game.progress', { count: game.count, total: game.total })}
          </p>
          {game.count > 0 && (
            <button
              type="button"
              onClick={game.reset}
              className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              {t('game.reset')}
            </button>
          )}
        </div>
      </div>

      <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {achievementIds.map((id, i) => {
          const done = isUnlocked(game.state, id)
          const secret = hiddenAchievements.has(id) && !done
          return (
            <li
              key={id}
              data-reveal
              style={{ '--i': i } as CSSProperties}
              className={`flex h-full flex-col gap-3 rounded-2xl border p-4 transition-colors duration-300 ${
                done ? 'border-blue bg-blue-tint' : 'border-dashed border-line-strong bg-bg'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <PixelMark
                  seed={`achievement-${id}`}
                  animate={done}
                  className={`size-9 ${done ? 'text-blue' : 'text-line-strong'}`}
                />
                {!done && (
                  <span className="inline-flex items-center gap-1.5 text-[0.78rem] font-medium text-muted">
                    <LockIcon className="size-3.5" />
                    {t('game.locked')}
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-sans text-[0.98rem] font-semibold leading-snug text-ink">
                  {secret ? '???' : t(`game.items.${id}.title`)}
                </h3>
                <p className="mt-1 text-[0.86rem] leading-snug text-muted">
                  {secret ? t('game.hiddenText') : t(`game.items.${id}.text`)}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

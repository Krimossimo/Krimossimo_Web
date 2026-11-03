import { useTranslation } from 'react-i18next'
import type { Game } from '../../types/content'
import { formatMoney, pick, useLocale } from '../../hooks/useLocale'
import { DemoBadge } from '../ui/ContentStates'
import { CoverImage } from '../ui/CoverImage'
import { ArrowUpRightIcon, DownloadIcon } from '../ui/Icons'

/**
 * Carte de jeu : couverture, titre, description, tag Gratuit / prix / Payant,
 * et lien vers le téléchargement ou la boutique officielle.
 */
export function GameCard({ game }: { game: Game }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const title = pick(game.title, locale)

  const priceLabel =
    game.pricing.type === 'free'
      ? t('common.free')
      : game.pricing.price
        ? formatMoney(game.pricing.price, locale)
        : t('games.paid')
  const linkLabel =
    game.link.kind === 'download'
      ? t('games.download')
      : game.link.storeName
        ? t('games.storeNamed', { store: game.link.storeName })
        : t('games.store')

  return (
    <article className="card-lift group flex h-full flex-col rounded-[1.5rem] border border-line bg-raised p-3">
      <div className="relative">
        <CoverImage
          src={game.cover.src}
          alt={pick(game.cover.alt, locale)}
          seed={game.id}
          className="aspect-[16/10] rounded-[1.1rem]"
        />
        <span
          className={`absolute left-3 top-3 rounded-full px-3 py-1 text-sm font-semibold ${
            game.pricing.type === 'free' ? 'bg-blue text-on-blue' : 'bg-bg text-ink'
          }`}
        >
          {priceLabel}
        </span>
        {game.isDemo && <DemoBadge className="absolute right-3 top-3" />}
      </div>
      <div className="flex flex-1 flex-col px-2 pb-2 pt-5">
        <h2 className="text-[1.25rem] font-semibold tracking-[-0.025em]">{title}</h2>
        <p className="mt-2 line-clamp-3 text-[0.97rem] text-muted">{pick(game.description, locale)}</p>
        <div className="mt-auto pt-5">
          <a
            href={game.link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-bg px-5 font-medium text-ink transition-colors duration-150 hover:border-blue hover:text-blue"
          >
            {game.link.kind === 'download' ? (
              <DownloadIcon className="size-[18px]" />
            ) : (
              <ArrowUpRightIcon className="size-[18px]" />
            )}
            {linkLabel}
            <span className="sr-only">
              {title} {t('a11y.external')}
            </span>
          </a>
        </div>
      </div>
    </article>
  )
}

import { useTranslation } from 'react-i18next'
import type { Video } from '../../types/content'
import { formatDate, useLocale } from '../../hooks/useLocale'
import { CoverImage } from '../ui/CoverImage'
import { PlayIcon } from '../ui/Icons'

/** Carte vidéo : miniature, titre, date et bouton qui ouvre la vidéo sur YouTube. */
export function VideoCard({ video, headingLevel = 'h2' }: { video: Video; headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel
  const { t } = useTranslation()
  const locale = useLocale()
  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(video.youtubeId)}`
  const thumbnail = video.thumbnail ?? `https://i.ytimg.com/vi/${encodeURIComponent(video.youtubeId)}/hqdefault.jpg`
  const date = formatDate(video.publishedAt, locale)

  return (
    <article className="card-lift group flex h-full flex-col rounded-[1.5rem] border border-line bg-raised p-3">
      <div className="relative">
        <CoverImage src={thumbnail} alt="" seed={video.youtubeId} className="aspect-video rounded-[1.1rem]" />
        <span
          aria-hidden="true"
          className="absolute bottom-3 left-3 inline-flex size-11 items-center justify-center rounded-full bg-bg text-ink transition-colors duration-150 group-hover:bg-blue group-hover:text-on-blue"
        >
          <PlayIcon className="size-[18px] translate-x-px" />
        </span>
      </div>
      <div className="flex flex-1 flex-col px-2 pb-2 pt-5">
        {date && (
          <p className="text-sm text-muted">
            <time dateTime={video.publishedAt}>{date}</time>
          </p>
        )}
        <Heading className="mt-1.5 line-clamp-2 text-[1.15rem] font-semibold leading-snug tracking-[-0.02em]">{video.title}</Heading>
        <div className="mt-auto pt-5">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full min-h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-bg px-5 font-medium text-ink transition-colors duration-150 hover:border-blue hover:text-blue"
          >
            <PlayIcon className="size-4" />
            {t('activities.watch')}
            <span className="sr-only">
              : {video.title} {t('a11y.external')}
            </span>
          </a>
        </div>
      </div>
    </article>
  )
}

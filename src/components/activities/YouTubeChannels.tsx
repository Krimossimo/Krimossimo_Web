import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { youtubeChannels } from '../../config/site'
import { formatDate, useLocale } from '../../hooks/useLocale'
import { YouTubeError, loadYouTubeFeed, type ChannelVideos, type YouTubeErrorCode, type YouTubeFeed } from '../../lib/youtube'
import { ContentLoading } from '../ui/ContentStates'
import { AlertIcon, ArrowUpRightIcon, InfoIcon, SocialIcon } from '../ui/Icons'
import { VideoCard } from './VideoCard'
import { buttonClass } from '../ui/buttonStyles'

type State = { status: 'loading' } | { status: 'ready'; feed: YouTubeFeed } | { status: 'error'; code: YouTubeErrorCode }

/** Dernières vidéos publiques des trois chaînes YouTube, une section par chaîne. */
export function YouTubeChannels() {
  const { t } = useTranslation()
  const locale = useLocale()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    loadYouTubeFeed(youtubeChannels, { force: attempt > 0 }).then(
      (feed) => active && setState({ status: 'ready', feed }),
      (error: unknown) => active && setState({ status: 'error', code: error instanceof YouTubeError ? error.code : 'network' }),
    )
    return () => {
      active = false
    }
  }, [attempt])
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  if (state.status === 'loading') return <ContentLoading className="mt-12" />

  if (state.status === 'error') {
    return (
      <div role="alert" className="mt-12 rounded-[1.5rem] border border-line-strong bg-surface p-7 sm:p-9" data-testid="youtube-error">
        <p className="flex items-center gap-2 text-[1.25rem] font-semibold tracking-[-0.02em]">
          <AlertIcon className="size-6 shrink-0 text-danger" />
          {t('activities.errorTitle')}
        </p>
        <p className="mt-2 max-w-xl text-muted">{t(`activities.errors.${state.code}`)}</p>
        <button
          type="button"
          onClick={retry}
          className={buttonClass('secondary', 'mt-5')}
        >
          {t('content.retry')}
        </button>
      </div>
    )
  }

  const { feed } = state
  return (
    <div className="mt-12 space-y-16">
      {feed.stale && (
        <p className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-[0.95rem] text-ink-soft" data-testid="youtube-stale">
          <InfoIcon className="mt-0.5 size-[18px] shrink-0 text-blue" />
          {t('activities.stale', { date: formatDate(new Date(feed.fetchedAt).toISOString(), locale) })}
        </p>
      )}
      {youtubeChannels.map((channel) => {
        const result = feed.channels.find((c) => c.key === channel.key)
        return result ? <ChannelSection key={channel.key} channel={channel} result={result} /> : null
      })}
    </div>
  )
}

function ChannelSection({ channel, result }: { channel: (typeof youtubeChannels)[number]; result: ChannelVideos }) {
  const { t } = useTranslation()
  const titleId = `channel-${channel.key}`
  return (
    <section aria-labelledby={titleId} data-channel={channel.key}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id={titleId} className="flex items-center gap-2.5 text-[1.5rem] font-semibold tracking-[-0.02em]">
            <SocialIcon id="youtube" className="size-6 text-blue" />
            {t(`activities.channels.${channel.key}`)}
          </h2>
          <p className="mt-1 text-sm text-muted">{channel.handle}</p>
        </div>
        <a
          href={channel.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-xl font-medium text-blue underline-offset-4 hover:underline sm:self-auto"
        >
          {t('activities.viewChannel')}
          <ArrowUpRightIcon className="size-4" />
          <span className="sr-only">
            : {t(`activities.channels.${channel.key}`)} {t('a11y.external')}
          </span>
        </a>
      </div>

      {result.status === 'error' ? (
        <p role="alert" className="mt-6 flex items-start gap-2.5 rounded-xl bg-danger-tint px-4 py-3 text-[0.95rem] text-danger">
          <AlertIcon className="mt-0.5 size-[18px] shrink-0" />
          {t(`activities.errors.${result.code}`)}
        </p>
      ) : result.videos.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line-strong px-4 py-5 text-ink-soft">{t('activities.channelEmpty')}</p>
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {result.videos.map((video, i) => (
            <li key={video.youtubeId} data-reveal style={{ '--i': i } as CSSProperties}>
              <VideoCard video={video} headingLevel="h3" />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

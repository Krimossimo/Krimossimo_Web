import { useTranslation } from 'react-i18next'
import { contentService } from '../content'
import { socials } from '../config/site'
import { VideoCard } from '../components/activities/VideoCard'
import { YouTubeChannels } from '../components/activities/YouTubeChannels'
import { ContentError, ContentLoading } from '../components/ui/ContentStates'
import { EmptyState } from '../components/ui/EmptyState'
import { SocialIcon } from '../components/ui/Icons'
import { PageHeader, PageSection } from '../components/ui/PageHeader'
import { useContent } from '../hooks/useContent'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { isYouTubeConfigured } from '../lib/youtube'
import type { Video } from '../types/content'

// Avec l'API YouTube, la liste manuelle n'est pas chargée.
const noVideos = (): Promise<Video[]> => Promise.resolve([])

export default function ActivitiesPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('activities.title'))

  const state = useContent(isYouTubeConfigured ? noVideos : contentService.videos)
  const youtube = socials.find((s) => s.id === 'youtube')
  const twitch = socials.find((s) => s.id === 'twitch')

  const channelLinks = (
    <>
      {youtube && (
        <a
          href={youtube.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-blue px-5 font-medium text-on-blue transition-colors hover:bg-blue-hover"
        >
          <SocialIcon id="youtube" className="size-[18px]" />
          {t('activities.youtube')}
          <span className="sr-only">{t('a11y.external')}</span>
        </a>
      )}
      {twitch && (
        <a
          href={twitch.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong bg-raised px-5 font-medium text-ink transition-colors hover:border-ink"
        >
          <SocialIcon id="twitch" className="size-[18px]" />
          {t('activities.twitch')}
          <span className="sr-only">{t('a11y.external')}</span>
        </a>
      )}
    </>
  )

  // Clé YouTube configurée : dernières vidéos des trois chaînes, lues sur l'API YouTube.
  if (isYouTubeConfigured) {
    return (
      <PageSection>
        <PageHeader title={t('activities.title')} lead={t('activities.lead')} />
        <YouTubeChannels />
        <div className="mt-14 flex flex-col gap-3 sm:flex-row">{channelLinks}</div>
      </PageSection>
    )
  }

  // Sans clé : vidéos saisies manuellement (src/data/videos.ts ou Firestore), comportement d'origine.
  return (
    <PageSection>
      <PageHeader title={t('activities.title')} lead={t('activities.lead')} />

      {state.status === 'loading' && <ContentLoading className="mt-12" />}
      {state.status === 'error' && (
        <div className="mt-12 space-y-6">
          <ContentError onRetry={state.retry} />
          <div className="flex flex-col gap-3 sm:flex-row">{channelLinks}</div>
        </div>
      )}
      {state.status === 'ready' &&
        (state.data.length === 0 ? (
          <div className="mt-12 space-y-6">
            <EmptyState seed="activities-empty" title={t('activities.emptyTitle')} text={t('activities.emptyText')} />
            <div className="flex flex-col gap-3 sm:flex-row">{channelLinks}</div>
          </div>
        ) : (
          <>
            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {state.data.map((video) => (
                <li key={video.youtubeId}>
                  <VideoCard video={video} />
                </li>
              ))}
            </ul>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">{channelLinks}</div>
          </>
        ))}
    </PageSection>
  )
}

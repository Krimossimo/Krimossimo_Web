import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { containsDemo, contentService } from '../content'
import { GameCard } from '../components/games/GameCard'
import { ButtonLink } from '../components/ui/ButtonLink'
import { ContentError, ContentLoading, DemoNotice } from '../components/ui/ContentStates'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader, PageSection } from '../components/ui/PageHeader'
import { useContent } from '../hooks/useContent'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function GamesPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('games.title'))
  const state = useContent(contentService.games)

  return (
    <PageSection>
      <PageHeader title={t('games.title')} lead={t('games.lead')} />

      {state.status === 'loading' && <ContentLoading className="mt-12" />}
      {state.status === 'error' && (
        <div className="mt-12">
          <ContentError onRetry={state.retry} />
        </div>
      )}
      {state.status === 'ready' &&
        (state.data.length === 0 ? (
          <div className="mt-12">
            <EmptyState
              seed="games-empty"
              title={t('games.emptyTitle')}
              text={t('games.emptyText')}
              actions={
                <ButtonLink to="/activities" variant="secondary">
                  {t('games.emptyAction')}
                </ButtonLink>
              }
            />
          </div>
        ) : (
          <>
            {containsDemo(state.data) && (
              <div className="mt-10">
                <DemoNotice />
              </div>
            )}
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {state.data.map((game, i) => (
                <li key={game.id} data-reveal style={{ '--i': i } as CSSProperties}>
                  <GameCard game={game} />
                </li>
              ))}
            </ul>
          </>
        ))}
    </PageSection>
  )
}

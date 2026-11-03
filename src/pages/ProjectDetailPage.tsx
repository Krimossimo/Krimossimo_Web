import { useCallback } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { contentService } from '../content'
import type { Project } from '../types/content'
import { ButtonLink } from '../components/ui/ButtonLink'
import { ContentError, DemoNotice } from '../components/ui/ContentStates'
import { CoverImage } from '../components/ui/CoverImage'
import { EmptyState } from '../components/ui/EmptyState'
import { PageSection } from '../components/ui/PageHeader'
import { ArrowLeftIcon, ArrowUpRightIcon } from '../components/ui/Icons'
import { useContent, useDelayedFlag } from '../hooks/useContent'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { pick, useLocale, yearOf } from '../hooks/useLocale'

export default function ProjectDetailPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { id = '' } = useParams()
  const load = useCallback((fresh: boolean) => contentService.project(id, fresh), [id])
  const state = useContent(load)

  const project = state.status === 'ready' ? state.data : null
  useDocumentTitle(
    state.status === 'loading'
      ? undefined
      : project
        ? pick(project.title, locale)
        : state.status === 'error'
          ? t('content.errorTitle')
          : t('projectDetail.notFoundTitle'),
  )

  const backLink = (
    <Link
      to="/projects"
      className="inline-flex h-11 items-center gap-2 rounded-xl text-[0.95rem] font-medium text-muted transition-colors hover:text-ink"
    >
      <ArrowLeftIcon className="size-[18px]" />
      {t('projectDetail.back')}
    </Link>
  )

  return (
    <PageSection>
      {backLink}
      {state.status === 'loading' && <DetailLoading />}
      {state.status === 'error' && (
        <>
          <h1 id="page-title" className="sr-only">
            {t('content.errorTitle')}
          </h1>
          <div className="mt-6">
            <ContentError onRetry={state.retry} />
          </div>
        </>
      )}
      {state.status === 'ready' && !project && (
        <>
          <h1 id="page-title" className="sr-only">
            {t('projectDetail.notFoundTitle')}
          </h1>
          <div className="mt-6">
            <EmptyState
              seed={`missing-${id}`}
              title={t('projectDetail.notFoundTitle')}
              text={t('projectDetail.notFoundText')}
              actions={<ButtonLink to="/projects">{t('projectDetail.back')}</ButtonLink>}
            />
          </div>
        </>
      )}
      {project && <ProjectDetail project={project} />}
    </PageSection>
  )
}

function DetailLoading() {
  const { t } = useTranslation()
  const visible = useDelayedFlag(true)
  return (
    <div role="status" className="mt-6">
      <span className="sr-only">{t('content.loading')}</span>
      {visible && (
        <div aria-hidden="true">
          <div className="h-14 w-2/3 rounded-2xl bg-surface sm:w-1/2" />
          <div className="mt-5 h-4 w-full max-w-xl rounded-full bg-surface" />
          <div className="mt-10 aspect-[16/10] rounded-[1.5rem] bg-surface" />
        </div>
      )}
    </div>
  )
}

function ProjectDetail({ project }: { project: Project }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const paragraphs = pick(project.description, locale).split(/\n\s*\n/)
  const facts = [
    { label: t('projectDetail.category'), value: t(`categories.${project.category}`) },
    { label: t('projectDetail.year'), value: yearOf(project.createdAt) },
  ]
  if (project.progress) facts.push({ label: t('projectDetail.status'), value: t(`projectStatus.${project.progress}`) })

  return (
    <>
      {project.isDemo && (
        <div className="mt-6">
          <DemoNotice />
        </div>
      )}

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
        <div>
          <h1
            id="page-title"
            className="text-[clamp(2.2rem,5.5vw,3.8rem)] font-semibold leading-[1.05] tracking-[-0.045em]"
          >
            {pick(project.title, locale)}
          </h1>
          {project.summary && (
            <p className="mt-4 max-w-2xl text-[1.15rem] text-ink-soft">{pick(project.summary, locale)}</p>
          )}
        </div>

        <dl
          className={`grid gap-4 self-end rounded-[1.25rem] border border-line p-5 lg:grid-cols-1 lg:gap-3 ${
            facts.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
          }`}
        >
          {facts.map((fact) => (
            <div key={fact.label} className="lg:flex lg:items-baseline lg:justify-between lg:gap-4">
              <dt className="text-sm text-muted">{fact.label}</dt>
              <dd className="mt-1 font-medium text-ink lg:mt-0">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <CoverImage
        src={project.cover?.src}
        alt={project.cover ? pick(project.cover.alt, locale) : ''}
        seed={project.id}
        className="mt-10 aspect-[16/10] rounded-[1.5rem]"
        markClassName="size-32 sm:size-44"
      />

      <div className="mt-12 grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
        <div className="max-w-[40rem] space-y-5 text-[1.08rem] leading-relaxed text-ink-soft">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>

        <aside className="space-y-8">
          {project.stack && project.stack.length > 0 && (
            <div>
              <h2 className="font-sans text-[0.95rem] font-semibold text-ink">{t('projectDetail.stack')}</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {project.stack.map((tech) => (
                  <li key={tech} className="rounded-lg border border-line px-2.5 py-1 text-sm font-medium text-ink-soft">
                    {tech}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {project.externalUrl && (
            <a
              href={project.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue px-5 font-medium text-on-blue transition-colors duration-150 hover:bg-blue-hover"
            >
              {t('projectDetail.visit')}
              <ArrowUpRightIcon className="size-4" />
              <span className="sr-only">{t('a11y.external')}</span>
            </a>
          )}
        </aside>
      </div>
    </>
  )
}

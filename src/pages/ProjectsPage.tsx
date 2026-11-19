import type { CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  containsDemo,
  contentService,
  countProjectsByCategory,
  filterProjects,
  isProjectFilter,
  splitProjectsByKind,
  type ProjectFilter,
} from '../content'
import { projectCategories, type Project } from '../types/content'
import { ProjectCard } from '../components/projects/ProjectCard'
import { ProjectRow } from '../components/projects/ProjectRow'
import { ContentError, ContentLoading, DemoNotice } from '../components/ui/ContentStates'
import { EmptyState } from '../components/ui/EmptyState'
import { buttonClass } from '../components/ui/buttonStyles'
import { PageHeader, PageSection } from '../components/ui/PageHeader'
import { useContent } from '../hooks/useContent'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function ProjectsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('projectsPage.title'))
  const state = useContent(contentService.projects)

  return (
    <PageSection>
      <PageHeader title={t('projectsPage.title')} lead={t('projectsPage.lead')} />
      {state.status === 'loading' && <ContentLoading className="mt-12" />}
      {state.status === 'error' && (
        <div className="mt-12">
          <ContentError onRetry={state.retry} />
        </div>
      )}
      {state.status === 'ready' && <ProjectGallery projects={state.data} />}
    </PageSection>
  )
}

function ProjectGallery({ projects }: { projects: Project[] }) {
  const { t } = useTranslation()

  // Le filtre actif vit dans l'URL (?category=website) : lien partageable, bouton Précédent fonctionnel.
  const [params, setParams] = useSearchParams()
  const raw = params.get('category')
  const active: ProjectFilter = isProjectFilter(raw) ? raw : 'all'
  const setFilter = (filter: ProjectFilter) =>
    setParams(filter === 'all' ? {} : { category: filter }, { replace: true, preventScrollReset: true })

  if (projects.length === 0) {
    return (
      <div className="mt-12">
        <EmptyState seed="projects-empty" title={t('projectsPage.emptyAllTitle')} text={t('projectsPage.emptyAllText')} />
      </div>
    )
  }

  const visible = filterProjects(projects, active)
  const { personal, client } = splitProjectsByKind(visible)
  const counts = countProjectsByCategory(projects)
  const filters: ProjectFilter[] = ['all', ...projectCategories]

  return (
    <>
      {containsDemo(projects) && (
        <div className="mt-10">
          <DemoNotice />
        </div>
      )}

      <div className="mt-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label={t('projectsPage.filterLabel')}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
        >
          {filters.map((filter) => {
            const selected = filter === active
            return (
              <button
                key={filter}
                type="button"
                aria-pressed={selected}
                onClick={() => setFilter(filter)}
                className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-[0.95rem] font-medium transition-colors duration-150 ${
                  selected
                    ? 'border-blue bg-blue-tint text-ink'
                    : 'border-line-strong text-muted hover:border-ink hover:text-ink'
                }`}
              >
                {filter === 'all' ? t('projectsPage.all') : t(`categories.${filter}`)}
                <span aria-hidden="true" className={`text-sm tabular-nums ${selected ? 'text-blue' : 'text-muted'}`}>
                  {counts[filter]}
                </span>
              </button>
            )
          })}
        </div>
        <p aria-live="polite" className="text-sm text-muted">
          {t('projectsPage.count', { count: visible.length })}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            seed={`projects-${active}`}
            title={t('projectsPage.emptyFilteredTitle')}
            text={t('projectsPage.emptyFilteredText')}
            actions={
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={buttonClass('secondary')}
              >
                {t('projectsPage.showAll')}
              </button>
            }
          />
        </div>
      ) : (
        <>
          {personal.length > 0 && <PersonalProjects projects={personal} />}
          {client.length > 0 && <ClientProjects projects={client} separated={personal.length > 0} />}
        </>
      )}
    </>
  )
}

/** Projets perso : mis en avant (grande carte pour le premier, puis grandes cartes sur deux colonnes). */
function PersonalProjects({ projects }: { projects: Project[] }) {
  const { t } = useTranslation()
  const [first, ...others] = projects
  return (
    <section aria-labelledby="personal-projects-title" className="mt-12">
      <div data-reveal>
        <h2 id="personal-projects-title" className="text-[clamp(1.6rem,3vw,2.2rem)] font-semibold tracking-[-0.035em]">
          {t('projectsPage.personalTitle')}
        </h2>
        <p className="mt-2 max-w-2xl text-muted">{t('projectsPage.personalLead')}</p>
      </div>
      <div data-reveal className="mt-8">
        <ProjectCard project={first} variant="wide" showCta headingLevel="h3" />
      </div>
      {others.length > 0 && (
        <ul className="mt-6 grid gap-6 md:grid-cols-2">
          {others.map((project, i) => (
            <li key={project.id} data-reveal style={{ '--i': i } as CSSProperties}>
              <ProjectCard project={project} showCta headingLevel="h3" />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Projets réalisés pour des tiers : liste compacte, plus discrète. */
function ClientProjects({ projects, separated }: { projects: Project[]; separated: boolean }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="client-projects-title" className={separated ? 'mt-20 border-t border-line pt-12' : 'mt-12'}>
      <div data-reveal className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="client-projects-title" className="font-sans text-[1.3rem] font-semibold tracking-[-0.02em]">
            {t('projectsPage.clientTitle')}
          </h2>
          <p className="mt-1.5 max-w-2xl text-[0.98rem] text-muted">{t('projectsPage.clientLead')}</p>
        </div>
        <p className="text-sm text-muted">{t('projectsPage.count', { count: projects.length })}</p>
      </div>
      <ul className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {projects.map((project, i) => (
          <li key={project.id} data-reveal="fade" style={{ '--i': i } as CSSProperties} className="min-w-0">
            <ProjectRow project={project} />
          </li>
        ))}
      </ul>
    </section>
  )
}

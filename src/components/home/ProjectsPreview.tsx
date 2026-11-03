import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { contentService, selectFeaturedProjects } from '../../content'
import { useContent } from '../../hooks/useContent'
import { ContentError, ContentLoading } from '../ui/ContentStates'
import { ProjectCard } from '../projects/ProjectCard'

/**
 * Aperçu des projets sur l'accueil.
 * La mise en page suit le nombre réel de projets : aucun (section masquée),
 * un seul (grande carte horizontale), ou plusieurs (grille asymétrique).
 */
export function ProjectsPreview() {
  const { t } = useTranslation()
  const state = useContent(contentService.projects)

  if (state.status === 'ready' && state.data.length === 0) return null

  const selection = state.status === 'ready' ? selectFeaturedProjects(state.data, 3) : []
  const [first, ...others] = selection

  return (
    <section aria-labelledby="projects-title" className="mx-auto mt-24 max-w-[76rem] px-4 sm:mt-32 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="projects-title"
            className="text-[clamp(1.8rem,3.6vw,2.6rem)] font-semibold leading-[1.08] tracking-[-0.035em]"
          >
            {t('projects.title')}
          </h2>
          <p className="mt-3 max-w-lg text-muted">{t('projects.lead')}</p>
        </div>
        <Link
          to="/projects"
          className="inline-flex h-11 items-center self-start rounded-xl border border-line-strong px-4 text-[0.95rem] font-medium text-ink transition-colors hover:border-ink sm:self-auto"
        >
          {t('projects.all')}
        </Link>
      </div>

      {state.status === 'loading' && <ContentLoading className="mt-10" />}
      {state.status === 'error' && (
        <div className="mt-10">
          <ContentError onRetry={state.retry} />
        </div>
      )}
      {first && others.length === 0 && (
        <div className="mt-10">
          <ProjectCard project={first} variant="wide" />
        </div>
      )}
      {first && others.length > 0 && (
        <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2">
          <li className="md:col-span-2 lg:col-span-2 lg:row-span-2">
            <ProjectCard project={first} variant="featured" />
          </li>
          {others.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

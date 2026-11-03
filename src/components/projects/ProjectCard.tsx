import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Project } from '../../types/content'
import { firstParagraph, pick, useLocale, yearOf } from '../../hooks/useLocale'
import { DemoBadge } from '../ui/ContentStates'
import { CoverImage } from '../ui/CoverImage'
import { ArrowUpRightIcon } from '../ui/Icons'

type Variant = 'default' | 'featured' | 'wide'

type Props = {
  project: Project
  variant?: Variant
  /** Affiche « Voir le projet » en bas de carte. */
  showCta?: boolean
  headingLevel?: 'h2' | 'h3'
}

/**
 * Carte projet : couverture (ou pixel-mark), catégorie, année, avancement, titre,
 * résumé, technologies. Toute la carte mène à la page de détail /projects/<id>.
 */
export function ProjectCard({ project, variant = 'default', showCta = false, headingLevel = 'h3' }: Props) {
  const { t } = useTranslation()
  const locale = useLocale()
  const Heading = headingLevel
  const featured = variant === 'featured'
  const wide = variant === 'wide'
  const large = featured || wide

  const summary = project.summary ? pick(project.summary, locale) : firstParagraph(pick(project.description, locale))
  const visualClass = featured ? 'aspect-[16/10] lg:aspect-auto lg:flex-1 lg:min-h-[18rem]' : 'aspect-[16/10]'
  const meta = [t(`categories.${project.category}`), yearOf(project.createdAt)]
  if (project.progress) meta.push(t(`projectStatus.${project.progress}`))

  return (
    <Link
      to={`/projects/${project.id}`}
      className={`card-lift group flex h-full rounded-[1.5rem] border border-line bg-raised p-3 ${
        wide ? 'flex-col lg:grid lg:grid-cols-[1.35fr_1fr] lg:items-center lg:gap-4 lg:p-4' : 'flex-col'
      } ${featured ? 'lg:p-4' : ''}`}
    >
      <div className={`relative ${featured ? 'flex flex-col lg:flex-1' : ''}`}>
        <CoverImage
          src={project.cover?.src}
          alt={project.cover ? pick(project.cover.alt, locale) : ''}
          seed={project.id}
          className={`rounded-[1.1rem] ${visualClass}`}
          markClassName={large ? 'size-28 sm:size-36' : 'size-20'}
        />
        {featured && project.featured && (
          <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-bg px-3 py-1 text-sm font-medium text-ink">
            <span aria-hidden="true" className="size-1.5 rounded-[2px] bg-blue" />
            {t('projects.featured')}
          </span>
        )}
        {project.isDemo && <DemoBadge className="absolute right-3 top-3" />}
      </div>

      <div className={`flex flex-col px-2 pb-2 pt-5 ${featured ? '' : 'flex-1'} ${wide ? 'lg:py-4 lg:pr-4' : ''}`}>
        {wide && project.featured && (
          <span className="mb-4 inline-flex items-center gap-2 self-start rounded-full bg-blue-tint px-3 py-1 text-sm font-medium text-ink">
            <span aria-hidden="true" className="size-1.5 rounded-[2px] bg-blue" />
            {t('projects.featured')}
          </span>
        )}
        <p className="flex flex-wrap gap-x-3 text-sm text-muted">
          {meta.map((item, index) => (
            <span key={item} className="contents">
              {index > 0 && (
                <span aria-hidden="true" className="text-line-strong">
                  /
                </span>
              )}
              <span>{item}</span>
            </span>
          ))}
        </p>
        <Heading
          className={`mt-2 font-display font-semibold tracking-[-0.025em] text-ink transition-colors group-hover:text-blue ${
            large ? 'text-[1.6rem] sm:text-[1.9rem]' : 'text-[1.25rem]'
          }`}
        >
          {pick(project.title, locale)}
        </Heading>
        <p className={`mt-2 text-muted ${large ? 'max-w-xl text-[1.02rem]' : 'line-clamp-3 text-[0.97rem]'}`}>{summary}</p>
        {project.stack && project.stack.length > 0 && (
          <ul className={`flex flex-wrap gap-2 pt-5 ${wide ? '' : 'mt-auto'}`}>
            {project.stack.map((tech) => (
              <li key={tech} className="rounded-lg border border-line px-2.5 py-1 text-[0.8rem] font-medium text-ink-soft">
                {tech}
              </li>
            ))}
          </ul>
        )}
        {showCta && (
          <span
            className={`inline-flex items-center gap-1.5 pt-5 text-[0.95rem] font-medium text-blue ${
              project.stack?.length ? '' : 'mt-auto'
            }`}
          >
            {t('projectsPage.viewDetails')}
            <ArrowUpRightIcon className="size-4 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </Link>
  )
}

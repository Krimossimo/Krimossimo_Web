import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Project } from '../../types/content'
import { pick, useLocale, yearOf } from '../../hooks/useLocale'
import { DemoBadge } from '../ui/ContentStates'
import { CoverImage } from '../ui/CoverImage'
import { ArrowUpRightIcon } from '../ui/Icons'

/**
 * Ligne compacte pour un projet réalisé pour un tiers : petite vignette, titre, pour qui,
 * catégorie et année. Plus sobre que la carte des projets perso, mais mène à la même page de détail.
 */
export function ProjectRow({ project }: { project: Project }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const meta = [project.clientName, t(`categories.${project.category}`), yearOf(project.createdAt)].filter(Boolean)

  return (
    <Link
      to={`/projects/${project.id}`}
      className="card-lift group flex h-full items-center gap-4 rounded-2xl border border-line bg-raised p-2.5 pr-4"
    >
      <CoverImage
        src={project.cover?.src}
        alt={project.cover ? pick(project.cover.alt, locale) : ''}
        seed={project.id}
        className="aspect-[4/3] w-24 shrink-0 rounded-xl sm:w-28"
        markClassName="size-10"
      />
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 font-sans text-[1.02rem] font-semibold leading-snug text-ink transition-colors group-hover:text-blue">
          {pick(project.title, locale)}
        </h3>
        <p className="mt-1 flex flex-wrap gap-x-2 text-sm text-muted">
          {meta.map((item, index) => (
            <span key={`${item}-${index}`} className="contents">
              {index > 0 && (
                <span aria-hidden="true" className="text-line-strong">
                  /
                </span>
              )}
              <span>{item}</span>
            </span>
          ))}
        </p>
      </div>
      {project.isDemo && (
        <span className="hidden shrink-0 sm:block">
          <DemoBadge />
        </span>
      )}
      <ArrowUpRightIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted transition-[color,transform] duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-blue"
      />
    </Link>
  )
}

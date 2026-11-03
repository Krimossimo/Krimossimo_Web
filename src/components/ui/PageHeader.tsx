import type { ReactNode } from 'react'

type Props = {
  title: string
  lead?: string
  /** Contenu affiché à droite du titre sur grand écran (ex. compteur, actions). */
  aside?: ReactNode
  id?: string
}

/** En-tête commun des pages intérieures : grand titre Unbounded + introduction. */
export function PageHeader({ title, lead, aside, id = 'page-title' }: Props) {
  return (
    <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        <h1 id={id} className="text-[clamp(2.3rem,6vw,4.2rem)] font-semibold leading-[1.04] tracking-[-0.045em]">
          {title}
        </h1>
        {lead && <p className="mt-5 max-w-2xl text-[1.1rem] leading-relaxed text-ink-soft">{lead}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  )
}

/** Conteneur standard d'une page intérieure. */
export function PageSection({ children, labelledBy = 'page-title' }: { children: ReactNode; labelledBy?: string }) {
  return (
    <section aria-labelledby={labelledBy} className="mx-auto max-w-[76rem] px-4 pt-12 sm:px-6 sm:pt-20 lg:px-8">
      {children}
    </section>
  )
}

import { useTranslation } from 'react-i18next'
import { ButtonLink } from '../components/ui/ButtonLink'
import { PageSection } from '../components/ui/PageHeader'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { assetUrl } from '../hooks/useLocale'

const roles = ['content', 'websites', 'apps', 'uiux', 'streaming', 'ai'] as const

export default function AboutPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('about.title'))

  return (
    <PageSection>
      {/* Présentation */}
      <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr] lg:items-center">
        <div>
          <h1
            id="page-title"
            className="text-[clamp(2.3rem,6vw,4.2rem)] font-semibold leading-[1.04] tracking-[-0.045em]"
          >
            {t('about.title')}
          </h1>
          <p className="mt-7 max-w-[38rem] text-[clamp(1.15rem,1.9vw,1.4rem)] leading-relaxed text-ink-soft">
            {t('about.intro')}
          </p>
        </div>

        <figure className="flex items-center gap-5 rounded-[1.75rem] border border-line bg-raised p-6 shadow-lift sm:p-7">
          <img
            src={assetUrl('images/krimossimo-logo-256.webp')}
            width={256}
            height={256}
            alt=""
            className="size-20 shrink-0 rounded-[1.1rem] dark:ring-1 dark:ring-line-strong sm:size-24"
          />
          <figcaption>
            <p className="font-display text-[1.6rem] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[1.9rem]">
              {t('about.name')}
            </p>
            <p className="mt-1 text-muted">{t('about.alias')}</p>
          </figcaption>
        </figure>
      </div>

      {/* Ce que je fais */}
      <section aria-labelledby="roles-title" className="mt-20 sm:mt-28">
        <h2 id="roles-title" className="text-[clamp(1.6rem,3.2vw,2.3rem)] font-semibold tracking-[-0.035em]">
          {t('about.rolesTitle')}
        </h2>
        <ul className="mt-8 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <li key={role} className="border-t border-line py-6">
              <h3 className="flex items-center gap-3 text-[1.15rem] font-semibold tracking-[-0.02em]">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-[2px] bg-blue" />
                {t(`about.roles.${role}.title`)}
              </h3>
              <p className="mt-2 max-w-sm text-muted">{t(`about.roles.${role}.text`)}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Suite du parcours */}
      <section
        aria-labelledby="next-title"
        className="mt-16 flex flex-col gap-5 rounded-[1.5rem] bg-surface p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9"
      >
        <h2 id="next-title" className="text-[1.4rem] font-semibold tracking-[-0.025em]">
          {t('about.nextTitle')}
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/projects">{t('about.nextProjects')}</ButtonLink>
          <ButtonLink to="/shop" variant="secondary">
            {t('about.nextShop')}
          </ButtonLink>
        </div>
      </section>
    </PageSection>
  )
}

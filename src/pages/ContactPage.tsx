import { useTranslation } from 'react-i18next'
import { socials } from '../config/site'
import { ContactForm } from '../components/contact/ContactForm'
import { ArrowUpRightIcon, SocialIcon } from '../components/ui/Icons'
import { PageHeader, PageSection } from '../components/ui/PageHeader'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function ContactPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('contact.title'))

  return (
    <PageSection>
      <PageHeader title={t('contact.title')} lead={t('contact.lead')} />

      <div className="mt-12 grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-14">
        <div className="rounded-[1.75rem] border border-line bg-raised p-5 shadow-lift sm:p-8">
          <ContactForm />
        </div>

        <aside aria-labelledby="elsewhere-title">
          <h2 id="elsewhere-title" className="font-sans text-[0.95rem] font-semibold text-ink">
            {t('contact.elsewhere')}
          </h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {socials.map((s) => (
              <li key={s.id}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-h-14 items-center gap-3 py-3 text-ink-soft transition-colors hover:text-ink"
                >
                  <SocialIcon id={s.icon} className="size-5 text-muted transition-colors group-hover:text-blue" />
                  <span className="flex-1 font-medium">{s.label}</span>
                  <ArrowUpRightIcon className="size-4 text-muted transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  <span className="sr-only">{t('a11y.external')}</span>
                </a>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </PageSection>
  )
}

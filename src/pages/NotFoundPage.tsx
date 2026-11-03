import { useTranslation } from 'react-i18next'
import { ButtonLink } from '../components/ui/ButtonLink'
import { PixelMark } from '../components/ui/PixelMark'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function NotFoundPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('pages.notFound.title'))

  return (
    <section aria-labelledby="nf-title" className="mx-auto max-w-[76rem] px-4 pt-16 sm:px-6 sm:pt-24 lg:px-8">
      <PixelMark seed="404" className="size-16 text-blue" />
      <h1
        id="nf-title"
        className="mt-8 text-[clamp(2.3rem,6vw,4.2rem)] font-semibold leading-[1.04] tracking-[-0.045em]"
      >
        {t('pages.notFound.title')}
      </h1>
      <p className="mt-5 max-w-xl text-[1.1rem] text-ink-soft">{t('pages.notFound.lead')}</p>
      <div className="mt-10">
        <ButtonLink to="/">{t('common.backHome')}</ButtonLink>
      </div>
    </section>
  )
}

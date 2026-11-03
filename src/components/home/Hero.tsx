import { useTranslation } from 'react-i18next'
import { ButtonLink } from '../ui/ButtonLink'
import { ModeSelect } from './ModeSelect'

export function Hero() {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="hero-title" className="mx-auto max-w-[76rem] px-4 pt-10 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
        <div>
          <p className="inline-flex items-center gap-2.5 rounded-full border border-line px-3.5 py-1.5 text-sm text-ink-soft">
            <span aria-hidden="true" className="size-2 rounded-[2px] bg-blue" />
            {t('hero.status')}
          </p>

          <h1
            id="hero-title"
            className="mt-7 text-[clamp(2.35rem,5.6vw,4.75rem)] font-semibold leading-[1.02] tracking-[-0.045em]"
          >
            <span className="rise-line">
              <span>{t('hero.titleLine1')}</span>
            </span>
            <span className="rise-line">
              <span>{t('hero.titleLine2')}</span>
            </span>
          </h1>

          <p className="mt-6 max-w-[34rem] text-[1.08rem] leading-relaxed text-ink-soft sm:text-[1.15rem]">
            {t('hero.intro')}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/projects">{t('hero.primaryCta')}</ButtonLink>
            <ButtonLink to="/contact" variant="secondary">
              {t('hero.secondaryCta')}
            </ButtonLink>
          </div>
        </div>

        <ModeSelect />
      </div>
    </section>
  )
}

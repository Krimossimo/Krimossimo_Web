import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ButtonLink } from '../ui/ButtonLink'
import { PixelField } from './PixelField'

export function Hero() {
  const { t } = useTranslation()
  const areaRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={areaRef} className="relative isolate overflow-hidden pb-20 sm:pb-28">
      <PixelField areaRef={areaRef} />

      <section
        aria-labelledby="hero-title"
        className="mx-auto flex max-w-[60rem] flex-col items-center px-4 pt-16 text-center sm:px-6 sm:pt-24 lg:pt-28"
      >
        <div className="scroll-drift flex flex-col items-center">
          <p className="inline-flex items-center gap-2.5 rounded-full border border-line bg-bg/80 px-3.5 py-1.5 text-sm text-ink-soft backdrop-blur-sm">
            <span aria-hidden="true" className="blink size-2 rounded-[2px] bg-blue" />
            {t('hero.status')}
          </p>

          <h1
            id="hero-title"
            className="mt-8 text-[clamp(2.6rem,7vw,5.6rem)] font-semibold leading-[1.0] tracking-[-0.045em]"
          >
            <span className="rise-line">
              <span>{t('hero.titleLine1')}</span>
            </span>
            <span className="rise-line">
              <span>{t('hero.titleLine2')}</span>
            </span>
          </h1>

          <p className="k-fade-late mt-7 max-w-[38rem] text-[1.08rem] leading-relaxed text-ink-soft sm:text-[1.2rem]">
            {t('hero.intro')}
          </p>

          <div className="k-fade-later mt-10 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <ButtonLink to="/projects">{t('hero.primaryCta')}</ButtonLink>
            <ButtonLink to="/contact" variant="secondary">
              {t('hero.secondaryCta')}
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  )
}

import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ButtonLink } from '../ui/ButtonLink'
import { ModeSelect } from './ModeSelect'
import { PixelField } from './PixelField'

export function Hero() {
  const { t } = useTranslation()
  const areaRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={areaRef} className="relative isolate overflow-hidden pb-16 sm:pb-24">
      <PixelField areaRef={areaRef} />

      <section
        aria-labelledby="hero-title"
        className="mx-auto max-w-[76rem] px-4 pt-10 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20"
      >
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
          <div className="scroll-drift">
            <p className="inline-flex items-center gap-2.5 rounded-full border border-line bg-bg/80 px-3.5 py-1.5 text-sm text-ink-soft backdrop-blur-sm">
              <span aria-hidden="true" className="blink size-2 rounded-[2px] bg-blue" />
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

            <p
              className="k-fade-late mt-6 max-w-[34rem] text-[1.08rem] leading-relaxed text-ink-soft sm:text-[1.15rem]"
            >
              {t('hero.intro')}
            </p>

            <div className="k-fade-later mt-9 flex flex-col gap-3 sm:flex-row">
              <ButtonLink to="/projects">{t('hero.primaryCta')}</ButtonLink>
              <ButtonLink to="/contact" variant="secondary">
                {t('hero.secondaryCta')}
              </ButtonLink>
            </div>
          </div>

          <div className="scroll-drift-slow">
            <div className="k-pop-in">
              <ModeSelect />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

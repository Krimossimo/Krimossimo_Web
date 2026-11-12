import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { navItems, socials } from '../../config/site'
import { BrandLogo } from '../ui/BrandLogo'
import { ButtonLink } from '../ui/ButtonLink'
import { AchievementsPanel } from '../game/AchievementsPanel'
import { ArrowUpRightIcon, MailIcon, SocialIcon } from '../ui/Icons'

export function Footer() {
  const { t } = useTranslation()
  const year = new Date().getFullYear()

  return (
    <footer className="mt-24 border-t border-line sm:mt-32">
      <div className="mx-auto max-w-[76rem] px-4 sm:px-6 lg:px-8">
        {/* Appel à l'action de contact */}
        <div
          data-reveal
          className="flex flex-col gap-6 border-b border-line py-12 sm:py-16 md:flex-row md:items-end md:justify-between"
        >
          <div className="max-w-2xl">
            <h2 className="text-[clamp(1.6rem,3.4vw,2.4rem)] font-semibold leading-[1.1] tracking-[-0.03em]">
              {t('footer.ctaTitle')}
              <span
                aria-hidden="true"
                className="blink ml-2 inline-block h-[0.8em] w-[0.42em] translate-y-[0.08em] rounded-[2px] bg-blue"
              />
            </h2>
            <p className="mt-3 text-muted">{t('footer.ctaText')}</p>
          </div>
          <ButtonLink to="/contact" className="self-start md:self-auto">
            <MailIcon className="size-[18px]" />
            {t('footer.ctaButton')}
          </ButtonLink>
        </div>

        <AchievementsPanel />

        <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Link to="/" aria-label={t('a11y.home')} className="inline-flex rounded-xl">
              <BrandLogo size="md" />
            </Link>
            <p className="mt-3 max-w-xs text-[0.95rem] text-muted">{t('meta.tagline')}</p>
          </div>

          <nav aria-labelledby="footer-explore">
            <h2 id="footer-explore" className="font-sans text-[0.95rem] font-semibold text-ink">
              {t('footer.explore')}
            </h2>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
              {navItems.map((item) => (
                <li key={item.key}>
                  <Link to={item.path} className="text-[0.95rem] text-muted transition-colors hover:text-ink">
                    {t(`nav.${item.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="font-sans text-[0.95rem] font-semibold text-ink">{t('footer.follow')}</h2>
            <ul aria-label={t('a11y.socials')} className="mt-4 grid gap-2.5">
              {socials.map((s) => (
                <li key={s.id}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-3 text-[0.95rem] text-muted transition-colors hover:text-ink"
                  >
                    <SocialIcon
                      id={s.icon}
                      className="size-[18px] transition-[color,transform] duration-200 ease-snap group-hover:-translate-y-0.5 group-hover:scale-110 group-hover:text-blue"
                    />
                    {s.label}
                    <ArrowUpRightIcon className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    <span className="sr-only">{t('a11y.external')}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-line py-6 text-sm text-muted sm:flex-row sm:justify-between">
          <p>
            © {year} Krimossimo. {t('footer.rights')}
          </p>
        </div>
      </div>
    </footer>
  )
}

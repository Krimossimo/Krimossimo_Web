import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ButtonLink } from '../ui/ButtonLink'
import { PixelMark } from '../ui/PixelMark'

const modes = [
  { key: 'dev', to: '/projects' },
  { key: 'create', to: '/shop' },
  { key: 'play', to: '/games' },
] as const

/**
 * Sélecteur de mode façon écran de jeu : trois onglets en forme de touches.
 * Pattern ARIA "tabs" : flèches gauche/droite, Début/Fin, et touches 1 à 3.
 */
export function ModeSelect() {
  const { t } = useTranslation()
  const [active, setActive] = useState(0)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const id = useId()

  const select = (index: number, focus = true) => {
    const next = (index + modes.length) % modes.length
    setActive(next)
    if (focus) tabRefs.current[next]?.focus()
  }

  const onTabsKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      select(active + 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      select(active - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      select(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      select(modes.length - 1)
    }
  }

  const onPanelKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const n = Number(e.key)
    if (n >= 1 && n <= modes.length) {
      e.preventDefault()
      select(n - 1)
    }
  }

  const mode = modes[active]
  const items = t(`modes.${mode.key}.items`, { returnObjects: true }) as unknown as string[]

  return (
    <section
      aria-labelledby={`${id}-title`}
      onKeyDown={onPanelKeyDown}
      className="relative rounded-[1.75rem] border border-line bg-raised p-5 shadow-lift sm:p-7"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id={`${id}-title`} className="font-sans text-[0.95rem] font-semibold text-ink">
          {t('modes.title')}
        </h2>
        <p className="hidden text-sm text-muted [@media(pointer:fine)]:block">{t('modes.hint')}</p>
      </div>

      <div
        role="tablist"
        aria-labelledby={`${id}-title`}
        onKeyDown={onTabsKeyDown}
        className="mt-4 grid grid-cols-3 gap-2 sm:gap-3"
      >
        {modes.map((m, i) => {
          const selected = i === active
          return (
            <button
              key={m.key}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              id={`${id}-tab-${m.key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(i, false)}
              className={`keycap flex min-h-[4.25rem] min-w-0 flex-col items-start justify-between rounded-xl border px-3 py-2.5 text-left ${
                selected
                  ? 'border-blue bg-blue-tint text-ink'
                  : 'border-line-strong bg-bg text-muted hover:text-ink'
              }`}
            >
              <span
                aria-hidden="true"
                className={`text-xs font-semibold tabular-nums ${selected ? 'text-blue' : 'text-muted'}`}
              >
                {i + 1}
              </span>
              <span className="text-[0.85rem] font-semibold leading-tight sm:text-[0.95rem]">
                {t(`modes.${m.key}.label`)}
              </span>
            </button>
          )
        })}
      </div>

      <div
        key={mode.key}
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${mode.key}`}
        className="swap-in mt-6 grid gap-5 sm:grid-cols-[1fr_auto]"
      >
        <div>
          <h3 className="text-[1.3rem] font-semibold leading-snug tracking-[-0.02em] sm:text-[1.45rem]">
            {t(`modes.${mode.key}.title`)}
          </h3>
          <p className="mt-2 max-w-md text-[0.98rem] text-muted">{t(`modes.${mode.key}.text`)}</p>
        </div>
        <PixelMark seed={`krimossimo-${mode.key}`} className="hidden size-16 text-blue sm:block" />

        <ul className="grid gap-2 sm:col-span-2">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-3 text-[0.98rem] text-ink-soft">
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-[2px] bg-blue" />
              {item}
            </li>
          ))}
        </ul>

        <div className="sm:col-span-2">
          <ButtonLink to={mode.to} variant="secondary" className="w-full sm:w-auto">
            {t(`modes.${mode.key}.cta`)}
          </ButtonLink>
        </div>
      </div>
    </section>
  )
}

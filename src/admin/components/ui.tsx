import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AlertIcon, CheckIcon, InfoIcon } from '../../components/ui/Icons'

/** Champs de saisie : même style que les formulaires du site. */
export const inputClass =
  'w-full h-12 rounded-xl border border-line-strong bg-bg px-4 text-[1rem] text-ink transition-colors duration-150 placeholder:text-muted ' +
  'hover:border-ink focus:border-blue focus-visible:outline-2 focus-visible:outline-offset-2 aria-[invalid=true]:border-danger'

export const textareaClass =
  'w-full min-h-32 rounded-xl border border-line-strong bg-bg px-4 py-3 text-[1rem] leading-relaxed text-ink transition-colors duration-150 ' +
  'placeholder:text-muted hover:border-ink focus:border-blue focus-visible:outline-2 focus-visible:outline-offset-2 aria-[invalid=true]:border-danger'

export function Field({ id, label, hint, error, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[0.95rem] font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-2 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-2 flex items-start gap-1.5 text-sm text-danger">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; busy?: boolean }

const buttonVariants = {
  primary: 'bg-blue text-on-blue hover:bg-blue-hover',
  secondary: 'border border-line-strong bg-raised text-ink hover:border-ink',
  danger: 'border border-danger bg-danger-tint text-danger hover:bg-bg',
  ghost: 'text-ink hover:text-blue',
}

/** Bouton : pendant une action, il reste en place avec aria-busy (aucun indicateur animé). */
export function Button({ variant = 'primary', busy = false, className = '', disabled, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[0.95rem] font-medium transition-[background-color,border-color,color] duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${buttonVariants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

type Tone = 'info' | 'error' | 'success'

const tones: Record<Tone, string> = {
  info: 'border border-blue bg-blue-tint text-ink',
  error: 'bg-danger-tint text-danger',
  success: 'border border-line-strong bg-surface text-ink',
}

/** Message d'état. Les erreurs sont annoncées (role="alert"), le reste poliment (role="status"). */
export function Notice({ tone = 'info', title, children, className = '' }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const Icon = tone === 'error' ? AlertIcon : tone === 'success' ? CheckIcon : InfoIcon
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3.5 ${tones[tone]} ${className}`}>
      <p className="flex items-start gap-2.5 text-[0.95rem]">
        <Icon className={`mt-0.5 size-[18px] shrink-0 ${tone === 'info' ? 'text-blue' : ''}`} />
        <span>
          {title && <strong className="block font-semibold">{title}</strong>}
          {children}
        </span>
      </p>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[1.5rem] border border-line bg-raised p-5 sm:p-7 ${className}`}>{children}</div>
}

export function AdminHeading({ title, lead, actions, back }: { title: string; lead?: string; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header>
      {back && (
        <Link to={back.to} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
          <span aria-hidden="true">←</span> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <h1 id="admin-title" className="text-[clamp(1.7rem,4vw,2.5rem)] font-semibold leading-[1.08] tracking-[-0.035em]">
            {title}
          </h1>
          {lead && <p className="mt-3 text-[1.02rem] leading-relaxed text-ink-soft">{lead}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/** Lien présenté comme un bouton (navigation interne). */
export function LinkButton({ to, children, variant = 'primary', className = '' }: { to: string; children: ReactNode; variant?: 'primary' | 'secondary'; className?: string }) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[0.95rem] font-medium transition-colors duration-150 ${buttonVariants[variant]} ${className}`}
    >
      {children}
    </Link>
  )
}

/**
 * Champ bilingue : français obligatoire, anglais facultatif (le français est affiché
 * dans les deux langues si l'anglais est vide).
 */
export function BilingualField({
  id,
  label,
  value,
  onChange,
  errors,
  multiline = false,
  required = true,
  hint,
  maxLength,
}: {
  id: string
  label: string
  value: { fr: string; en: string }
  onChange: (value: { fr: string; en: string }) => void
  errors: { fr?: string | null; en?: string | null }
  multiline?: boolean
  required?: boolean
  hint?: string
  maxLength?: number
}) {
  const { t } = useTranslation()
  const control = (lang: 'fr' | 'en') => {
    const fieldId = `${id}-${lang}`
    const error = errors[lang]
    const props = {
      id: fieldId,
      name: fieldId,
      value: value[lang],
      maxLength: maxLength ? maxLength + 50 : undefined,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? `${fieldId}-error` : undefined,
      lang,
    }
    return multiline ? (
      <textarea {...props} rows={6} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} className={textareaClass} />
    ) : (
      <input {...props} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} className={inputClass} />
    )
  }
  return (
    <fieldset>
      <legend className="mb-2 text-[0.95rem] font-semibold text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="text-blue">
            {' '}
            *
          </span>
        )}
      </legend>
      <div className={`grid gap-3 ${multiline ? '' : 'sm:grid-cols-2'}`}>
        <Field id={`${id}-fr`} label={<span className="text-sm font-medium text-ink-soft">{t('admin.form.fr')}</span>} error={errors.fr}>
          {control('fr')}
        </Field>
        <Field id={`${id}-en`} label={<span className="text-sm font-medium text-ink-soft">{t('admin.form.en')}</span>} error={errors.en}>
          {control('en')}
        </Field>
      </div>
      {hint && <p className="mt-2 text-sm text-muted">{hint}</p>}
    </fieldset>
  )
}

/**
 * Boîte de confirmation modale (élément <dialog> natif : focus piégé, Échap pour annuler).
 * Le bouton de confirmation est désactivé pendant l'action (pas de double envoi).
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  tone = 'danger',
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  /** danger : suppression ; primary : action non destructive (ex. import). */
  tone?: 'danger' | 'primary'
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onCancel()
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[1.25rem] border border-line bg-raised p-0 text-ink shadow-lift backdrop:bg-black/50"
    >
      <div className="p-6">
        <h2 id="confirm-title" className="text-[1.2rem] font-semibold tracking-[-0.02em]">
          {title}
        </h2>
        <div className="mt-3 text-ink-soft">{children}</div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>
            {t('admin.list.cancel')}
          </Button>
          <Button variant={tone} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}

/** Pastille de statut (pixel carré, pas d'animation). */
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'danger' | 'solid' }) {
  const styles = {
    neutral: 'border-line-strong bg-surface text-ink-soft',
    blue: 'border-blue bg-blue-tint text-ink',
    danger: 'border-danger bg-danger-tint text-danger',
    solid: 'border-blue bg-blue text-on-blue',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.8rem] font-semibold ${styles[tone]}`}>
      <span aria-hidden="true" className="size-1.5 rounded-[1px] bg-current" />
      {children}
    </span>
  )
}

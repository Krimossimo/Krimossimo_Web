import { useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  checkoutFields,
  checkoutLimits,
  deadlines,
  requiredCheckoutFields,
  validateCheckout,
  validateCheckoutField,
  type CheckoutError,
  type CheckoutErrors,
  type CheckoutField,
  type CheckoutValues,
} from '../../lib/checkout'
import { AlertIcon } from '../ui/Icons'
import { buttonClass } from '../ui/buttonStyles'

type Props = {
  values: CheckoutValues
  onChange: (values: CheckoutValues) => void
  /** Appelé uniquement quand toutes les validations passent. */
  onValidSubmit: (values: CheckoutValues) => void
  submitting: boolean
  /** Libellés du bouton (par défaut : commande avec paiement en ligne). */
  submitLabel?: string
  submittingLabel?: string
}

type ControlElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

const inputBase =
  'w-full rounded-xl border bg-bg px-4 text-[1rem] text-ink transition-colors duration-150 placeholder:text-muted ' +
  'hover:border-ink focus:border-blue focus-visible:outline-2 focus-visible:outline-offset-2'

/** Formulaire de commande : coordonnées + besoin. Validation à la saisie et à l'envoi. */
export function CheckoutForm({ values, onChange, onValidSubmit, submitting, submitLabel, submittingLabel }: Props) {
  const { t } = useTranslation()
  const formId = useId()
  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [touched, setTouched] = useState<Partial<Record<CheckoutField, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const refs = useRef<Partial<Record<CheckoutField, ControlElement | null>>>({})

  const message = (error: CheckoutError) => {
    switch (error.code) {
      case 'tooShort':
        return t('checkout.errors.tooShort', { min: error.min })
      case 'tooLong':
        return t('checkout.errors.tooLong', { max: error.max })
      default:
        return t(`checkout.errors.${error.code}`)
    }
  }

  const update = (field: keyof CheckoutValues) => (event: ChangeEvent<ControlElement>) => {
    const target = event.target
    const value = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value
    const next = { ...values, [field]: value } as CheckoutValues
    onChange(next)
    if (field !== 'website' && (touched[field] || submitted)) {
      setErrors((prev) => ({ ...prev, [field]: validateCheckoutField(field, next) }))
    }
  }

  const blur = (field: CheckoutField) => () => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    setErrors((prev) => ({ ...prev, [field]: validateCheckoutField(field, values) }))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    setSubmitted(true)
    const found = validateCheckout(values)
    setErrors(found)
    const first = checkoutFields.find((field) => found[field])
    if (first) {
      refs.current[first]?.focus()
      return
    }
    onValidSubmit(values)
  }

  const describedBy = (field: CheckoutField, hint?: boolean) =>
    [errors[field] ? `${formId}-${field}-error` : '', hint ? `${formId}-${field}-hint` : ''].filter(Boolean).join(' ') ||
    undefined

  const control = (field: CheckoutField, extra = '', hint = false) => ({
    id: `${formId}-${field}`,
    name: field,
    onBlur: blur(field),
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': describedBy(field, hint),
    'aria-required': requiredCheckoutFields.includes(field) ? true : undefined,
    className: `${inputBase} ${errors[field] ? 'border-danger' : 'border-line-strong'} ${extra}`,
    ref: (el: ControlElement | null) => {
      refs.current[field] = el
    },
  })

  const errorText = (field: CheckoutField) => {
    const error = errors[field]
    return error ? (
      <p id={`${formId}-${field}-error`} className="mt-2 flex items-start gap-1.5 text-sm text-danger">
        <AlertIcon className="mt-0.5 size-4 shrink-0" />
        {message(error)}
      </p>
    ) : null
  }

  const label = (field: CheckoutField) => (
    <>
      {t(`checkout.fields.${field}`)}
      {requiredCheckoutFields.includes(field) ? (
        <span aria-hidden="true" className="text-blue">
          {' '}
          *
        </span>
      ) : (
        <span className="font-normal text-muted"> ({t('checkout.optional')})</span>
      )}
    </>
  )

  const errorCount = checkoutFields.filter((field) => errors[field]).length

  return (
    <form noValidate onSubmit={submit} aria-busy={submitting}>
      {submitted && errorCount > 0 && (
        <div role="alert" className="mb-6 flex items-start gap-2.5 rounded-xl bg-danger-tint px-4 py-3 text-[0.95rem] text-danger">
          <AlertIcon className="mt-0.5 size-[18px] shrink-0" />
          {t('checkout.errors.summary', { count: errorCount })}
        </div>
      )}
      <p className="text-sm text-muted">{t('checkout.requiredNote')}</p>

      <fieldset className="mt-6">
        <legend className="font-display text-[1.2rem] font-semibold tracking-[-0.02em] text-ink">
          {t('checkout.contactSection')}
        </legend>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field id={`${formId}-firstName`} label={label('firstName')} error={errorText('firstName')}>
            <input type="text" autoComplete="given-name" value={values.firstName} onChange={update('firstName')} {...control('firstName', 'h-12')} />
          </Field>
          <Field id={`${formId}-lastName`} label={label('lastName')} error={errorText('lastName')}>
            <input type="text" autoComplete="family-name" value={values.lastName} onChange={update('lastName')} {...control('lastName', 'h-12')} />
          </Field>
          <Field id={`${formId}-email`} label={label('email')} error={errorText('email')}>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              value={values.email}
              onChange={update('email')}
              {...control('email', 'h-12')}
            />
          </Field>
          <Field
            id={`${formId}-phone`}
            label={label('phone')}
            error={errorText('phone')}
            hint={<span id={`${formId}-phone-hint`}>{t('checkout.hints.phone')}</span>}
          >
            <input type="tel" autoComplete="tel" inputMode="tel" value={values.phone} onChange={update('phone')} {...control('phone', 'h-12', true)} />
          </Field>
          <Field id={`${formId}-company`} label={label('company')} error={errorText('company')}>
            <input type="text" autoComplete="organization" value={values.company} onChange={update('company')} {...control('company', 'h-12')} />
          </Field>
          <Field id={`${formId}-country`} label={label('country')} error={errorText('country')}>
            <input type="text" autoComplete="country-name" value={values.country} onChange={update('country')} {...control('country', 'h-12')} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="mt-10">
        <legend className="font-display text-[1.2rem] font-semibold tracking-[-0.02em] text-ink">
          {t('checkout.projectSection')}
        </legend>
        <div className="mt-5 grid gap-5">
          <Field
            id={`${formId}-details`}
            label={label('details')}
            error={errorText('details')}
            hint={<span id={`${formId}-details-hint`}>{t('checkout.hints.details', { min: checkoutLimits.detailsMin })}</span>}
          >
            <textarea rows={6} value={values.details} onChange={update('details')} {...control('details', 'min-h-36 resize-y py-3', true)} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id={`${formId}-referenceUrl`}
              label={label('referenceUrl')}
              error={errorText('referenceUrl')}
              hint={<span id={`${formId}-referenceUrl-hint`}>{t('checkout.hints.referenceUrl')}</span>}
            >
              <input
                type="url"
                inputMode="url"
                spellCheck={false}
                placeholder="https://"
                value={values.referenceUrl}
                onChange={update('referenceUrl')}
                {...control('referenceUrl', 'h-12', true)}
              />
            </Field>
            <Field id={`${formId}-deadline`} label={label('deadline')} error={errorText('deadline')}>
              <div className="relative">
                <select value={values.deadline} onChange={update('deadline')} {...control('deadline', 'h-12 appearance-none pr-11')}>
                  <option value="">{t('checkout.deadlinePlaceholder')}</option>
                  {deadlines.map((d) => (
                    <option key={d} value={d}>
                      {t(`checkout.deadlines.${d}`)}
                    </option>
                  ))}
                </select>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </Field>
          </div>
        </div>
      </fieldset>

      <div className="mt-8">
        <label htmlFor={`${formId}-consent`} className="flex cursor-pointer items-start gap-3 text-[0.97rem] text-ink-soft">
          <input
            type="checkbox"
            checked={values.consent}
            onChange={update('consent')}
            {...control('consent')}
            className={`mt-0.5 size-5 shrink-0 cursor-pointer rounded accent-[var(--k-blue)] ${errors.consent ? 'outline outline-2 outline-danger' : ''}`}
          />
          <span>
            {t('checkout.fields.consent')}
            <span aria-hidden="true" className="text-blue">
              {' '}
              *
            </span>
          </span>
        </label>
        {errorText('consent')}
      </div>

      {/* Champ piège anti-robots : invisible et ignoré par les lecteurs d'écran. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${formId}-website`}>Website</label>
        <input id={`${formId}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" value={values.website} onChange={update('website')} />
      </div>

      <button
        type="submit"
        aria-disabled={submitting}
        className={buttonClass('primary', 'mt-8 w-full px-6 aria-disabled:cursor-wait aria-disabled:opacity-70 sm:w-auto')}
      >
        {submitting ? (submittingLabel ?? t('checkout.submitting')) : (submitLabel ?? t('checkout.submit'))}
      </button>
    </form>
  )
}

function Field({ id, label, error, hint, children }: { id: string; label: ReactNode; error: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[0.95rem] font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="mt-2 text-sm text-muted">{hint}</p>}
      {error}
    </div>
  )
}

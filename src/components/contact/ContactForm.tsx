import { useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { contactSubjects } from '../../types/content'
import {
  ContactNotConfiguredError,
  ContactSendError,
  contactFields,
  contactLimits,
  emptyContact,
  isContactConfigured,
  isContactSubject,
  sendContactMessage,
  validateContact,
  validateField,
  type ContactError,
  type ContactErrors,
  type ContactField,
  type ContactSendErrorCode,
  type ContactValues,
} from '../../lib/contact'
import { useLocale } from '../../hooks/useLocale'
import { AlertIcon, InfoIcon } from '../ui/Icons'

type Status = 'idle' | 'sending' | 'not-configured' | 'success' | 'error'

const inputBase =
  'w-full rounded-xl border bg-bg px-4 text-[1rem] text-ink transition-colors duration-150 placeholder:text-muted ' +
  'hover:border-ink focus:border-blue focus-visible:outline-2 focus-visible:outline-offset-2'

export function ContactForm() {
  const { t } = useTranslation()
  const locale = useLocale()
  const [params] = useSearchParams()
  const formId = useId()

  // Un sujet peut être présélectionné depuis la boutique : /contact?subject=website
  const preset = params.get('subject')
  const [values, setValues] = useState<ContactValues>(() => ({
    ...emptyContact,
    subject: isContactSubject(preset) ? preset : '',
  }))
  const [errors, setErrors] = useState<ContactErrors>({})
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({})
  const [status, setStatus] = useState<Status>('idle')
  const [errorCode, setErrorCode] = useState<ContactSendErrorCode>('network')
  // Début de la saisie (anti-robots : le serveur refuse un envoi quasi instantané).
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [submitted, setSubmitted] = useState(false)
  const fieldRefs = useRef<Partial<Record<ContactField, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>>>({})

  const errorMessage = (error: ContactError) => {
    switch (error.code) {
      case 'tooShort':
        return t('contact.errors.tooShort', { min: error.min })
      case 'tooLong':
        return t('contact.errors.tooLong', { max: error.max })
      case 'links':
        return t('contact.errors.links', { max: error.max })
      default:
        return t(`contact.errors.${error.code}`)
    }
  }

  const update =
    (field: keyof ContactValues) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const next = { ...values, [field]: event.target.value }
      setValues(next)
      if (status !== 'sending') setStatus('idle')
      // Une erreur déjà affichée disparaît dès que le champ devient valide.
      if (field !== 'website' && (touched[field] || submitted)) {
        setErrors((prev) => ({ ...prev, [field]: validateField(field, next) }))
      }
    }

  const blur = (field: ContactField) => () => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    setErrors((prev) => ({ ...prev, [field]: validateField(field, values) }))
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status === 'sending') return
    setSubmitted(true)

    const found = validateContact(values)
    setErrors(found)
    const firstInvalid = contactFields.find((field) => found[field])
    if (firstInvalid) {
      setStatus('idle')
      fieldRefs.current[firstInvalid]?.focus()
      return
    }

    setStatus('sending')
    try {
      await sendContactMessage(values, locale, Date.now() - startedAt)
      setStatus('success')
      setValues(emptyContact)
      setTouched({})
      setSubmitted(false)
      setStartedAt(Date.now())
    } catch (error) {
      if (error instanceof ContactNotConfiguredError) {
        setStatus('not-configured')
      } else {
        setErrorCode(error instanceof ContactSendError ? error.code : 'server')
        setStatus('error')
      }
    }
  }

  const errorCount = contactFields.filter((field) => errors[field]).length

  const fieldProps = (field: ContactField, extraClass = '') => {
    const error = errors[field]
    return {
      id: `${formId}-${field}`,
      name: field,
      value: values[field],
      onChange: update(field),
      onBlur: blur(field),
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? `${formId}-${field}-error` : undefined,
      required: true,
      className: `${inputBase} ${error ? 'border-danger' : 'border-line-strong'} ${extraClass}`,
      ref: (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) => {
        fieldRefs.current[field] = el
      },
    }
  }

  const fieldError = (field: ContactField) => {
    const error = errors[field]
    return error ? (
      <p id={`${formId}-${field}-error`} className="mt-2 flex items-start gap-1.5 text-sm text-danger">
        <AlertIcon className="mt-0.5 size-4 shrink-0" />
        {errorMessage(error)}
      </p>
    ) : null
  }

  return (
    <div>
      {!isContactConfigured && (status === 'idle' || status === 'sending') && (
        <p className="mb-6 flex items-start gap-2.5 rounded-xl bg-blue-tint px-4 py-3 text-[0.95rem] text-ink-soft">
          <InfoIcon className="mt-0.5 size-[18px] shrink-0 text-blue" />
          {t('contact.notice')}
        </p>
      )}

      {submitted && errorCount > 0 && (
        <div role="alert" className="mb-6 flex items-start gap-2.5 rounded-xl bg-danger-tint px-4 py-3 text-[0.95rem] text-danger">
          <AlertIcon className="mt-0.5 size-[18px] shrink-0" />
          {t('contact.errors.summary', { count: errorCount })}
        </div>
      )}

      <StatusMessage status={status} errorCode={errorCode} />

      <form noValidate onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
        <p className="text-sm text-muted sm:col-span-2">{t('contact.allRequired')}</p>

        <Field label={t('contact.fields.lastName')} htmlFor={`${formId}-lastName`} error={fieldError('lastName')}>
          <input type="text" autoComplete="family-name" {...fieldProps('lastName', 'h-12')} />
        </Field>

        <Field label={t('contact.fields.firstName')} htmlFor={`${formId}-firstName`} error={fieldError('firstName')}>
          <input type="text" autoComplete="given-name" {...fieldProps('firstName', 'h-12')} />
        </Field>

        <Field label={t('contact.fields.email')} htmlFor={`${formId}-email`} error={fieldError('email')}>
          <input type="email" autoComplete="email" inputMode="email" spellCheck={false} {...fieldProps('email', 'h-12')} />
        </Field>

        <Field label={t('contact.fields.subject')} htmlFor={`${formId}-subject`} error={fieldError('subject')}>
          <div className="relative">
            <select {...fieldProps('subject', 'h-12 appearance-none pr-11')}>
              <option value="" disabled>
                {t('contact.subjectPlaceholder')}
              </option>
              {contactSubjects.map((subject) => (
                <option key={subject} value={subject}>
                  {t(`contact.subjects.${subject}`)}
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

        <Field
          label={t('contact.fields.message')}
          htmlFor={`${formId}-message`}
          error={fieldError('message')}
          className="sm:col-span-2"
          hint={
            <span className={values.message.trim().length > contactLimits.messageMax ? 'text-danger' : undefined}>
              {t('contact.charCount', { count: values.message.trim().length, max: contactLimits.messageMax })}
            </span>
          }
        >
          <textarea rows={7} {...fieldProps('message', 'min-h-40 resize-y py-3')} />
        </Field>

        {/* Champ piège anti-robots : invisible et ignoré par les lecteurs d'écran. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor={`${formId}-website`}>Website</label>
          <input
            id={`${formId}-website`}
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={update('website')}
          />
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            aria-disabled={status === 'sending'}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue px-6 text-[0.98rem] font-medium text-on-blue transition-[background-color,transform] duration-150 hover:bg-blue-hover active:translate-y-px aria-disabled:opacity-70 sm:w-auto"
          >
            {status === 'sending' ? t('contact.sending') : t('contact.submit')}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  className = '',
  children,
}: {
  label: string
  htmlFor: string
  error: ReactNode
  hint?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <label htmlFor={htmlFor} className="text-[0.95rem] font-medium text-ink">
          {label}
        </label>
        {hint && <span className="text-sm tabular-nums text-muted">{hint}</span>}
      </div>
      {children}
      {error}
    </div>
  )
}

function StatusMessage({ status, errorCode }: { status: Status; errorCode: ContactSendErrorCode }) {
  const { t } = useTranslation()
  const info =
    status === 'not-configured'
      ? { title: t('contact.status.notConfiguredTitle'), text: t('contact.status.notConfiguredText') }
      : status === 'success'
        ? { title: t('contact.status.successTitle'), text: t('contact.status.successText') }
        : null
  const danger =
    status === 'error'
      ? { title: t('contact.status.errorTitle'), text: errorCode === 'network' ? t('contact.status.errorText') : t(`contact.status.errors.${errorCode}`) }
      : null

  // Les deux zones restent montées pour que les lecteurs d'écran annoncent chaque changement.
  return (
    <>
      <div role="status" aria-live="polite">
        {info && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue bg-blue-tint px-4 py-3.5 text-ink">
            <InfoIcon className="mt-0.5 size-5 shrink-0 text-blue" />
            <div>
              <p className="font-semibold">{info.title}</p>
              <p className="mt-0.5 text-[0.95rem] text-ink-soft">{info.text}</p>
            </div>
          </div>
        )}
      </div>
      <div role="alert" aria-live="assertive">
        {danger && (
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-danger-tint px-4 py-3.5 text-danger">
            <AlertIcon className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">{danger.title}</p>
              <p className="mt-0.5 text-[0.95rem]">{danger.text}</p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

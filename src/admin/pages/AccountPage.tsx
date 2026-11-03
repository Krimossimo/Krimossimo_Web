import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { EMAIL_PATTERN } from '../../lib/patterns'
import { useAdminSession } from '../admin-context'
import { AdminAuthError, changePassword, checkNewPassword, requestEmailChange } from '../authService'
import { AdminHeading, Button, Card, Field, Notice, inputClass } from '../components/ui'
import { RequireAdmin } from '../RequireAdmin'

type Feedback = { tone: 'error' | 'success'; text: string } | null

function PasswordForm({ email }: { email: string | null }) {
  const { t } = useTranslation()
  const id = useId()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fieldError, setFieldError] = useState<{ field: 'current' | 'next' | 'confirm'; text: string } | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setFeedback(null)
    const policy = checkNewPassword(next)
    if (!current) return setFieldError({ field: 'current', text: t('admin.account.required') })
    if (policy) return setFieldError({ field: 'next', text: t(`admin.account.${policy}`) })
    if (next === current) return setFieldError({ field: 'next', text: t('admin.account.same') })
    if (confirm !== next) return setFieldError({ field: 'confirm', text: t('admin.account.mismatch') })
    setFieldError(null)
    setBusy(true)
    try {
      await changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      setFeedback({ tone: 'success', text: t('admin.account.passwordDone') })
    } catch (error) {
      setFeedback({ tone: 'error', text: t(`admin.errors.${error instanceof AdminAuthError ? error.code : 'unknown'}`) })
    } finally {
      setBusy(false)
    }
  }

  const errorFor = (field: 'current' | 'next' | 'confirm') => (fieldError?.field === field ? fieldError.text : null)
  const described = (field: 'current' | 'next' | 'confirm', hint = false) =>
    [errorFor(field) ? `${id}-${field}-error` : '', hint ? `${id}-${field}-hint` : ''].filter(Boolean).join(' ') || undefined

  return (
    <Card>
      <h2 className="font-sans text-[1.15rem] font-semibold">{t('admin.account.passwordTitle')}</h2>
      <form noValidate onSubmit={submit} className="mt-5 space-y-5" aria-busy={busy}>
        {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
        {/* Champ identifiant masqué : aide les gestionnaires de mots de passe. */}
        <input type="text" name="username" autoComplete="username" className="hidden" readOnly value={email ?? ''} tabIndex={-1} aria-hidden="true" />
        <Field id={`${id}-current`} label={t('admin.account.current')} error={errorFor('current')}>
          <input
            id={`${id}-current`}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            aria-invalid={Boolean(errorFor('current')) || undefined}
            aria-describedby={described('current')}
            className={inputClass}
          />
        </Field>
        <Field id={`${id}-next`} label={t('admin.account.new')} hint={t('admin.account.passwordHint')} error={errorFor('next')}>
          <input
            id={`${id}-next`}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={Boolean(errorFor('next')) || undefined}
            aria-describedby={described('next', true)}
            className={inputClass}
          />
        </Field>
        <Field id={`${id}-confirm`} label={t('admin.account.confirm')} error={errorFor('confirm')}>
          <input
            id={`${id}-confirm`}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={Boolean(errorFor('confirm')) || undefined}
            aria-describedby={described('confirm')}
            className={inputClass}
          />
        </Field>
        <Button type="submit" busy={busy} className="min-h-12 px-6">
          {busy ? t('admin.account.working') : t('admin.account.passwordSubmit')}
        </Button>
      </form>
    </Card>
  )
}

function EmailForm({ currentEmail }: { currentEmail: string | null }) {
  const { t } = useTranslation()
  const id = useId()
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<{ field: 'password' | 'email'; text: string } | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setFeedback(null)
    if (!EMAIL_PATTERN.test(email.trim())) return setFieldError({ field: 'email', text: t('admin.errors.invalid-email') })
    if (!password) return setFieldError({ field: 'password', text: t('admin.account.required') })
    setFieldError(null)
    setBusy(true)
    try {
      await requestEmailChange(password, email)
      setPassword('')
      setFeedback({ tone: 'success', text: t('admin.account.emailDone', { email: email.trim() }) })
    } catch (error) {
      setFeedback({ tone: 'error', text: t(`admin.errors.${error instanceof AdminAuthError ? error.code : 'unknown'}`) })
    } finally {
      setBusy(false)
    }
  }

  const errorFor = (field: 'password' | 'email') => (fieldError?.field === field ? fieldError.text : null)

  return (
    <Card>
      <h2 className="font-sans text-[1.15rem] font-semibold">{t('admin.account.emailTitle')}</h2>
      <p className="mt-2 text-ink-soft">{t('admin.account.currentEmail', { email: currentEmail ?? '—' })}</p>
      <form noValidate onSubmit={submit} className="mt-5 space-y-5" aria-busy={busy}>
        {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
        <Field id={`${id}-email`} label={t('admin.account.newEmail')} error={errorFor('email')}>
          <input
            id={`${id}-email`}
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(errorFor('email')) || undefined}
            aria-describedby={errorFor('email') ? `${id}-email-error` : undefined}
            className={inputClass}
          />
        </Field>
        <Field id={`${id}-password`} label={t('admin.account.current')} error={errorFor('password')}>
          <input
            id={`${id}-password`}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(errorFor('password')) || undefined}
            aria-describedby={errorFor('password') ? `${id}-password-error` : undefined}
            className={inputClass}
          />
        </Field>
        <p className="text-sm text-muted">{t('admin.account.emailNote')}</p>
        <Button type="submit" busy={busy} className="min-h-12 px-6">
          {busy ? t('admin.account.working') : t('admin.account.emailSubmit')}
        </Button>
      </form>
    </Card>
  )
}

function Account() {
  const { t } = useTranslation()
  useDocumentTitle(t('admin.account.title'))
  const session = useAdminSession()
  return (
    <>
      <AdminHeading title={t('admin.account.title')} lead={t('admin.account.lead')} />
      <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:items-start">
        <PasswordForm email={session.email} />
        <EmailForm currentEmail={session.email} />
      </div>
    </>
  )
}

export default function AccountPage() {
  return (
    <RequireAdmin>
      <Account />
    </RequireAdmin>
  )
}

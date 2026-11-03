import { useEffect, useId, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { EMAIL_PATTERN } from '../../lib/patterns'
import { useAdminAuth } from '../admin-context'
import { AdminAuthError, sendPasswordReset, signIn, type AuthErrorCode } from '../authService'
import { AdminHeading, Button, Card, Field, Notice, inputClass } from '../components/ui'
import { safeNext } from '../navigation'

export default function LoginPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('admin.login.title'))
  const state = useAdminAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const id = useId()

  const [mode, setMode] = useState<'login' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AuthErrorCode | 'required' | 'emailRequired' | null>(null)
  const [denied, setDenied] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  useEffect(() => {
    if (state.status === 'admin') navigate(next, { replace: true })
  }, [state.status, navigate, next])

  if (state.status === 'unconfigured') {
    return (
      <div className="mx-auto max-w-xl">
        <AdminHeading title={t('admin.login.title')} />
        <Notice tone="info" title={t('admin.notConfigured.title')} className="mt-8">
          {t('admin.notConfigured.text')}
        </Notice>
      </div>
    )
  }

  const errorText = error
    ? error === 'required' || error === 'emailRequired'
      ? t(`admin.login.${error}`)
      : t(`admin.errors.${error}`)
    : null

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setDenied(false)
    if (!email.trim() || !password) {
      setError('required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const session = await signIn(email, password)
      setPassword('')
      if (!session.isAdmin) setDenied(true)
    } catch (err) {
      setError(err instanceof AdminAuthError ? err.code : 'unknown')
    } finally {
      setBusy(false)
    }
  }

  const submitReset = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('emailRequired')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await sendPasswordReset(email)
      setResetSent(true)
    } catch (err) {
      setError(err instanceof AdminAuthError ? err.code : 'unknown')
    } finally {
      setBusy(false)
    }
  }

  const emailField = (
    <Field id={`${id}-email`} label={t('admin.login.email')}>
      <input
        id={`${id}-email`}
        name="username"
        type="email"
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={error === 'required' || error === 'emailRequired' || error === 'invalid-email' || undefined}
        className={inputClass}
      />
    </Field>
  )

  return (
    <div className="mx-auto max-w-xl">
      <AdminHeading
        title={mode === 'login' ? t('admin.login.title') : t('admin.login.resetTitle')}
        lead={mode === 'login' ? t('admin.login.lead') : t('admin.login.resetLead')}
      />
      <Card className="mt-8">
        {denied && (
          <Notice tone="error" className="mb-5">
            {t('admin.login.denied')}
          </Notice>
        )}
        {errorText && (
          <Notice tone="error" className="mb-5">
            {errorText}
          </Notice>
        )}

        {mode === 'login' ? (
          <form noValidate onSubmit={submitLogin} className="space-y-5" aria-busy={busy}>
            {emailField}
            <Field id={`${id}-password`} label={t('admin.login.password')}>
              <input
                id={`${id}-password`}
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error === 'required' || undefined}
                className={inputClass}
              />
            </Field>
            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <Button type="submit" busy={busy} className="min-h-12 px-6">
                {busy ? t('admin.login.submitting') : t('admin.login.submit')}
              </Button>
              <Button
                variant="ghost"
                className="px-0 text-sm"
                onClick={() => {
                  setMode('reset')
                  setError(null)
                  setDenied(false)
                  setPassword('')
                }}
              >
                {t('admin.login.forgot')}
              </Button>
            </div>
            <p className="text-sm text-muted">{t('admin.login.sessionNote')}</p>
          </form>
        ) : (
          <form noValidate onSubmit={submitReset} className="space-y-5" aria-busy={busy}>
            {resetSent && <Notice tone="success">{t('admin.login.resetSent')}</Notice>}
            {emailField}
            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <Button type="submit" busy={busy} className="min-h-12 px-6">
                {t('admin.login.resetSubmit')}
              </Button>
              <Button
                variant="ghost"
                className="px-0 text-sm"
                onClick={() => {
                  setMode('login')
                  setError(null)
                  setResetSent(false)
                }}
              >
                {t('admin.login.back')}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}

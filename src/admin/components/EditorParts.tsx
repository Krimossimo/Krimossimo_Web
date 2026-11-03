import { useId, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { EditorFeedback } from '../useContentEditor'
import { useCleanupText } from '../editorHooks'
import type { PublicationStatus } from '../../types/content'
import { Button, Card, Field, LinkButton, Notice, inputClass } from './ui'

export function EditorFeedbackNotice({ feedback }: { feedback: EditorFeedback | null }) {
  const { t } = useTranslation()
  const cleanupText = useCleanupText()
  const [params] = useSearchParams()
  const createdFromUrl = params.get('created') === '1'

  if (!feedback) {
    return createdFromUrl ? (
      <Notice tone="success" className="mb-6">
        {t('admin.form.created')}
      </Notice>
    ) : null
  }
  if (feedback.kind === 'saved') {
    const cleanup = cleanupText(feedback.cleanup)
    return (
      <Notice tone="success" className="mb-6">
        {feedback.created ? t('admin.form.created') : t('admin.form.saved')}
        {cleanup && <span className="mt-1 block text-ink-soft">{cleanup}</span>}
      </Notice>
    )
  }
  if (feedback.kind === 'form-errors') {
    return (
      <Notice tone="error" className="mb-6">
        {t('admin.form.summary')}
      </Notice>
    )
  }
  if (feedback.kind === 'invalid') {
    return (
      <Notice tone="error" className="mb-6" title={t('admin.form.invalid')}>
        <span className="mt-1 block break-words font-mono text-[0.85rem]">{feedback.details.join(' ; ')}</span>
      </Notice>
    )
  }
  return (
    <Notice tone="error" className="mb-6" title={t(`admin.form.failed.${feedback.kind}`)}>
      {t(`admin.form.reasons.${feedback.code}`)}
    </Notice>
  )
}

/** État de chargement d'un éditeur (texte statique, aucune animation). */
export function EditorStatus({
  status,
  loadError,
  onRetry,
  listPath,
}: {
  status: 'loading' | 'missing' | 'error'
  loadError: string | null
  onRetry: () => void
  listPath: string
}) {
  const { t } = useTranslation()
  if (status === 'loading') {
    return (
      <p role="status" className="mt-8 text-muted">
        {t('admin.form.loading')}
      </p>
    )
  }
  if (status === 'missing') {
    return (
      <Notice tone="info" className="mt-8">
        {t('admin.form.notFound')}{' '}
        <LinkButton to={listPath} variant="secondary" className="mt-3">
          {t('admin.form.back')}
        </LinkButton>
      </Notice>
    )
  }
  return (
    <Notice tone="error" className="mt-8" title={t('admin.form.loadFailed')}>
      {t(`admin.form.reasons.${loadError ?? 'unknown'}`)}{' '}
      <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-4">
        {t('admin.retry')}
      </button>
    </Notice>
  )
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-6">
      <h2 className="font-sans text-[1.05rem] font-semibold">{title}</h2>
      {children}
    </Card>
  )
}

/** Identifiant d'URL : modifiable à la création uniquement. */
export function SlugField({ value, onChange, isNew, error }: { value: string; onChange: (v: string) => void; isNew: boolean; error: string | null }) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <Field id={`${id}-slug`} label={t('admin.form.slug')} hint={isNew ? t('admin.form.slugHint') : t('admin.form.slugLocked')} error={error}>
      <input
        id={`${id}-slug`}
        name="slug"
        value={value}
        readOnly={!isNew}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        spellCheck={false}
        autoCapitalize="none"
        aria-invalid={error ? true : undefined}
        className={`${inputClass} font-mono text-[0.95rem] read-only:bg-surface read-only:text-ink-soft`}
      />
    </Field>
  )
}

export function PublicationAndDate({
  publication,
  onPublication,
  date,
  onDate,
  dateError,
}: {
  publication: PublicationStatus
  onPublication: (p: PublicationStatus) => void
  date: string
  onDate: (d: string) => void
  dateError: string | null
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field id={`${id}-publication`} label={t('admin.form.publication')}>
        <select
          id={`${id}-publication`}
          name="publication"
          value={publication}
          onChange={(e) => onPublication(e.target.value as PublicationStatus)}
          className={inputClass}
        >
          <option value="draft">{t('admin.form.publications.draft')}</option>
          <option value="published">{t('admin.form.publications.published')}</option>
        </select>
      </Field>
      <Field id={`${id}-date`} label={t('admin.form.date')} hint={t('admin.form.dateHint')} error={dateError}>
        <input
          id={`${id}-date`}
          name="date"
          type="date"
          value={date}
          onChange={(e) => onDate(e.target.value)}
          aria-invalid={dateError ? true : undefined}
          className={inputClass}
        />
      </Field>
    </div>
  )
}

/** Barre d'actions de l'éditeur (bouton unique, désactivé pendant l'enregistrement). */
export function EditorActions({ busy, listPath, onDelete }: { busy: boolean; listPath: string; onDelete?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface/95 px-4 py-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
      <Button type="submit" busy={busy} className="min-h-12 px-6">
        {busy ? t('admin.form.saving') : t('admin.form.save')}
      </Button>
      <LinkButton to={listPath} variant="secondary">
        {t('admin.form.back')}
      </LinkButton>
      {onDelete && (
        <Button variant="ghost" onClick={onDelete} disabled={busy} className="ml-auto text-danger hover:text-danger">
          {t('admin.list.delete')}
        </Button>
      )}
    </div>
  )
}

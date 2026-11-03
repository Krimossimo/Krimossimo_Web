import { useId, useState } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { projectCategories, projectProgresses } from '../../types/content'
import { EditorActions, EditorFeedbackNotice, EditorStatus, FormSection, PublicationAndDate, SlugField } from '../components/EditorParts'
import { ImageField } from '../components/ImageField'
import { AdminHeading, BilingualField, ConfirmDialog, Field, inputClass } from '../components/ui'
import { useFieldError } from '../editorHooks'
import { emptyProjectForm, limits, projectFormFromDoc, projectInput, slugify, validateProjectForm } from '../forms'
import { RequireAdmin } from '../RequireAdmin'
import { useContentEditor } from '../useContentEditor'

const LIST = '/admin/projects'
const editPath = (id: string) => `${LIST}/${id}`

function ProjectEditor({ id }: { id: string | null }) {
  const { t } = useTranslation()
  const uid = useId()
  const editor = useContentEditor({
    collection: 'projects',
    id,
    empty: emptyProjectForm,
    fromDoc: projectFormFromDoc,
    validate: validateProjectForm,
    build: projectInput,
    folder: 'projects',
    listPath: LIST,
    editPath,
  })
  const { form, setForm, image, setImage, errors, busy, isNew } = editor
  const fieldError = useFieldError(errors)
  const [slugTouched, setSlugTouched] = useState(false)
  const [confirming, setConfirming] = useState(false)
  useDocumentTitle(isNew ? t('admin.projects.newTitle') : t('admin.projects.editTitle'))

  const heading = (
    <AdminHeading
      title={isNew ? t('admin.projects.newTitle') : t('admin.projects.editTitle')}
      back={{ to: LIST, label: t('admin.projects.title') }}
    />
  )
  if (editor.status !== 'ready') {
    return (
      <>
        {heading}
        <EditorStatus status={editor.status} loadError={editor.loadError} onRetry={editor.reload} listPath={LIST} />
      </>
    )
  }

  return (
    <>
      {heading}
      <form
        noValidate
        aria-busy={busy}
        className="mt-8 space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          void editor.submit()
        }}
      >
        <EditorFeedbackNotice feedback={editor.feedback} />

        <FormSection title={t('admin.projects.sections.main')}>
          <BilingualField
            id={`${uid}-title`}
            label={t('admin.projects.fields.title')}
            value={form.title}
            maxLength={limits.title}
            onChange={(title) => {
              setForm((f) => ({ ...f, title, id: isNew && !slugTouched ? slugify(title.fr) : f.id }))
            }}
            errors={{ fr: fieldError('title.fr'), en: fieldError('title.en') }}
          />
          <SlugField
            value={form.id}
            isNew={isNew}
            error={fieldError('id')}
            onChange={(value) => {
              setSlugTouched(true)
              setForm((f) => ({ ...f, id: value }))
            }}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id={`${uid}-category`} label={t('admin.projects.fields.category')}>
              <select
                id={`${uid}-category`}
                name="category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as typeof f.category }))}
                className={inputClass}
              >
                {projectCategories.map((c) => (
                  <option key={c} value={c}>
                    {t(`categories.${c}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={`${uid}-progress`} label={t('admin.projects.fields.progress')}>
              <select
                id={`${uid}-progress`}
                name="progress"
                value={form.progress}
                onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value as typeof f.progress }))}
                className={inputClass}
              >
                <option value="">{t('admin.projects.fields.progressNone')}</option>
                {projectProgresses.map((p) => (
                  <option key={p} value={p}>
                    {t(`projectStatus.${p}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <PublicationAndDate
            publication={form.publication}
            onPublication={(publication) => setForm((f) => ({ ...f, publication }))}
            date={form.createdAt}
            onDate={(createdAt) => setForm((f) => ({ ...f, createdAt }))}
            dateError={fieldError('createdAt')}
          />
        </FormSection>

        <FormSection title={t('admin.projects.sections.description')}>
          <BilingualField
            id={`${uid}-description`}
            label={t('admin.projects.fields.description')}
            hint={t('admin.projects.fields.descriptionHint')}
            multiline
            value={form.description}
            maxLength={limits.description}
            onChange={(description) => setForm((f) => ({ ...f, description }))}
            errors={{ fr: fieldError('description.fr'), en: fieldError('description.en') }}
          />
        </FormSection>

        <FormSection title={t('admin.projects.sections.image')}>
          <ImageField
            label={t('admin.projects.fields.image')}
            draft={image}
            onChange={setImage}
            alt={form.image.alt}
            onAltChange={(alt) => setForm((f) => ({ ...f, image: { ...f.image, alt } }))}
            altErrors={{ fr: fieldError('alt.fr'), en: fieldError('alt.en') }}
            error={fieldError('image')}
          />
        </FormSection>

        <FormSection title={t('admin.projects.sections.details')}>
          <Field id={`${uid}-url`} label={t('admin.projects.fields.externalUrl')} hint={t('admin.projects.fields.externalUrlHint')} error={fieldError('externalUrl')}>
            <input
              id={`${uid}-url`}
              name="externalUrl"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={form.externalUrl}
              onChange={(e) => setForm((f) => ({ ...f, externalUrl: e.target.value }))}
              aria-invalid={fieldError('externalUrl') ? true : undefined}
              className={inputClass}
            />
          </Field>
          <Field id={`${uid}-stack`} label={t('admin.projects.fields.stack')} hint={t('admin.projects.fields.stackHint')} error={fieldError('stack')}>
            <input
              id={`${uid}-stack`}
              name="stack"
              value={form.stack}
              onChange={(e) => setForm((f) => ({ ...f, stack: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 text-ink-soft">
            <input
              type="checkbox"
              name="featured"
              checked={form.featured}
              onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
              className="mt-0.5 size-5 shrink-0 accent-[var(--k-blue)]"
            />
            <span>
              <span className="font-medium text-ink">{t('admin.projects.fields.featured')}</span>
              <span className="block text-sm text-muted">{t('admin.projects.fields.featuredHint')}</span>
            </span>
          </label>
        </FormSection>

        <EditorActions busy={busy} listPath={LIST} onDelete={isNew ? undefined : () => setConfirming(true)} />
      </form>
      <ConfirmDialog
        open={confirming}
        title={t('admin.list.deleteTitle', { title: form.title.fr || form.id })}
        confirmLabel={t('admin.list.confirmDelete')}
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          const done = await editor.remove()
          if (!done) setConfirming(false)
        }}
      >
        <p>{t('admin.list.deleteText')}</p>
      </ConfirmDialog>
    </>
  )
}

export default function ProjectEditorPage() {
  const { id } = useParams()
  return (
    <RequireAdmin>
      <ProjectEditor key={id ?? 'new'} id={id ?? null} />
    </RequireAdmin>
  )
}

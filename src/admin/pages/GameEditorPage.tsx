import { useId, useState } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { currencies } from '../../types/content'
import { EditorActions, EditorFeedbackNotice, EditorStatus, FormSection, PublicationAndDate, SlugField } from '../components/EditorParts'
import { ImageField } from '../components/ImageField'
import { AdminHeading, BilingualField, ConfirmDialog, Field, inputClass } from '../components/ui'
import { useFieldError } from '../editorHooks'
import { emptyGameForm, gameFormFromDoc, gameInput, limits, slugify, validateGameForm } from '../forms'
import { RequireAdmin } from '../RequireAdmin'
import { useContentEditor } from '../useContentEditor'

const LIST = '/admin/games'
const editPath = (id: string) => `${LIST}/${id}`

function GameEditor({ id }: { id: string | null }) {
  const { t } = useTranslation()
  const uid = useId()
  const editor = useContentEditor({
    collection: 'games',
    id,
    empty: emptyGameForm,
    fromDoc: gameFormFromDoc,
    validate: validateGameForm,
    build: gameInput,
    folder: 'games',
    listPath: LIST,
    editPath,
  })
  const { form, setForm, image, setImage, errors, busy, isNew } = editor
  const fieldError = useFieldError(errors)
  const [slugTouched, setSlugTouched] = useState(false)
  const [confirming, setConfirming] = useState(false)
  useDocumentTitle(isNew ? t('admin.games.newTitle') : t('admin.games.editTitle'))

  const heading = <AdminHeading title={isNew ? t('admin.games.newTitle') : t('admin.games.editTitle')} back={{ to: LIST, label: t('admin.games.title') }} />
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

        <FormSection title={t('admin.games.sections.main')}>
          <BilingualField
            id={`${uid}-title`}
            label={t('admin.games.fields.title')}
            value={form.title}
            maxLength={limits.title}
            onChange={(title) => setForm((f) => ({ ...f, title, id: isNew && !slugTouched ? slugify(title.fr) : f.id }))}
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
          <BilingualField
            id={`${uid}-description`}
            label={t('admin.games.fields.description')}
            multiline
            value={form.description}
            maxLength={limits.description}
            onChange={(description) => setForm((f) => ({ ...f, description }))}
            errors={{ fr: fieldError('description.fr'), en: fieldError('description.en') }}
          />
          <PublicationAndDate
            publication={form.publication}
            onPublication={(publication) => setForm((f) => ({ ...f, publication }))}
            date={form.createdAt}
            onDate={(createdAt) => setForm((f) => ({ ...f, createdAt }))}
            dateError={fieldError('createdAt')}
          />
        </FormSection>

        <FormSection title={t('admin.games.sections.cover')}>
          <ImageField
            label={t('admin.games.fields.cover')}
            required
            draft={image}
            onChange={setImage}
            alt={form.image.alt}
            onAltChange={(alt) => setForm((f) => ({ ...f, image: { ...f.image, alt } }))}
            altErrors={{ fr: fieldError('alt.fr'), en: fieldError('alt.en') }}
            error={fieldError('image')}
          />
        </FormSection>

        <FormSection title={t('admin.games.sections.price')}>
          <fieldset>
            <legend className="mb-3 text-[0.95rem] font-semibold text-ink">{t('admin.games.fields.pricing')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['free', 'paid'] as const).map((p) => (
                <label
                  key={p}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 ${form.pricing === p ? 'border-blue bg-blue-tint' : 'border-line-strong'}`}
                >
                  <input
                    type="radio"
                    name="pricing"
                    value={p}
                    checked={form.pricing === p}
                    onChange={() => setForm((f) => ({ ...f, pricing: p }))}
                    className="accent-[var(--k-blue)]"
                  />
                  <span className="font-medium text-ink">{p === 'free' ? t('common.free') : t('games.paid')}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {form.pricing === 'paid' && (
            <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
              <Field id={`${uid}-amount`} label={t('admin.games.fields.priceAmount')} hint={t('admin.games.fields.priceAmountHint')} error={fieldError('priceAmount')}>
                <input
                  id={`${uid}-amount`}
                  name="priceAmount"
                  inputMode="decimal"
                  value={form.priceAmount}
                  onChange={(e) => setForm((f) => ({ ...f, priceAmount: e.target.value }))}
                  aria-invalid={fieldError('priceAmount') ? true : undefined}
                  className={inputClass}
                />
              </Field>
              <Field id={`${uid}-currency`} label={t('admin.shop.fields.currency')}>
                <select
                  id={`${uid}-currency`}
                  name="priceCurrency"
                  value={form.priceCurrency}
                  onChange={(e) => setForm((f) => ({ ...f, priceCurrency: e.target.value as typeof f.priceCurrency }))}
                  className={inputClass}
                >
                  {currencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </FormSection>

        <FormSection title={t('admin.games.sections.link')}>
          <Field id={`${uid}-url`} label={t('admin.games.fields.linkUrl')} error={fieldError('linkUrl')}>
            <input
              id={`${uid}-url`}
              name="linkUrl"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={form.linkUrl}
              onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
              aria-invalid={fieldError('linkUrl') ? true : undefined}
              className={inputClass}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id={`${uid}-kind`} label={t('admin.games.fields.linkKind')}>
              <select
                id={`${uid}-kind`}
                name="linkKind"
                value={form.linkKind}
                onChange={(e) => setForm((f) => ({ ...f, linkKind: e.target.value as typeof f.linkKind }))}
                className={inputClass}
              >
                <option value="store">{t('admin.games.kinds.store')}</option>
                <option value="download">{t('admin.games.kinds.download')}</option>
              </select>
            </Field>
            <Field id={`${uid}-store`} label={t('admin.games.fields.storeName')} hint={t('admin.games.fields.storeNameHint')} error={fieldError('storeName')}>
              <input
                id={`${uid}-store`}
                name="storeName"
                value={form.storeName}
                onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
                className={inputClass}
              />
            </Field>
          </div>
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

export default function GameEditorPage() {
  const { id } = useParams()
  return (
    <RequireAdmin>
      <GameEditor key={id ?? 'new'} id={id ?? null} />
    </RequireAdmin>
  )
}

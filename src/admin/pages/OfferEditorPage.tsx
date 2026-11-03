import { useId, useState } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { contactSubjects, currencies, offerAvailabilities } from '../../types/content'
import { EditorActions, EditorFeedbackNotice, EditorStatus, FormSection, PublicationAndDate, SlugField } from '../components/EditorParts'
import { AdminHeading, BilingualField, ConfirmDialog, Field, inputClass } from '../components/ui'
import { useFieldError } from '../editorHooks'
import { emptyOfferForm, limits, offerFormFromDoc, offerInput, priceModes, slugify, validateOfferForm, type OfferForm } from '../forms'
import { RequireAdmin } from '../RequireAdmin'
import { useContentEditor } from '../useContentEditor'

const LIST = '/admin/shop'
const editPath = (id: string) => `${LIST}/${id}`
const build = (form: OfferForm) => offerInput(form)

function OfferEditor({ id }: { id: string | null }) {
  const { t } = useTranslation()
  const uid = useId()
  const editor = useContentEditor({
    collection: 'offers',
    id,
    empty: emptyOfferForm,
    fromDoc: offerFormFromDoc,
    validate: validateOfferForm,
    build,
    folder: 'offers',
    listPath: LIST,
    editPath,
  })
  const { form, setForm, errors, busy, isNew } = editor
  const fieldError = useFieldError(errors)
  const [slugTouched, setSlugTouched] = useState(false)
  const [confirming, setConfirming] = useState(false)
  useDocumentTitle(isNew ? t('admin.shop.newTitle') : t('admin.shop.editTitle'))

  const heading = <AdminHeading title={isNew ? t('admin.shop.newTitle') : t('admin.shop.editTitle')} back={{ to: LIST, label: t('admin.shop.title') }} />
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

        <FormSection title={t('admin.shop.sections.main')}>
          <BilingualField
            id={`${uid}-title`}
            label={t('admin.shop.fields.title')}
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
            label={t('admin.shop.fields.description')}
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

        <FormSection title={t('admin.shop.sections.price')}>
          <fieldset>
            <legend className="mb-3 text-[0.95rem] font-semibold text-ink">{t('admin.shop.fields.priceMode')}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {priceModes.map((mode) => (
                <label
                  key={mode}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 ${form.priceMode === mode ? 'border-blue bg-blue-tint' : 'border-line-strong'}`}
                >
                  <input
                    type="radio"
                    name="priceMode"
                    value={mode}
                    checked={form.priceMode === mode}
                    onChange={() => setForm((f) => ({ ...f, priceMode: mode }))}
                    className="mt-1 accent-[var(--k-blue)]"
                  />
                  <span>
                    <span className="block font-medium text-ink">{t(`admin.shop.priceModes.${mode}.label`)}</span>
                    <span className="block text-sm text-muted">{t(`admin.shop.priceModes.${mode}.hint`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
            <Field id={`${uid}-price`} label={t('admin.shop.fields.price')} hint={t('admin.shop.fields.priceHint')} error={fieldError('price')}>
              <input
                id={`${uid}-price`}
                name="price"
                inputMode="decimal"
                value={form.price}
                disabled={form.priceMode === 'quote'}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                aria-invalid={fieldError('price') ? true : undefined}
                className={`${inputClass} disabled:bg-surface disabled:text-muted`}
              />
            </Field>
            <Field id={`${uid}-currency`} label={t('admin.shop.fields.currency')}>
              <select
                id={`${uid}-currency`}
                name="currency"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as typeof f.currency }))}
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
          <Field id={`${uid}-max`} label={t('admin.shop.fields.maxQuantity')} hint={t('admin.shop.fields.maxQuantityHint')} error={fieldError('maxQuantity')}>
            <input
              id={`${uid}-max`}
              name="maxQuantity"
              inputMode="numeric"
              value={form.maxQuantity}
              onChange={(e) => setForm((f) => ({ ...f, maxQuantity: e.target.value }))}
              aria-invalid={fieldError('maxQuantity') ? true : undefined}
              className={`${inputClass} sm:max-w-48`}
            />
          </Field>
        </FormSection>

        <FormSection title={t('admin.shop.sections.availability')}>
          <fieldset>
            <legend className="sr-only">{t('admin.shop.fields.availability')}</legend>
            <div className="grid gap-2 lg:grid-cols-3">
              {offerAvailabilities.map((a) => (
                <label
                  key={a}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 ${form.availability === a ? 'border-blue bg-blue-tint' : 'border-line-strong'}`}
                >
                  <input
                    type="radio"
                    name="availability"
                    value={a}
                    checked={form.availability === a}
                    onChange={() => setForm((f) => ({ ...f, availability: a }))}
                    className="mt-1 accent-[var(--k-blue)]"
                  />
                  <span>
                    <span className="block font-medium text-ink">{t(`admin.shop.availabilities.${a}.label`)}</span>
                    <span className="block text-sm text-muted">{t(`admin.shop.availabilities.${a}.hint`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <BilingualField
            id={`${uid}-conditions`}
            label={t('admin.shop.fields.conditions')}
            required={false}
            multiline
            value={form.conditions}
            maxLength={limits.conditions}
            onChange={(conditions) => setForm((f) => ({ ...f, conditions }))}
            errors={{ fr: fieldError('conditions.fr'), en: fieldError('conditions.en') }}
          />
          <Field id={`${uid}-subject`} label={t('admin.shop.fields.contactSubject')} hint={t('admin.shop.fields.contactSubjectHint')}>
            <select
              id={`${uid}-subject`}
              name="contactSubject"
              value={form.contactSubject}
              onChange={(e) => setForm((f) => ({ ...f, contactSubject: e.target.value as typeof f.contactSubject }))}
              className={`${inputClass} sm:max-w-sm`}
            >
              {contactSubjects.map((s) => (
                <option key={s} value={s}>
                  {t(`contact.subjects.${s}`)}
                </option>
              ))}
            </select>
          </Field>
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
        <p>{t('admin.shop.deleteText')}</p>
      </ConfirmDialog>
    </>
  )
}

export default function OfferEditorPage() {
  const { id } = useParams()
  return (
    <RequireAdmin>
      <OfferEditor key={id ?? 'new'} id={id ?? null} />
    </RequireAdmin>
  )
}

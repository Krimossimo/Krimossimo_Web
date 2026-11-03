import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { assetUrl } from '../../hooks/useLocale'
import { checkImageFile, type ImageCheck } from '../upload'
import { ImageIcon } from './icons'
import { BilingualField, Button } from './ui'

export type ImageDraft = {
  /** Image enregistrée actuellement ('' = aucune). */
  currentSrc: string
  /** Nouveau fichier choisi, envoyé à l'enregistrement. */
  file: File | null
  /** L'image actuelle sera retirée à l'enregistrement. */
  remove: boolean
}

/**
 * Choix de l'image d'un contenu : aperçu, remplacement, retrait, texte alternatif.
 * Aucun envoi n'a lieu ici : le fichier part vers Storage au moment de l'enregistrement,
 * et l'ancienne image n'est supprimée qu'après un enregistrement réussi.
 */
export function ImageField({
  label,
  draft,
  onChange,
  alt,
  onAltChange,
  altErrors,
  error,
  required = false,
}: {
  label: string
  draft: ImageDraft
  onChange: (draft: ImageDraft) => void
  alt: { fr: string; en: string }
  onAltChange: (alt: { fr: string; en: string }) => void
  altErrors: { fr?: string | null; en?: string | null }
  error?: string | null
  required?: boolean
}) {
  const { t } = useTranslation()
  const id = useId()
  const [fileError, setFileError] = useState<Exclude<ImageCheck, null> | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [inputKey, setInputKey] = useState(0)

  useEffect(() => {
    if (!draft.file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(draft.file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [draft.file])

  const shown = preview ?? (!draft.remove && draft.currentSrc ? assetUrl(draft.currentSrc) : null)
  const hasImage = Boolean(draft.file) || (Boolean(draft.currentSrc) && !draft.remove)

  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 text-[0.95rem] font-semibold text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="text-blue">
            {' '}
            *
          </span>
        )}
      </legend>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex aspect-[16/10] w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface sm:w-60">
          {shown ? (
            <img src={shown} alt={t('admin.image.preview')} className="size-full object-cover" data-testid="image-preview" />
          ) : (
            <span className="flex flex-col items-center gap-2 text-sm text-muted">
              <ImageIcon className="size-7" />
              {t('admin.image.none')}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <label htmlFor={`${id}-file`} className="mb-2 block text-sm font-medium text-ink-soft">
              {hasImage ? t('admin.image.replace') : t('admin.image.choose')}
            </label>
            <input
              key={inputKey}
              id={`${id}-file`}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
              aria-describedby={`${id}-hint`}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                if (!file) return
                const problem = checkImageFile(file)
                if (problem) {
                  setFileError(problem)
                  setInputKey((k) => k + 1)
                  return
                }
                setFileError(null)
                onChange({ ...draft, file, remove: false })
              }}
              className="block w-full text-[0.93rem] text-ink-soft file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-xl file:border file:border-line-strong file:bg-raised file:px-4 file:font-medium file:text-ink"
            />
            <p id={`${id}-hint`} className="mt-2 text-sm text-muted">
              {t('admin.image.hint')}
            </p>
          </div>
          {draft.file && (
            <p className="text-sm text-ink-soft" role="status">
              {t('admin.image.pending', { name: draft.file.name })}
            </p>
          )}
          {draft.remove && (
            <p className="text-sm text-ink-soft" role="status">
              {t('admin.image.willRemove')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {draft.file && (
              <Button
                variant="secondary"
                onClick={() => {
                  onChange({ ...draft, file: null })
                  setInputKey((k) => k + 1)
                }}
              >
                {t('admin.image.undo')}
              </Button>
            )}
            {!draft.file && draft.currentSrc && !draft.remove && !required && (
              <Button variant="secondary" onClick={() => onChange({ ...draft, remove: true })}>
                {t('admin.image.remove')}
              </Button>
            )}
            {draft.remove && (
              <Button variant="secondary" onClick={() => onChange({ ...draft, remove: false })}>
                {t('admin.image.keep')}
              </Button>
            )}
          </div>
          {(fileError || error) && (
            <p role="alert" className="text-sm text-danger">
              {fileError ? t(`admin.image.errors.${fileError}`) : error}
            </p>
          )}
        </div>
      </div>
      {hasImage && (
        <BilingualField
          id={`${id}-alt`}
          label={t('admin.image.alt')}
          hint={t('admin.image.altHint')}
          value={alt}
          onChange={onAltChange}
          errors={altErrors}
        />
      )}
    </fieldset>
  )
}

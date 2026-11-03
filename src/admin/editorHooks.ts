import { useTranslation } from 'react-i18next'
import type { FieldError, FormErrors } from './forms'
import type { CleanupResult } from './images'

/** Message d'erreur traduit pour un champ. */
export function useFieldError(errors: FormErrors) {
  const { t } = useTranslation()
  return (key: string): string | null => {
    const error: FieldError | undefined = errors[key]
    if (!error) return null
    if (error.code === 'tooLong') return t('admin.form.errors.tooLong', { max: error.max })
    return t(`admin.form.errors.${error.code}`)
  }
}

/** Message affiché après un nettoyage d'image (rien quand il n'y avait rien à faire). */
export function useCleanupText() {
  const { t } = useTranslation()
  return (cleanup: CleanupResult | string | null | undefined): string | null =>
    cleanup === 'deleted' || cleanup === 'in-use' || cleanup === 'failed' ? t(`admin.cleanup.${cleanup}`) : null
}


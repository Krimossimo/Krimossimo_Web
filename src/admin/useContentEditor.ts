import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAdminSession } from './admin-context'
import { getContent } from './adminStore'
import { saveContentEntry, actionErrorCode, deleteContentEntry, type ActionErrorCode, type ContentCollection } from './contentActions'
import { contentDeps } from './contentDeps'
import type { FormErrors, ImageFormValue } from './forms'
import type { CleanupResult } from './images'
import type { ImageDraft } from './components/ImageField'
import type { ImageFolder } from './upload'

export type EditorFeedback =
  | { kind: 'saved'; created: boolean; cleanup: CleanupResult | null }
  | { kind: 'form-errors' }
  | { kind: 'invalid'; details: string[] }
  | { kind: 'upload' | 'save' | 'delete'; code: ActionErrorCode }

type Form = { id: string; image?: ImageFormValue }

export type EditorConfig<F extends Form> = {
  collection: ContentCollection
  /** null = création. */
  id: string | null
  empty: () => F
  fromDoc: (id: string, data: Record<string, unknown>) => F
  validate: (form: F, options: { hasNewFile: boolean }) => FormErrors
  build: (form: F, imageSrc: string) => Record<string, unknown>
  folder: ImageFolder
  listPath: string
  editPath: (id: string) => string
}

const noImage: ImageDraft = { currentSrc: '', file: null, remove: false }

/**
 * État d'un éditeur de contenu : chargement du document, formulaire, image, enregistrement
 * (protégé contre les doubles envois) et suppression.
 */
export function useContentEditor<F extends Form>(config: EditorConfig<F>) {
  const session = useAdminSession()
  const navigate = useNavigate()
  const { collection, id, empty, fromDoc, validate, build, folder, listPath, editPath } = config
  const isNew = id === null
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>(isNew ? 'ready' : 'loading')
  const [loadError, setLoadError] = useState<ActionErrorCode | null>(null)
  const [form, setForm] = useState<F>(empty)
  const [image, setImage] = useState<ImageDraft>(noImage)
  const [errors, setErrors] = useState<FormErrors>({})
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<EditorFeedback | null>(null)
  const busyRef = useRef(false)

  const load = useCallback(async () => {
    if (id === null) return
    setStatus('loading')
    try {
      const doc = await getContent(collection, id)
      if (!doc) {
        setStatus('missing')
        return
      }
      const next = fromDoc(doc.id, doc.data)
      setForm(next)
      setImage({ currentSrc: next.image?.src ?? '', file: null, remove: false })
      setStatus('ready')
    } catch (error) {
      setLoadError(actionErrorCode(error))
      setStatus('error')
    }
  }, [collection, id, fromDoc])

  useEffect(() => {
    void load()
  }, [load])

  const effectiveSrc = image.remove ? '' : image.currentSrc
  const withImage = (f: F): F => (f.image ? { ...f, image: { ...f.image, src: effectiveSrc } } : f)

  const submit = async () => {
    if (busyRef.current) return
    const found = validate(withImage(form), { hasNewFile: Boolean(image.file) })
    setErrors(found)
    if (Object.keys(found).length) {
      setFeedback({ kind: 'form-errors' })
      return
    }
    busyRef.current = true
    setBusy(true)
    setFeedback(null)
    try {
      const result = await saveContentEntry(contentDeps(session.uid), {
        collection,
        id: form.id,
        isNew,
        build: (src) => build(withImage(form), src),
        previousSrc: image.currentSrc,
        keepSrc: effectiveSrc,
        file: image.file,
        folder,
      })
      if (result.ok) {
        setImage({ currentSrc: result.imageSrc, file: null, remove: false })
        setForm((f) => (f.image ? { ...f, image: { ...f.image, src: result.imageSrc } } : f))
        setFeedback({ kind: 'saved', created: isNew, cleanup: result.cleanup })
        if (isNew) navigate(`${editPath(result.id)}?created=1`, { replace: true })
      } else if (result.reason === 'slug-taken') {
        setErrors({ id: { code: 'slugTaken' } })
        setFeedback({ kind: 'form-errors' })
      } else if (result.reason === 'invalid') {
        setFeedback({ kind: 'invalid', details: result.errors })
      } else {
        setFeedback({ kind: result.reason, code: result.code })
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const remove = async (): Promise<boolean> => {
    if (busyRef.current || id === null) return false
    busyRef.current = true
    setBusy(true)
    try {
      const result = await deleteContentEntry(contentDeps(session.uid), collection, id, image.currentSrc)
      if (!result.ok) {
        setFeedback({ kind: 'delete', code: result.code })
        return false
      }
      navigate(`${listPath}?deleted=${encodeURIComponent(id)}${result.cleanup ? `&cleanup=${result.cleanup}` : ''}`)
      return true
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return { isNew, status, loadError, reload: load, form, setForm, image, setImage, errors, setErrors, busy, feedback, setFeedback, submit, remove }
}

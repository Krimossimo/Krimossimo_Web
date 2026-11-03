import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { assetUrl } from '../../hooks/useLocale'
import { useAdminSession } from '../admin-context'
import { listCollection, updateContent, type RawDoc } from '../adminStore'
import { actionErrorCode, deleteContentEntry, type ContentCollection } from '../contentActions'
import { checkStoredDocument, displayTitle, publicationUpdate } from '../contentAdmin'
import { contentDeps } from '../contentDeps'
import { useCleanupText } from '../editorHooks'
import { useAdminData } from '../useAdminData'
import { ImageIcon } from './icons'
import { AdminHeading, Badge, Button, ConfirmDialog, LinkButton, Notice } from './ui'

export type RowInfo = {
  meta?: ReactNode
  badges?: ReactNode
  imageSrc?: string
}

type Props = {
  collection: ContentCollection
  title: string
  lead: string
  newLabel: string
  basePath: string
  describe: (doc: RawDoc) => RowInfo
  emptyText: string
}

type Flash = { tone: 'success' | 'error'; text: string } | null

const createdAtOf = (doc: RawDoc) => {
  const v = doc.data.createdAt
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && 'seconds' in v) return new Date((v as { seconds: number }).seconds * 1000).toISOString()
  return ''
}

/** Liste d'administration d'une collection : publication, modification, suppression confirmée. */
export function ContentList({ collection, title, lead, newLabel, basePath, describe, emptyText }: Props) {
  const { t } = useTranslation()
  const session = useAdminSession()
  const cleanupText = useCleanupText()
  const [params, setParams] = useSearchParams()
  const load = useCallback(async () => (await listCollection(collection)).sort((a, b) => createdAtOf(b).localeCompare(createdAtOf(a))), [collection])
  const { state, reload } = useAdminData(load)
  const [busyId, setBusyId] = useState<string | null>(null)
  const busyRef = useRef(false)
  const [pendingDelete, setPendingDelete] = useState<RawDoc | null>(null)
  const [flash, setFlash] = useState<Flash>(() => {
    const deleted = params.get('deleted')
    if (!deleted) return null
    const cleanup = cleanupText(params.get('cleanup'))
    return { tone: 'success', text: `${t('admin.list.deleted', { id: deleted })}${cleanup ? ` ${cleanup}` : ''}` }
  })

  const run = async (id: string, task: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusyId(id)
    try {
      await task()
    } finally {
      busyRef.current = false
      setBusyId(null)
    }
  }

  const togglePublication = (doc: RawDoc) =>
    run(doc.id, async () => {
      const next = doc.data.publication === 'published' ? 'draft' : 'published'
      try {
        await updateContent(collection, doc.id, publicationUpdate(next, session.uid))
        setFlash({ tone: 'success', text: t(next === 'published' ? 'admin.list.publishedDone' : 'admin.list.unpublishedDone', { title: displayTitle(doc.data, doc.id) }) })
        reload()
      } catch (error) {
        setFlash({ tone: 'error', text: `${t('admin.list.publicationFailed')} ${t(`admin.form.reasons.${actionErrorCode(error)}`)}` })
      }
    })

  const confirmDelete = () => {
    const doc = pendingDelete
    if (!doc) return
    void run(doc.id, async () => {
      const src = describe(doc).imageSrc ?? ''
      const result = await deleteContentEntry(contentDeps(session.uid), collection, doc.id, src)
      setPendingDelete(null)
      if (params.get('deleted')) setParams({}, { replace: true })
      if (result.ok) {
        const cleanup = cleanupText(result.cleanup)
        setFlash({ tone: 'success', text: `${t('admin.list.deleted', { id: doc.id })}${cleanup ? ` ${cleanup}` : ''}` })
        reload()
      } else {
        setFlash({ tone: 'error', text: `${t('admin.list.deleteFailed')} ${t(`admin.form.reasons.${result.code}`)}` })
      }
    })
  }

  return (
    <>
      <AdminHeading
        title={title}
        lead={lead}
        actions={
          <LinkButton to={`${basePath}/new`}>
            <span aria-hidden="true">+</span> {newLabel}
          </LinkButton>
        }
      />
      <div className="mt-8">
        {flash && (
          <Notice tone={flash.tone} className="mb-5">
            {flash.text}
          </Notice>
        )}
        {state.status === 'loading' && (
          <p role="status" className="text-muted">
            {t('admin.form.loading')}
          </p>
        )}
        {state.status === 'error' && (
          <Notice tone="error">
            {t(`admin.dataErrors.${state.code}`)}{' '}
            <button type="button" onClick={reload} className="font-semibold underline underline-offset-4">
              {t('admin.retry')}
            </button>
          </Notice>
        )}
        {state.status === 'ready' &&
          (state.data.length === 0 ? (
            <div className="rounded-[1.25rem] border border-dashed border-line-strong bg-raised px-6 py-10 text-center">
              <p className="text-ink-soft">{emptyText}</p>
              <LinkButton to={`${basePath}/new`} className="mt-4">
                {newLabel}
              </LinkButton>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-[1.25rem] border border-line bg-raised" data-testid="content-list">
              {state.data.map((doc) => {
                const info = describe(doc)
                const name = displayTitle(doc.data, doc.id)
                const published = doc.data.publication === 'published'
                const problems = checkStoredDocument(collection, doc.id, doc.data)
                return (
                  <li key={doc.id} data-doc-id={doc.id} className="flex flex-col gap-4 border-b border-line p-4 last:border-b-0 sm:flex-row sm:items-center sm:p-5">
                    <div className="flex min-w-0 flex-1 items-start gap-4">
                      <div className="hidden size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface sm:flex">
                        {info.imageSrc ? (
                          <img src={assetUrl(info.imageSrc)} alt="" className="size-full object-cover" />
                        ) : (
                          <ImageIcon className="size-5 text-muted" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">
                          <Link to={`${basePath}/${doc.id}`} className="hover:text-blue">
                            {name}
                          </Link>
                        </p>
                        <p className="mt-0.5 break-all font-mono text-[0.8rem] text-muted">{doc.id}</p>
                        {info.meta && <div className="mt-1.5 text-sm text-ink-soft">{info.meta}</div>}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge tone={published ? 'solid' : 'neutral'}>{published ? t('admin.list.published') : t('admin.list.draft')}</Badge>
                          {info.badges}
                        </div>
                        {problems.length > 0 && (
                          <p className="mt-2 text-sm text-danger" title={problems.join(' ; ')}>
                            {t('admin.list.invalid')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2" aria-label={t('admin.list.actions', { title: name })} role="group">
                      <LinkButton to={`${basePath}/${doc.id}`} variant="secondary">
                        {t('admin.list.edit')}
                      </LinkButton>
                      <Button variant="secondary" busy={busyId === doc.id} disabled={busyId !== null && busyId !== doc.id} onClick={() => togglePublication(doc)}>
                        {published ? t('admin.list.unpublish') : t('admin.list.publish')}
                      </Button>
                      <Button variant="ghost" className="text-danger hover:text-danger" disabled={busyId !== null} onClick={() => setPendingDelete(doc)}>
                        {t('admin.list.delete')}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ))}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? t('admin.list.deleteTitle', { title: displayTitle(pendingDelete.data, pendingDelete.id) }) : ''}
        confirmLabel={t('admin.list.confirmDelete')}
        busy={busyId !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      >
        <p>{t('admin.list.deleteText')}</p>
      </ConfirmDialog>
    </>
  )
}

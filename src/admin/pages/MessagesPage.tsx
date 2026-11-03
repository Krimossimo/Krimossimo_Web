import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { formatDate, useLocale } from '../../hooks/useLocale'
import { AdminApiError, type MessageStatus } from '../adminApi'
import { mailtoHref, parseAdminMessage, type AdminMessage } from '../adminData'
import { listLatest } from '../adminStore'
import { adminClient } from '../client'
import { AdminHeading, Badge, Button, Card, Notice } from '../components/ui'
import { RequireAdmin } from '../RequireAdmin'
import { useAdminData } from '../useAdminData'

async function loadMessages() {
  const docs = await listLatest('contactMessages')
  return docs.map((d) => parseAdminMessage(d.id, d.data)).filter((m): m is AdminMessage => m !== null)
}

const actions: Record<MessageStatus, MessageStatus[]> = { new: ['read', 'archived'], read: ['archived', 'new'], archived: ['new'] }
const actionLabel: Record<MessageStatus, string> = { read: 'markRead', archived: 'archive', new: 'reopen' }

function MessageCard({ message, onStatus }: { message: AdminMessage; onStatus: (status: MessageStatus) => void }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const subject = t(`contact.subjects.${message.subject}`, { defaultValue: message.subject })

  return (
    <li>
      <Card className={`p-5 sm:p-6 ${message.status === 'archived' ? 'opacity-75' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[1.05rem] font-semibold">
              {message.firstName} {message.lastName}
            </p>
            <p className="text-sm text-muted">
              {message.email}
              {message.createdAt && ` · ${formatDate(message.createdAt, locale)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2" data-testid="message-badges">
            <Badge tone={message.status === 'new' ? 'blue' : 'neutral'}>{t(`admin.messages.statuses.${message.status}`)}</Badge>
            {message.delivery && message.delivery !== 'sent' && (
              <Badge tone={message.delivery === 'failed' ? 'danger' : 'neutral'}>{t(`admin.messages.delivery.${message.delivery}`)}</Badge>
            )}
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold text-ink-soft">{t('admin.messages.subject', { subject })}</p>
        <p className="mt-2 whitespace-pre-line text-ink">{message.message}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href={mailtoHref(message.email, `Re: ${subject}`)}
            className="inline-flex min-h-11 items-center rounded-xl bg-blue px-4 text-[0.95rem] font-medium text-on-blue transition-colors hover:bg-blue-hover"
          >
            {t('admin.messages.reply')}
          </a>
          {adminClient.isConfigured &&
            actions[message.status].map((next) => (
              <Button
                key={next}
                variant="secondary"
                busy={busy}
                onClick={async () => {
                  setBusy(true)
                  setError(null)
                  try {
                    onStatus(await adminClient.updateMessageStatus(message.id, next))
                  } catch (err) {
                    setError(t(`admin.apiErrors.${err instanceof AdminApiError ? err.code : 'server'}`))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {t(`admin.messages.${actionLabel[next]}`)}
              </Button>
            ))}
        </div>
        {error && (
          <Notice tone="error" className="mt-3">
            {error}
          </Notice>
        )}
      </Card>
    </li>
  )
}

function Messages() {
  const { t } = useTranslation()
  useDocumentTitle(t('admin.messages.title'))
  const load = useCallback(loadMessages, [])
  const { state, reload, setState } = useAdminData(load)

  return (
    <>
      <AdminHeading title={t('admin.messages.title')} lead={t('admin.messages.lead')} />
      <div className="mt-10">
        {!adminClient.isConfigured && (
          <Notice tone="info" className="mb-5">
            {t('admin.apiErrors.not-configured')}
          </Notice>
        )}
        {state.status === 'loading' && (
          <p role="status" className="text-muted">
            {t('content.loading')}
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
            <p className="text-ink-soft">{t('admin.messages.empty')}</p>
          ) : (
            <ul className="grid gap-5">
              {state.data.map((message) => (
                <MessageCard
                  key={message.id}
                  message={message}
                  onStatus={(status) =>
                    setState({ status: 'ready', data: state.data.map((m) => (m.id === message.id ? { ...m, status } : m)) })
                  }
                />
              ))}
            </ul>
          ))}
      </div>
    </>
  )
}

export default function MessagesPage() {
  return (
    <RequireAdmin>
      <Messages />
    </RequireAdmin>
  )
}

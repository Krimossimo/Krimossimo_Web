import { useCallback, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { formatCents, formatDate, useLocale } from '../../hooks/useLocale'
import { AdminApiError, fulfillmentStatuses, type FulfillmentStatus } from '../adminApi'
import { hasFulfillment, mailtoHref, parseAdminOrder, type AdminOrder } from '../adminData'
import { listLatest } from '../adminStore'
import { adminClient } from '../client'
import { AdminHeading, Badge, Button, Card, Field, Notice, inputClass } from '../components/ui'
import { RequireAdmin } from '../RequireAdmin'
import { useAdminData } from '../useAdminData'

const paymentTone = { created: 'neutral', payment_pending: 'blue', paid: 'solid', payment_failed: 'danger', cancelled: 'neutral' } as const

async function loadOrders() {
  const docs = await listLatest('orders')
  const orders = docs.map((d) => parseAdminOrder(d.id, d.data))
  return { orders: orders.filter((o): o is AdminOrder => o !== null), invalid: orders.filter((o) => o === null).length }
}

function FulfillmentForm({ order, onSaved }: { order: AdminOrder; onSaved: (value: FulfillmentStatus, note: string) => void }) {
  const { t } = useTranslation()
  const id = useId()
  const [value, setValue] = useState<FulfillmentStatus>(order.fulfillment)
  const [note, setNote] = useState(order.fulfillmentNote ?? '')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  if (!hasFulfillment(order)) return <p className="text-sm text-muted">{t('admin.orders.notPaid')}</p>
  if (!adminClient.isConfigured) return <p className="text-sm text-muted">{t('admin.orders.functionsMissing')}</p>

  return (
    <form
      className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-end"
      aria-busy={busy}
      onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        setFeedback(null)
        try {
          const saved = await adminClient.updateOrderFulfillment(order.id, value, note.trim() || undefined)
          onSaved(saved, note.trim())
          setFeedback({ tone: 'success', text: t('admin.orders.saved') })
        } catch (error) {
          setFeedback({ tone: 'error', text: t(`admin.apiErrors.${error instanceof AdminApiError ? error.code : 'server'}`) })
        } finally {
          setBusy(false)
        }
      }}
    >
      <Field id={`${id}-status`} label={t('admin.orders.fulfillment')}>
        <select id={`${id}-status`} value={value} onChange={(e) => setValue(e.target.value as FulfillmentStatus)} className={inputClass}>
          {fulfillmentStatuses.map((s) => (
            <option key={s} value={s}>
              {t(`admin.orders.fulfillments.${s}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${id}-note`} label={t('admin.orders.note')}>
        <input id={`${id}-note`} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" busy={busy}>
          {busy ? t('admin.orders.saving') : t('admin.orders.save')}
        </Button>
        {feedback && (
          <Notice tone={feedback.tone} className="mt-3">
            {feedback.text}
          </Notice>
        )}
      </div>
    </form>
  )
}

function OrderCard({ order, onChange }: { order: AdminOrder; onChange: (order: AdminOrder) => void }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const c = order.customer
  return (
    <li>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">
              {t('admin.orders.number', { id: order.id })}
              {order.createdAt && ` · ${formatDate(order.createdAt, locale)}`}
            </p>
            <p className="mt-1 text-[1.1rem] font-semibold text-ink">
              {c.firstName} {c.lastName}
            </p>
            <a href={mailtoHref(c.email, t('admin.orders.number', { id: order.id }))} className="text-[0.95rem] text-blue underline-offset-4 hover:underline">
              {c.email}
            </a>
          </div>
          <div className="sm:text-right">
            <p className="font-display text-[1.4rem] font-semibold tracking-[-0.02em]">{formatCents(order.totalCents, order.currency, locale)}</p>
            <div className="mt-1 flex flex-wrap gap-2 sm:justify-end" data-testid="order-badges">
              <Badge tone={paymentTone[order.status]}>{t(`order.status.${order.status}`)}</Badge>
              {order.paymentEnv === 'sandbox' && <Badge>{t('admin.orders.sandbox')}</Badge>}
              {hasFulfillment(order) && <Badge>{t(`admin.orders.fulfillments.${order.fulfillment}`)}</Badge>}
            </div>
          </div>
        </div>

        {(order.alerts.length > 0 || order.lateCapture) && (
          <div className="mt-4 space-y-2" data-testid="order-alerts">
            {order.alerts.map((alert, i) => (
              <Notice key={i} tone="error">
                {alert.kind === 'duplicate_capture' ? t('admin.orders.alertDuplicate', { id: alert.captureId ?? '—' }) : t('admin.orders.alertMismatch')}
              </Notice>
            ))}
            {order.lateCapture && <Notice tone="info">{t('admin.orders.lateCapture')}</Notice>}
          </div>
        )}

        <details className="mt-4 rounded-xl border border-line px-4 py-3">
          <summary className="cursor-pointer font-medium text-ink">{t('admin.orders.details')}</summary>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.95rem] sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">{t('admin.orders.items')}</dt>
            <dd>
              <ul>
                {order.items.map((item) => (
                  <li key={item.offerId}>
                    {item.title}
                    {item.quantity > 1 && ` × ${item.quantity}`} — {formatCents(item.unitCents * item.quantity, order.currency, locale)}
                  </li>
                ))}
              </ul>
            </dd>
            {order.paypalCaptureId && (
              <>
                <dt className="text-muted">{t('admin.orders.captureId')}</dt>
                <dd className="break-all font-mono text-[0.85rem]">{order.paypalCaptureId}</dd>
              </>
            )}
            {order.failureReason && (
              <>
                <dt className="text-muted">{t('admin.orders.failure')}</dt>
                <dd className="font-mono text-[0.85rem]">{order.failureReason}</dd>
              </>
            )}
            <dt className="text-muted">{t('admin.orders.country')}</dt>
            <dd>{c.country}</dd>
            {c.phone && (
              <>
                <dt className="text-muted">{t('admin.orders.phone')}</dt>
                <dd>{c.phone}</dd>
              </>
            )}
            {c.company && (
              <>
                <dt className="text-muted">{t('admin.orders.company')}</dt>
                <dd>{c.company}</dd>
              </>
            )}
            <dt className="text-muted">{t('admin.orders.project')}</dt>
            <dd className="whitespace-pre-line">{order.project.details}</dd>
            {order.project.referenceUrl && (
              <>
                <dt className="text-muted">{t('admin.orders.reference')}</dt>
                {/* Lien saisi par un client : affiché comme texte, jamais rendu cliquable. */}
                <dd className="break-all">{order.project.referenceUrl}</dd>
              </>
            )}
            {order.project.deadline && (
              <>
                <dt className="text-muted">{t('admin.orders.deadline')}</dt>
                <dd>{t(`checkout.deadlines.${order.project.deadline}`, { defaultValue: order.project.deadline })}</dd>
              </>
            )}
          </dl>
        </details>

        <div className="mt-5">
          <FulfillmentForm order={order} onSaved={(fulfillment, note) => onChange({ ...order, fulfillment, fulfillmentNote: note || undefined })} />
        </div>
      </Card>
    </li>
  )
}

function Orders() {
  const { t } = useTranslation()
  useDocumentTitle(t('admin.orders.title'))
  const load = useCallback(loadOrders, [])
  const { state, reload, setState } = useAdminData(load)

  return (
    <>
      <AdminHeading title={t('admin.orders.title')} lead={t('admin.orders.lead')} />
      <div className="mt-10">
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
        {state.status === 'ready' && (
          <>
            {state.data.invalid > 0 && (
              <Notice tone="info" className="mb-5">
                {t('admin.orders.invalid', { count: state.data.invalid })}
              </Notice>
            )}
            {state.data.orders.length === 0 ? (
              <p className="text-ink-soft">{t('admin.orders.empty')}</p>
            ) : (
              <ul className="grid gap-5">
                {state.data.orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onChange={(updated) =>
                      setState({
                        status: 'ready',
                        data: { ...state.data, orders: state.data.orders.map((o) => (o.id === updated.id ? updated : o)) },
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  )
}

export default function OrdersPage() {
  return (
    <RequireAdmin>
      <Orders />
    </RequireAdmin>
  )
}

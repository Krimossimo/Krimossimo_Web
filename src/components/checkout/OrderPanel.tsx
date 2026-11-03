import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { OrderApiError, isUnconfirmed, ordersClient, type OrderStatus, type PaymentState, type ServerOrder } from '../../lib/orders'
import { formatCents, useLocale } from '../../hooks/useLocale'
import { ButtonLink } from '../ui/ButtonLink'
import { AlertIcon, CheckIcon, InfoIcon } from '../ui/Icons'
import type { PaymentErrorCode } from './PayPalPayment'

// Le SDK PayPal n'est téléchargé que lorsqu'une commande serveur existe.
const PayPalPayment = lazy(() => import('./PayPalPayment'))

const payable: OrderStatus[] = ['created', 'payment_pending', 'payment_failed', 'cancelled']
/** Erreurs après lesquelles la commande ne peut plus être payée telle quelle : il faut la recommencer. */
const needsNewOrder: PaymentErrorCode[] = ['price-changed', 'order-expired', 'env-mismatch', 'offer-unavailable', 'too-many-attempts']

const tone: Record<OrderStatus, string> = {
  created: 'border-blue bg-blue-tint text-ink',
  payment_pending: 'border-blue bg-blue-tint text-ink',
  paid: 'border-blue bg-blue text-on-blue',
  payment_failed: 'border-danger bg-danger-tint text-danger',
  cancelled: 'border-line-strong bg-surface text-ink-soft',
}

type Props = {
  order: ServerOrder
  payment: PaymentState
  priceChanged: boolean
  paymentError: PaymentErrorCode | null
  onState: (state: PaymentState) => void
  onPaymentError: (code: PaymentErrorCode | null) => void
  onRestart: () => void
}

const buttonPrimary =
  'inline-flex min-h-12 items-center justify-center rounded-xl bg-blue px-5 font-medium text-on-blue transition-colors hover:bg-blue-hover disabled:opacity-60'
const buttonSecondary =
  'inline-flex min-h-12 items-center justify-center rounded-xl border border-line-strong px-5 font-medium text-ink transition-colors hover:border-ink disabled:opacity-60'

/** Commande créée par le serveur : statut réel, montant figé, coordonnées, paiement. */
export function OrderPanel({ order, payment, priceChanged, paymentError, onState, onPaymentError, onRestart }: Props) {
  const { t } = useTranslation()
  const locale = useLocale()
  const total = formatCents(order.totalCents, order.currency, locale)
  const { status } = payment
  const [capturing, setCapturing] = useState(false)
  const [checking, setChecking] = useState(false)

  // Pendant la capture, fermer la page ferait perdre la confirmation à l'écran (pas le paiement).
  useEffect(() => {
    if (!capturing) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [capturing])

  const unconfirmed = isUnconfirmed(paymentError) && status !== 'paid'
  const blocked = paymentError !== null && needsNewOrder.includes(paymentError)
  // Le bouton reste monté pendant la capture (le SDK PayPal attend la fin de onApprove).
  const canPay = payable.includes(status) && !payment.review && !unconfirmed && !blocked
  const text = payment.review && status === 'payment_pending' ? t('order.reviewText') : t(`order.text.${status}`)

  const verify = async () => {
    if (checking) return
    setChecking(true)
    try {
      const state = await ordersClient.getOrderStatus({ orderId: order.orderId, accessToken: order.accessToken })
      onState(state)
      onPaymentError(state.stale ? 'paypal-unreachable' : null)
    } catch (error) {
      onPaymentError(error instanceof OrderApiError ? error.code : 'server')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-start lg:gap-10">
      <section aria-labelledby="order-status-title" className="rounded-[1.75rem] border border-line bg-raised p-6 shadow-lift sm:p-8">
        {order.payment.env === 'sandbox' && (
          <div className="mb-6 rounded-xl border border-dashed border-line-strong bg-surface px-4 py-3" data-testid="sandbox-notice">
            <p className="font-semibold text-ink">{t('order.sandboxTitle')}</p>
            <p className="mt-0.5 text-[0.95rem] text-ink-soft">{t('order.sandboxText')}</p>
          </div>
        )}
        <p className="text-sm text-muted">{t('order.number', { id: order.orderId })}</p>
        <div role="status" aria-live="polite" className="mt-3">
          <h2 id="order-status-title" tabIndex={-1} className="sr-only">
            {t(`order.status.${status}`)}
          </h2>
          <p
            data-status={status}
            data-review={payment.review ? 'true' : undefined}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${tone[status]}`}
          >
            {status === 'paid' ? (
              <CheckIcon className="size-4" />
            ) : status === 'payment_failed' ? (
              <AlertIcon className="size-4" />
            ) : (
              <span aria-hidden="true" className="size-2 rounded-[2px] bg-current" />
            )}
            {t(`order.status.${status}`)}
          </p>
          <p className="mt-4 max-w-xl text-[1.05rem] text-ink-soft">{text}</p>
          {capturing && (
            <p className="mt-3 max-w-xl font-medium text-ink" data-testid="capturing">
              {t('order.capturing')}
            </p>
          )}
        </div>

        {priceChanged && (
          <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-blue bg-blue-tint px-4 py-3 text-[0.95rem] text-ink-soft">
            <InfoIcon className="mt-0.5 size-[18px] shrink-0 text-blue" />
            {t('order.priceChanged', { total })}
          </p>
        )}

        {paymentError && status !== 'paid' && (
          <div role="alert" className="mt-5 rounded-xl bg-danger-tint px-4 py-3 text-danger">
            <p className="flex items-center gap-2 font-semibold">
              <AlertIcon className="size-[18px] shrink-0" />
              {t('order.paymentErrorTitle')}
            </p>
            <p className="mt-1 text-[0.95rem]">
              {paymentError === 'paypal'
                ? t('order.paymentErrorPaypal')
                : paymentError === 'instrument-declined'
                  ? t('order.instrumentDeclined')
                  : t(`checkout.apiErrors.${paymentError}`)}
            </p>
            {unconfirmed && paymentError !== 'payment-unconfirmed' && <p className="mt-2 text-[0.95rem] font-semibold">{t('order.unconfirmedNote')}</p>}
          </div>
        )}

        {(unconfirmed || (payment.review && status === 'payment_pending')) && (
          <div className="mt-6">
            <button type="button" onClick={verify} disabled={checking} className={buttonPrimary}>
              {checking ? t('order.verifying') : t('order.verify')}
            </button>
          </div>
        )}

        {canPay && (
          <div className="mt-7">
            <Suspense
              fallback={
                <p role="status" className="text-[0.95rem] text-muted">
                  {t('order.paypalLoading')}
                </p>
              }
            >
              <PayPalPayment order={order} onState={onState} onError={onPaymentError} onCapturing={setCapturing} />
            </Suspense>
          </div>
        )}

        {status === 'paid' && (
          <div className="mt-7">
            <p className="mb-5 text-[0.95rem] text-ink-soft">{t('order.receipt')}</p>
            <ButtonLink to="/shop">{t('order.backToShop')}</ButtonLink>
          </div>
        )}
        {status !== 'paid' && !payment.review && !unconfirmed && !capturing && (
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={onRestart} className={blocked ? buttonPrimary : buttonSecondary}>
              {blocked ? t('order.restart') : t('order.modify')}
            </button>
            <ButtonLink to="/cart" variant="secondary">
              {t('order.backToCart')}
            </ButtonLink>
          </div>
        )}
      </section>

      <aside aria-labelledby="order-summary-title" className="rounded-[1.5rem] border border-line bg-raised p-6 sm:p-7">
        <h2 id="order-summary-title" className="font-sans text-[0.95rem] font-semibold text-ink">
          {t('checkout.summaryTitle')}
        </h2>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {order.items.map((item) => (
            <li key={item.offerId} className="flex items-start justify-between gap-4 py-3">
              <span className="text-ink-soft">
                {item.title}
                {item.quantity > 1 && <span className="text-muted"> × {item.quantity}</span>}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-ink">
                {formatCents(item.unitCents * item.quantity, order.currency, locale)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-baseline justify-between gap-4">
          <span className="text-ink-soft">{status === 'paid' ? t('order.paidTotal') : t('order.total')}</span>
          <span className="font-display text-[1.6rem] font-semibold tracking-[-0.03em] text-ink" data-testid="order-total">
            {total}
          </span>
        </div>
        <div className="mt-6 border-t border-line pt-4" data-testid="order-customer">
          <p className="text-sm font-semibold text-ink">{t('order.customerTitle')}</p>
          <p className="mt-1 text-ink-soft">
            {order.customer.firstName} {order.customer.lastName}
          </p>
          <p className="break-all text-[0.95rem] text-ink-soft">{order.customer.email}</p>
        </div>
      </aside>
    </div>
  )
}

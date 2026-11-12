import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { contentService } from '../content'
import { summarizeCart, type CartSummary } from '../cart/cart'
import { useCart } from '../cart/cart-context'
import { CheckoutForm } from '../components/checkout/CheckoutForm'
import { OrderPanel } from '../components/checkout/OrderPanel'
import type { PaymentErrorCode } from '../components/checkout/PayPalPayment'
import { ButtonLink } from '../components/ui/ButtonLink'
import { ContentError, ContentLoading, DemoBadge } from '../components/ui/ContentStates'
import { EmptyState } from '../components/ui/EmptyState'
import { AlertIcon, InfoIcon } from '../components/ui/Icons'
import { PageHeader, PageSection } from '../components/ui/PageHeader'
import { useContent } from '../hooks/useContent'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { formatCents, pick, useLocale } from '../hooks/useLocale'
import { buildOrderRequest, emptyCheckout, type CheckoutValues } from '../lib/checkout'
import { OrderApiError, ordersClient, type OrderApiErrorCode, type PaymentState, type ServerOrder } from '../lib/orders'
import { OrderRequestError, isOrderRequestConfigured, submitOrderRequest, type OrderRequestErrorCode } from '../lib/orderRequests'
import { PixelMark } from '../components/ui/PixelMark'
import { pixelRain } from '../motion/effects'

/**
 * Deux modes de commande :
 * - avec paiement en ligne (Cloud Functions + PayPal côté serveur), si VITE_FUNCTIONS_BASE_URL est réglée ;
 * - sinon, commande sans paiement en ligne (Firestore + e-mail, gratuit) : la facture et le lien
 *   de paiement PayPal sont envoyés ensuite par e-mail (lib/orderRequests.ts).
 */
const requestMode = !ordersClient.isConfigured && isOrderRequestConfigured

type Phase =
  | { kind: 'form' }
  | { kind: 'submitting' }
  | { kind: 'not-configured' }
  | { kind: 'api-error'; code: OrderApiErrorCode }
  | { kind: 'request-error'; code: OrderRequestErrorCode }
  | { kind: 'requested'; reference: string; firstName: string; email: string }
  | { kind: 'order'; order: ServerOrder; payment: PaymentState; priceChanged: boolean; paymentError: PaymentErrorCode | null }

export default function CheckoutPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('checkout.title'))
  const locale = useLocale()
  const cart = useCart()
  const offers = useContent(contentService.offers)
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  // La saisie reste en mémoire (jamais dans le stockage du navigateur) : elle survit à un nouvel essai.
  const [values, setValues] = useState<CheckoutValues>(emptyCheckout)
  // Temps passé sur le formulaire (anti-robots du mode sans paiement en ligne).
  const [startedAt] = useState(() => Date.now())

  const paid = phase.kind === 'order' && phase.payment.status === 'paid'
  const { clear } = cart
  useEffect(() => {
    // Le panier n'est vidé qu'une fois le paiement confirmé par le serveur.
    if (paid) clear()
  }, [paid, clear])

  // Nouvelle commande affichée : retour en haut de page et focus sur son statut
  // (le bouton de validation se trouvait en bas du formulaire).
  const orderId = phase.kind === 'order' ? phase.order.orderId : null
  useEffect(() => {
    if (!orderId) return
    window.scrollTo({ top: 0 })
    document.getElementById('order-status-title')?.focus({ preventScroll: true })
  }, [orderId])

  if (phase.kind === 'requested') {
    return (
      <PageSection>
        <PageHeader title={t('checkout.done.title')} />
        <OrderRequestDone reference={phase.reference} firstName={phase.firstName} email={phase.email} />
      </PageSection>
    )
  }

  if (phase.kind === 'order') {
    return (
      <PageSection>
        <PageHeader title={t('checkout.title')} />
        <div className="mt-10">
          <OrderPanel
            order={phase.order}
            payment={phase.payment}
            priceChanged={phase.priceChanged}
            paymentError={phase.paymentError}
            onState={(payment) =>
              setPhase((p) => (p.kind === 'order' ? { ...p, payment, paymentError: payment.status === 'paid' ? null : p.paymentError } : p))
            }
            onPaymentError={(code) => setPhase((p) => (p.kind === 'order' ? { ...p, paymentError: code } : p))}
            onRestart={() => {
              // Commande abandonnée au profit d'une nouvelle (saisie conservée) ; rien n'a été encaissé.
              const { orderId, accessToken } = phase.order
              void ordersClient.cancelOrder({ orderId, accessToken }).catch(() => {})
              setPhase({ kind: 'form' })
            }}
          />
        </div>
      </PageSection>
    )
  }

  return (
    <PageSection>
      <PageHeader title={t('checkout.title')} lead={requestMode ? t('checkout.leadRequest') : t('checkout.lead')} />
      {offers.status === 'loading' && <ContentLoading className="mt-12" count={2} />}
      {offers.status === 'error' && (
        <div className="mt-12">
          <ContentError onRetry={offers.retry} />
        </div>
      )}
      {offers.status === 'ready' && (
        <CheckoutContent
          summary={summarizeCart(cart.state, offers.data)}
          phase={phase}
          values={values}
          onChange={setValues}
          onSubmit={async (summary, submitted) => {
            if (requestMode) {
              setPhase({ kind: 'submitting' })
              try {
                const result = await submitOrderRequest(summary, submitted, locale, Date.now() - startedAt)
                // Commande confirmée (Firestore ou e-mail) : le panier et la saisie peuvent être vidés.
                clear()
                setValues(emptyCheckout)
                setPhase({ kind: 'requested', reference: result.reference, firstName: submitted.firstName.trim(), email: submitted.email.trim() })
                window.scrollTo({ top: 0 })
                pixelRain(70)
              } catch (error) {
                setPhase({ kind: 'request-error', code: error instanceof OrderRequestError ? error.code : 'failed' })
              }
              return
            }
            if (!ordersClient.isConfigured) {
              setPhase({ kind: 'not-configured' })
              return
            }
            setPhase({ kind: 'submitting' })
            try {
              const order = await ordersClient.createOrder(
                buildOrderRequest(
                  submitted,
                  summary.lines.map((line) => ({ offerId: line.offer.id, quantity: line.quantity })),
                  locale,
                ),
              )
              setPhase({
                kind: 'order',
                order,
                payment: { status: order.status },
                priceChanged: order.totalCents !== summary.totalCents || order.currency !== summary.currency,
                paymentError: null,
              })
            } catch (error) {
              setPhase({ kind: 'api-error', code: error instanceof OrderApiError ? error.code : 'server' })
            }
          }}
        />
      )}
    </PageSection>
  )
}

type ContentProps = {
  summary: CartSummary
  phase: Exclude<Phase, { kind: 'order' } | { kind: 'requested' }>
  values: CheckoutValues
  onChange: (values: CheckoutValues) => void
  onSubmit: (summary: CartSummary, values: CheckoutValues) => void
}

function CheckoutContent({ summary, phase, values, onChange, onSubmit }: ContentProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  // Les messages s'affichent en haut du formulaire : on les amène à l'écran.
  const messageRef = useRef<HTMLDivElement>(null)
  const hasMessage = phase.kind === 'not-configured' || phase.kind === 'api-error' || phase.kind === 'request-error'
  useEffect(() => {
    if (hasMessage) messageRef.current?.scrollIntoView({ block: 'start' })
  }, [hasMessage, phase])

  if (!summary.canCheckout) {
    return (
      <div className="mt-12">
        <EmptyState
          seed="checkout-empty"
          title={t('checkout.emptyTitle')}
          text={t('checkout.emptyText')}
          actions={
            <>
              <ButtonLink to="/cart">{t('order.backToCart')}</ButtonLink>
              <ButtonLink to="/shop" variant="secondary">
                {t('cart.backToShop')}
              </ButtonLink>
            </>
          }
        />
      </div>
    )
  }

  return (
    <div className="mt-12 grid gap-8 lg:grid-cols-[1.6fr_1fr] lg:items-start lg:gap-10">
      <div className="rounded-[1.75rem] border border-line bg-raised p-5 shadow-lift sm:p-8">
        <div ref={messageRef} className="scroll-mt-28" />
        <div aria-live="polite">
          {phase.kind === 'not-configured' && (
            <div className="mb-6 rounded-xl border border-blue bg-blue-tint px-4 py-3.5 text-ink">
              <p className="flex items-center gap-2 font-semibold">
                <InfoIcon className="size-5 shrink-0 text-blue" />
                {t('checkout.notConfiguredTitle')}
              </p>
              <p className="mt-1 text-[0.95rem] text-ink-soft">{t('checkout.notConfiguredText')}</p>
              <ButtonLink to="/contact?subject=other" variant="secondary" className="mt-3">
                {t('checkout.contact')}
              </ButtonLink>
            </div>
          )}
        </div>
        <div role="alert">
          {phase.kind === 'api-error' && (
            <div className="mb-6 rounded-xl bg-danger-tint px-4 py-3.5 text-danger">
              <p className="flex items-center gap-2 font-semibold">
                <AlertIcon className="size-5 shrink-0" />
                {t('checkout.apiErrorTitle')}
              </p>
              <p className="mt-1 text-[0.95rem]">{t(`checkout.apiErrors.${phase.code}`)}</p>
              {phase.code === 'offer-unavailable' && (
                <ButtonLink to="/cart" variant="secondary" className="mt-3">
                  {t('order.backToCart')}
                </ButtonLink>
              )}
            </div>
          )}
        </div>
        <div role="alert">
          {phase.kind === 'request-error' && (
            <div className="mb-6 rounded-xl bg-danger-tint px-4 py-3.5 text-danger">
              <p className="flex items-center gap-2 font-semibold">
                <AlertIcon className="size-5 shrink-0" />
                {t('checkout.requestErrorTitle')}
              </p>
              <p className="mt-1 text-[0.95rem]">{t(`checkout.requestErrors.${phase.code}`)}</p>
              {(phase.code === 'failed' || phase.code === 'not-configured') && (
                <ButtonLink to="/contact?subject=other" variant="secondary" className="mt-3">
                  {t('checkout.contact')}
                </ButtonLink>
              )}
            </div>
          )}
        </div>
        <CheckoutForm
          values={values}
          onChange={onChange}
          submitLabel={requestMode ? t('checkout.submitRequest') : undefined}
          submittingLabel={requestMode ? t('checkout.submittingRequest') : undefined}
          submitting={phase.kind === 'submitting'}
          onValidSubmit={(submitted) => onSubmit(summary, submitted)}
        />
      </div>

      <aside
        aria-labelledby="checkout-summary-title"
        className="rounded-[1.5rem] border border-line bg-raised p-6 sm:p-7 lg:sticky lg:top-24"
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="checkout-summary-title" className="font-sans text-[0.95rem] font-semibold text-ink">
            {t('checkout.summaryTitle')}
          </h2>
          <ButtonLink to="/cart" variant="ghost" className="min-h-0 px-0 text-sm">
            {t('checkout.editCart')}
          </ButtonLink>
        </div>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {summary.lines.map((line) => (
            <li key={line.offer.id} className="flex items-start justify-between gap-4 py-3">
              <span className="text-ink-soft">
                {pick(line.offer.title, locale)}
                {line.quantity > 1 && <span className="text-muted"> × {line.quantity}</span>}
                {line.offer.isDemo && <DemoBadge className="ml-2 align-middle" />}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-ink">
                {formatCents(line.lineCents, line.offer.currency, locale)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-baseline justify-between gap-4">
          <span className="text-ink-soft">{t('cart.total')}</span>
          <span className="font-display text-[1.6rem] font-semibold tracking-[-0.03em] text-ink" data-testid="checkout-total">
            {summary.currency ? formatCents(summary.totalCents, summary.currency, locale) : '—'}
          </span>
        </div>
        <p className="mt-3 text-sm text-muted">{requestMode ? t('cart.totalNoteInvoice') : t('cart.totalNote')}</p>
      </aside>
    </div>
  )
}

/** Confirmation d'une commande sans paiement en ligne. */
function OrderRequestDone({ reference, firstName, email }: { reference: string; firstName: string; email: string }) {
  const { t } = useTranslation()
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div className="mt-10 max-w-3xl rounded-[1.75rem] border border-blue bg-raised p-6 shadow-lift sm:p-9" role="status">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <span className="inline-flex size-20 shrink-0 items-center justify-center rounded-2xl bg-blue-tint">
          <PixelMark seed={reference} animate className="size-12 text-blue" />
        </span>
        <div className="min-w-0">
          <h2 ref={titleRef} tabIndex={-1} className="text-[1.5rem] font-semibold leading-tight tracking-[-0.025em] outline-none sm:text-[1.8rem]">
            {t('checkout.done.thanks', { name: firstName })}
          </h2>
          <p className="mt-3 text-[1.05rem] text-ink-soft">{t('checkout.done.text')}</p>
          <p className="mt-5 inline-flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-4 py-3">
            <span className="text-sm text-muted">{t('checkout.done.referenceLabel')}</span>
            <span className="font-mono text-[1.1rem] font-semibold tracking-wide text-ink" data-testid="order-reference">
              {reference}
            </span>
          </p>
          <p className="mt-5 text-ink-soft">{t('checkout.done.next', { email })}</p>
          <p className="mt-2 text-sm text-muted">{t('checkout.done.keep')}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/">{t('common.backHome')}</ButtonLink>
            <ButtonLink to="/shop" variant="secondary">
              {t('cart.backToShop')}
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  )
}

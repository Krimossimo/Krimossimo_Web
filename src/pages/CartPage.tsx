import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { contentService } from '../content'
import { summarizeCart, type BlockedLine, type PricedLine } from '../cart/cart'
import { useCart } from '../cart/cart-context'
import { ButtonLink } from '../components/ui/ButtonLink'
import { ContentError, ContentLoading, DemoBadge } from '../components/ui/ContentStates'
import { EmptyState } from '../components/ui/EmptyState'
import { AlertIcon, MinusIcon, PlusIcon, TrashIcon } from '../components/ui/Icons'
import { PageHeader, PageSection } from '../components/ui/PageHeader'
import { PixelMark } from '../components/ui/PixelMark'
import { useContent } from '../hooks/useContent'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { formatCents, pick, useLocale } from '../hooks/useLocale'
import { isOrderApiConfigured } from '../lib/orders'

export default function CartPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('cart.title'))
  const cart = useCart()
  const offers = useContent(contentService.offers)

  if (cart.state.lines.length === 0) {
    return (
      <PageSection>
        <PageHeader title={t('cart.title')} />
        <div className="mt-12">
          <EmptyState
            seed="cart-empty"
            title={t('cart.emptyTitle')}
            text={t('cart.emptyText')}
            actions={<ButtonLink to="/shop">{t('cart.backToShop')}</ButtonLink>}
          />
        </div>
      </PageSection>
    )
  }

  return (
    <PageSection>
      <PageHeader title={t('cart.title')} lead={t('cart.lead')} />
      {offers.status === 'loading' && <ContentLoading className="mt-12" count={2} />}
      {offers.status === 'error' && (
        <div className="mt-12">
          <ContentError onRetry={offers.retry} />
        </div>
      )}
      {offers.status === 'ready' && <CartContent catalog={offers.data} />}
    </PageSection>
  )
}

function CartContent({ catalog }: { catalog: Parameters<typeof summarizeCart>[1] }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const cart = useCart()
  const summary = summarizeCart(cart.state, catalog)

  return (
    <div className="mt-12 grid gap-8 lg:grid-cols-[1.6fr_1fr] lg:items-start lg:gap-10">
      <div className="space-y-6">
        {summary.blocked.length > 0 && (
          <div role="alert" className="rounded-[1.25rem] bg-danger-tint px-5 py-4 text-danger">
            <p className="flex items-center gap-2 font-semibold">
              <AlertIcon className="size-5 shrink-0" />
              {t('cart.blockedTitle')}
            </p>
            <p className="mt-1 text-[0.95rem]">{t('cart.blockedText')}</p>
          </div>
        )}

        <ul className="divide-y divide-line rounded-[1.5rem] border border-line bg-raised">
          {summary.lines.map((line) => (
            <CartRow key={line.offer.id} line={line} />
          ))}
          {summary.blocked.map((line) => (
            <BlockedRow key={line.offerId} line={line} />
          ))}
        </ul>
      </div>

      <aside
        aria-labelledby="cart-summary-title"
        className="rounded-[1.5rem] border border-line bg-raised p-6 shadow-lift sm:p-7 lg:sticky lg:top-24"
      >
        <h2 id="cart-summary-title" className="font-sans text-[0.95rem] font-semibold text-ink">
          {t('cart.itemCount', { count: summary.itemCount })}
        </h2>
        <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-line pt-4">
          <span className="text-ink-soft">{t('cart.total')}</span>
          <span className="font-display text-[1.75rem] font-semibold tracking-[-0.03em] text-ink" data-testid="cart-total">
            {summary.currency ? formatCents(summary.totalCents, summary.currency, locale) : '—'}
          </span>
        </div>
        <p className="mt-3 text-sm text-muted">{isOrderApiConfigured ? t('cart.totalNote') : t('cart.totalNoteInvoice')}</p>
        <div className="mt-6 flex flex-col gap-3">
          {summary.canCheckout ? (
            <ButtonLink to="/checkout" className="w-full">
              {t('cart.checkout')}
            </ButtonLink>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-xl bg-surface px-5 font-medium text-muted"
            >
              {t('cart.checkout')}
            </span>
          )}
          <ButtonLink to="/shop" variant="secondary" className="w-full">
            {t('cart.continue')}
          </ButtonLink>
        </div>
      </aside>
    </div>
  )
}

function CartRow({ line }: { line: PricedLine }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const cart = useCart()
  const { offer, quantity, unitCents, lineCents, adjustable, maxQuantity } = line
  const title = pick(offer.title, locale)
  const currency = offer.currency

  return (
    <li data-offer-id={offer.id} className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-5 sm:p-6">
      <PixelMark seed={`offer-${offer.id}`} className="hidden size-12 text-blue sm:block" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[1.1rem] font-semibold leading-snug tracking-[-0.02em]">{title}</h2>
          {offer.isDemo && <DemoBadge />}
        </div>
        <p className="mt-1 text-sm text-muted">
          {t('cart.unitPrice', { price: formatCents(unitCents, currency, locale) })}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {adjustable ? (
            <div role="group" aria-label={t('cart.quantity')} className="inline-flex items-center rounded-xl border border-line-strong">
              <button
                type="button"
                onClick={() => cart.setQuantity(offer.id, quantity - 1, maxQuantity)}
                disabled={quantity <= 1}
                aria-label={t('cart.decrease', { title })}
                className="inline-flex size-10 items-center justify-center rounded-l-xl text-ink transition-colors hover:text-blue disabled:text-line-strong"
              >
                <MinusIcon className="size-4" />
              </button>
              <output aria-live="polite" data-testid="quantity" className="min-w-8 text-center font-semibold tabular-nums text-ink">
                {quantity}
              </output>
              <button
                type="button"
                onClick={() => cart.setQuantity(offer.id, quantity + 1, maxQuantity)}
                disabled={quantity >= maxQuantity}
                aria-label={t('cart.increase', { title })}
                className="inline-flex size-10 items-center justify-center rounded-r-xl text-ink transition-colors hover:text-blue disabled:text-line-strong"
              >
                <PlusIcon className="size-4" />
              </button>
            </div>
          ) : (
            <span className="rounded-full bg-surface px-3 py-1 text-sm text-ink-soft">{t('cart.singleService')}</span>
          )}
          {adjustable && quantity >= maxQuantity && (
            <span className="text-sm text-muted">{t('cart.maxReached', { max: maxQuantity })}</span>
          )}
          <button
            type="button"
            onClick={() => cart.remove(offer.id)}
            aria-label={t('cart.removeLabel', { title })}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted transition-colors hover:text-danger"
          >
            <TrashIcon className="size-4" />
            {t('cart.remove')}
          </button>
        </div>
      </div>
      <p className="font-display text-[1.2rem] font-semibold tracking-[-0.02em] text-ink sm:text-right">
        {formatCents(lineCents, currency, locale)}
      </p>
    </li>
  )
}

function BlockedRow({ line }: { line: BlockedLine }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const cart = useCart()
  const title = line.offer ? pick(line.offer.title, locale) : line.offerId

  return (
    <li data-blocked={line.offerId} className="flex flex-col gap-3 bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <p className="font-semibold text-ink-soft line-through decoration-line-strong">{title}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-danger">
          <AlertIcon className="size-4 shrink-0" />
          {t(`cart.reasons.${line.reason}`)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {line.offer && (
          <Link
            to={`/contact?subject=${line.offer.contactSubject}`}
            className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            {t('cart.ask')}
          </Link>
        )}
        <button
          type="button"
          onClick={() => cart.remove(line.offerId)}
          aria-label={t('cart.removeLabel', { title })}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line-strong bg-raised px-3 text-sm font-medium text-ink transition-colors hover:border-danger hover:text-danger"
        >
          <TrashIcon className="size-4" />
          {t('cart.remove')}
        </button>
      </div>
    </li>
  )
}

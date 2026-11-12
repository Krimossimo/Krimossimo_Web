import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { containsDemo, contentService } from '../content'
import { isPurchasable } from '../cart/cart'
import { isOrderApiConfigured } from '../lib/orders'
import { OfferCard } from '../components/shop/OfferCard'
import { ContentError, ContentLoading, DemoNotice } from '../components/ui/ContentStates'
import { EmptyState } from '../components/ui/EmptyState'
import { InfoIcon } from '../components/ui/Icons'
import { PageHeader, PageSection } from '../components/ui/PageHeader'
import { useContent } from '../hooks/useContent'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function ShopPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('shop.title'))
  const state = useContent(contentService.offers)

  return (
    <PageSection>
      <PageHeader title={t('shop.title')} lead={t('shop.lead')} />

      {state.status === 'loading' && <ContentLoading className="mt-12" />}
      {state.status === 'error' && (
        <div className="mt-12">
          <ContentError onRetry={state.retry} />
        </div>
      )}
      {state.status === 'ready' &&
        (state.data.length === 0 ? (
          <div className="mt-12">
            <EmptyState seed="shop-empty" title={t('shop.emptyTitle')} text={t('shop.emptyText')} />
          </div>
        ) : (
          <>
            {containsDemo(state.data) && (
              <div className="mt-10">
                <DemoNotice />
              </div>
            )}
            <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {state.data.map((offer, i) => (
                <li key={offer.id} data-reveal style={{ '--i': i } as CSSProperties}>
                  <OfferCard offer={offer} catalog={state.data} />
                </li>
              ))}
            </ul>
            <p className="mt-8 flex max-w-2xl items-start gap-2.5 text-[0.95rem] text-muted">
              <InfoIcon className="mt-0.5 size-[18px] shrink-0 text-blue" />
              <span>
                {state.data.some(isPurchasable)
                  ? `${t('shop.notePurchasable')} ${isOrderApiConfigured ? '' : t('shop.notePaymentOff')}`.trim()
                  : t('shop.note')}
              </span>
            </p>
          </>
        ))}
    </PageSection>
  )
}

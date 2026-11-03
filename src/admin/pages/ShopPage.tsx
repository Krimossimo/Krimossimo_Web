import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { formatPrice, useLocale } from '../../hooks/useLocale'
import { currencies, type Currency } from '../../types/content'
import { ContentList } from '../components/ContentList'
import { Badge } from '../components/ui'
import { RequireAdmin } from '../RequireAdmin'

const availabilityTone = { available: 'blue', out_of_stock: 'danger', unavailable: 'neutral' } as const

function Shop() {
  const { t } = useTranslation()
  const locale = useLocale()
  useDocumentTitle(t('admin.shop.title'))
  return (
    <ContentList
      collection="offers"
      title={t('admin.shop.title')}
      lead={t('admin.shop.lead')}
      newLabel={t('admin.shop.new')}
      basePath="/admin/shop"
      emptyText={t('admin.shop.empty')}
      describe={(doc) => {
        const { price, currency, priceFrom, availability } = doc.data
        const cur: Currency = (currencies as readonly unknown[]).includes(currency) ? (currency as Currency) : 'EUR'
        const priceText =
          typeof price === 'number'
            ? priceFrom === true
              ? t('common.priceFrom', { price: formatPrice(price, cur, locale) })
              : formatPrice(price, cur, locale)
            : t('admin.shop.quote')
        const key = availability === 'out_of_stock' || availability === 'unavailable' ? availability : 'available'
        return {
          meta: <span data-testid="offer-price">{priceText}</span>,
          badges: <Badge tone={availabilityTone[key]}>{t(`admin.shop.availabilities.${key}.label`)}</Badge>,
        }
      }}
    />
  )
}

export default function ShopPage() {
  return (
    <RequireAdmin>
      <Shop />
    </RequireAdmin>
  )
}

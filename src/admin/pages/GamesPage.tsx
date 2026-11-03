import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { formatPrice, useLocale } from '../../hooks/useLocale'
import { isRecord } from '../../content/validation'
import { currencies, type Currency } from '../../types/content'
import { ContentList } from '../components/ContentList'
import { RequireAdmin } from '../RequireAdmin'

function Games() {
  const { t } = useTranslation()
  const locale = useLocale()
  useDocumentTitle(t('admin.games.title'))
  return (
    <ContentList
      collection="games"
      title={t('admin.games.title')}
      lead={t('admin.games.lead')}
      newLabel={t('admin.games.new')}
      basePath="/admin/games"
      emptyText={t('admin.games.empty')}
      describe={(doc) => {
        const pricing = isRecord(doc.data.pricing) ? doc.data.pricing : {}
        const price = isRecord(pricing.price) ? pricing.price : null
        const cur: Currency = price && (currencies as readonly unknown[]).includes(price.currency) ? (price.currency as Currency) : 'EUR'
        const priceText =
          pricing.type === 'paid'
            ? price && typeof price.amount === 'number'
              ? formatPrice(price.amount, cur, locale)
              : t('games.paid')
            : t('common.free')
        return {
          imageSrc: isRecord(doc.data.cover) && typeof doc.data.cover.src === 'string' ? doc.data.cover.src : undefined,
          meta: priceText,
        }
      }}
    />
  )
}

export default function GamesPage() {
  return (
    <RequireAdmin>
      <Games />
    </RequireAdmin>
  )
}

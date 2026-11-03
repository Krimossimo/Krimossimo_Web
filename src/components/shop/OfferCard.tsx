import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Offer } from '../../types/content'
import { isPurchasable } from '../../cart/cart'
import { useCart } from '../../cart/cart-context'
import { formatPrice, pick, useLocale } from '../../hooks/useLocale'
import { ButtonLink } from '../ui/ButtonLink'
import { DemoBadge } from '../ui/ContentStates'
import { AlertIcon, CartIcon, CheckIcon, InfoIcon } from '../ui/Icons'
import { PixelMark } from '../ui/PixelMark'

/**
 * Carte d'offre.
 * - Prix fixe et disponible : « Ajouter au panier » (puis « Voir le panier »).
 * - Prix absent ou « à partir de » : « Demander un devis » (formulaire de contact).
 * - Rupture de stock : visible, non commandable, avec un lien pour poser une question.
 * - Indisponible : visible, sans action d'achat.
 * Le prix affiché est indicatif : il n'est jamais utilisé pour encaisser un paiement.
 */
export function OfferCard({ offer, catalog }: { offer: Offer; catalog: readonly Offer[] }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const cart = useCart()
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const available = offer.availability === 'available'
  const outOfStock = offer.availability === 'out_of_stock'
  const purchasable = isPurchasable(offer)
  const inCart = cart.state.lines.some((line) => line.offerId === offer.id)
  const title = pick(offer.title, locale)

  const price =
    offer.price === null
      ? null
      : offer.priceFrom
        ? t('common.priceFrom', { price: formatPrice(offer.price, offer.currency, locale) })
        : formatPrice(offer.price, offer.currency, locale)

  const addToCart = () => {
    const result = cart.add(offer, catalog)
    setFeedback(
      result.ok
        ? { tone: 'ok', text: t('cart.announceAdded', { title }) }
        : { tone: 'error', text: t(`cart.errors.${result.reason}`) },
    )
  }

  return (
    <article
      className={`flex h-full flex-col rounded-[1.5rem] border bg-raised p-6 sm:p-7 ${
        available ? 'card-lift border-line' : 'border-dashed border-line-strong'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <PixelMark seed={`offer-${offer.id}`} className={`size-12 ${available ? 'text-blue' : 'text-muted'}`} />
        {offer.isDemo && <DemoBadge />}
      </div>
      <h2 className="mt-6 text-[1.35rem] font-semibold leading-snug tracking-[-0.025em]">{title}</h2>
      <p className="mt-3 text-muted">{pick(offer.description, locale)}</p>

      <div className="mt-auto pt-8">
        <div className="border-t border-line pt-5">
          {!available && (
            <p className="mb-2 inline-flex rounded-full bg-surface px-3 py-1 text-sm font-medium text-ink-soft">
              {outOfStock ? t('shop.outOfStock') : t('shop.unavailable')}
            </p>
          )}
          <p
            className={
              price ? 'font-display text-[1.5rem] font-semibold tracking-[-0.03em] text-ink' : 'font-medium text-ink'
            }
          >
            {price ?? t('common.priceOnRequest')}
          </p>
          {offer.conditions && (
            <p className="mt-3 flex items-start gap-2 text-sm text-muted">
              <InfoIcon className="mt-0.5 size-4 shrink-0 text-blue" />
              {pick(offer.conditions, locale)}
            </p>
          )}
        </div>

        {!available && !outOfStock && (
          <p className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-line text-muted">
            {t('shop.unavailableCta')}
          </p>
        )}

        {outOfStock && (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-muted">{t('shop.outOfStockText')}</p>
            <Link
              to={`/contact?subject=${offer.contactSubject}`}
              className="block text-center text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              {t('cart.ask')}
            </Link>
          </div>
        )}

        {available && !purchasable && (
          <ButtonLink to={`/contact?subject=${offer.contactSubject}`} className="mt-6 w-full">
            {t('shop.cta')}
          </ButtonLink>
        )}

        {purchasable && (
          <div className="mt-6 space-y-3">
            {inCart ? (
              <>
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  <CheckIcon className="size-4 text-blue" />
                  {t('cart.inCart')}
                </p>
                <ButtonLink to="/cart" className="w-full">
                  <CartIcon className="size-[18px]" />
                  {t('cart.view')}
                </ButtonLink>
              </>
            ) : (
              <button
                type="button"
                onClick={addToCart}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue px-5 text-[0.98rem] font-medium text-on-blue transition-[background-color,transform] duration-150 hover:bg-blue-hover active:translate-y-px"
              >
                <CartIcon className="size-[18px]" />
                {t('cart.add')}
              </button>
            )}
            <Link
              to={`/contact?subject=${offer.contactSubject}`}
              className="block text-center text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              {t('cart.ask')}
            </Link>
          </div>
        )}

        {/* Annonce de l'ajout pour les lecteurs d'écran (et message visible en cas d'échec). */}
        <p role="status" className={feedback?.tone === 'error' ? 'mt-3 flex items-start gap-2 text-sm text-danger' : 'sr-only'}>
          {feedback?.tone === 'error' && <AlertIcon className="mt-0.5 size-4 shrink-0" />}
          {feedback?.text}
        </p>
      </div>
    </article>
  )
}

import { NavLink, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useCart } from '../../cart/cart-context'
import { CartIcon } from '../ui/Icons'

/**
 * Accès au panier dans le header. Il n'apparaît que lorsque le panier contient
 * quelque chose (ou sur les pages Panier et Commande), pour ne pas transformer
 * le portfolio en boutique en ligne.
 */
export function CartLink() {
  const { t } = useTranslation()
  const { count } = useCart()
  const { pathname } = useLocation()
  if (count === 0 && !pathname.startsWith('/cart') && !pathname.startsWith('/checkout')) return null

  return (
    <NavLink
      to="/cart"
      aria-label={t('cart.link', { count })}
      title={t('cart.link', { count })}
      className={({ isActive }) =>
        `relative inline-flex size-11 items-center justify-center rounded-xl border text-ink transition-colors duration-150 ${
          isActive ? 'border-blue bg-blue-tint' : 'border-line hover:border-line-strong hover:text-blue'
        }`
      }
    >
      <CartIcon />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue px-1 text-[0.7rem] font-semibold tabular-nums text-on-blue"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </NavLink>
  )
}

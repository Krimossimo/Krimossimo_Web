import { createContext, useContext } from 'react'
import type { AddResult, CartState } from './cart'
import type { Offer } from '../types/content'

export type CartApi = {
  state: CartState
  /** Nombre total d'unités dans le panier (badge du header). */
  count: number
  add: (offer: Offer, catalog: readonly Offer[]) => AddResult
  setQuantity: (offerId: string, quantity: number, max: number) => void
  remove: (offerId: string) => void
  clear: () => void
}

export const CartContext = createContext<CartApi | null>(null)

export function useCart(): CartApi {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart doit être utilisé dans <CartProvider>.')
  return ctx
}

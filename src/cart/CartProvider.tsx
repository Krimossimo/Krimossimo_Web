import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CART_STORAGE_KEY,
  addOffer,
  emptyCart,
  lineCount,
  parseStoredCart,
  removeLine,
  serializeCart,
  setQuantity as setLineQuantity,
  type CartState,
} from './cart'
import { CartContext, type CartApi } from './cart-context'

/**
 * Panier partagé entre les pages et conservé entre les sessions (localStorage).
 * Seuls des identifiants d'offre et des quantités sont stockés. Si le stockage
 * est indisponible (navigation privée stricte), le panier fonctionne en mémoire.
 */
function readStorage(): CartState {
  try {
    return parseStoredCart(localStorage.getItem(CART_STORAGE_KEY))
  } catch {
    return emptyCart
  }
}

function writeStorage(state: CartState) {
  try {
    if (state.lines.length === 0) localStorage.removeItem(CART_STORAGE_KEY)
    else localStorage.setItem(CART_STORAGE_KEY, serializeCart(state))
  } catch {
    /* stockage indisponible : le panier reste valable pour cette visite */
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(readStorage)
  const stateRef = useRef(state)
  const fromOtherTab = useRef(false)

  useEffect(() => {
    stateRef.current = state
    // Un changement venu d'un autre onglet est déjà enregistré : on ne le réécrit pas.
    if (fromOtherTab.current) {
      fromOtherTab.current = false
      return
    }
    writeStorage(state)
  }, [state])

  // Synchronise les onglets ouverts.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CART_STORAGE_KEY) return
      fromOtherTab.current = true
      setState(parseStoredCart(event.newValue))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const add = useCallback<CartApi['add']>((offer, catalog) => {
    const result = addOffer(stateRef.current, offer, catalog)
    if (result.ok) {
      stateRef.current = result.state
      setState(result.state)
    }
    return result
  }, [])

  const setQuantity = useCallback<CartApi['setQuantity']>((offerId, quantity, max) => {
    setState((current) => setLineQuantity(current, offerId, quantity, max))
  }, [])

  const remove = useCallback<CartApi['remove']>((offerId) => {
    setState((current) => removeLine(current, offerId))
  }, [])

  const clear = useCallback(() => setState(emptyCart), [])

  const value = useMemo<CartApi>(
    () => ({ state, count: lineCount(state), add, setQuantity, remove, clear }),
    [state, add, setQuantity, remove, clear],
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

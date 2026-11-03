/**
 * Paiement PayPal (chargé à la demande, uniquement quand une commande serveur existe).
 *
 * Le navigateur ne décide d'aucun montant ni d'aucun statut :
 * - le SDK est chargé avec le client ID PUBLIC et l'environnement fournis par le serveur ;
 * - createOrder  → le serveur crée (ou réutilise) la commande PayPal pour le montant qu'IL a figé ;
 * - onApprove    → le serveur capture et vérifie (montant, devise, identifiants) ;
 *                  moyen de paiement refusé → actions.restart() : le client en choisit un autre ;
 * - onCancel     → le serveur note l'abandon (un nouvel essai reste possible) ;
 * - onError      → on relit le statut réel auprès du serveur.
 * Chaque statut transmis à l'interface provient donc d'une réponse du serveur.
 */
import { useRef } from 'react'
import { PayPalButtons, PayPalScriptProvider, usePayPalScriptReducer } from '@paypal/react-paypal-js'
import { useTranslation } from 'react-i18next'
import { OrderApiError, ordersClient, type OrderApiErrorCode, type PaymentState, type ServerOrder } from '../../lib/orders'
import { AlertIcon } from '../ui/Icons'

export type PaymentErrorCode = OrderApiErrorCode | 'paypal' | 'instrument-declined'

type Props = {
  order: ServerOrder
  onState: (state: PaymentState) => void
  /** Erreur de paiement à afficher ; `null` efface l'erreur précédente au début d'un nouvel essai. */
  onError: (code: PaymentErrorCode | null) => void
  /** Capture en cours côté serveur (la page ne doit pas être fermée). */
  onCapturing: (capturing: boolean) => void
}

export default function PayPalPayment(props: Props) {
  return (
    <PayPalScriptProvider options={{ clientId: props.order.payment.clientId, currency: props.order.currency, intent: 'capture', components: 'buttons' }}>
      <PayPalArea {...props} />
    </PayPalScriptProvider>
  )
}

function PayPalArea({ order, onState, onError, onCapturing }: Props) {
  const { t } = useTranslation()
  const [{ isPending, isRejected }] = usePayPalScriptReducer()
  // Une erreur précise de notre serveur prime sur l'erreur générique que PayPal signale ensuite.
  const apiErrorRef = useRef(false)
  const ref = { orderId: order.orderId, accessToken: order.accessToken }

  const refresh = async () => {
    try {
      onState(await ordersClient.getOrderStatus(ref))
    } catch {
      /* statut inchangé : l'erreur est déjà affichée */
    }
  }

  /** Erreur du serveur : message précis, et statut réel quand le serveur l'indique. */
  const report = (error: unknown) => {
    apiErrorRef.current = true
    const apiError = error instanceof OrderApiError ? error : null
    onError(apiError?.code ?? 'server')
    if (apiError?.orderStatus) onState({ status: apiError.orderStatus })
  }

  if (isRejected) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-tint px-4 py-3 text-[0.95rem] text-danger">
        <AlertIcon className="mt-0.5 size-[18px] shrink-0" />
        {t('order.paypalUnavailable')}
      </p>
    )
  }

  return (
    <div>
      {isPending && (
        <p role="status" className="mb-3 text-[0.95rem] text-muted">
          {t('order.paypalLoading')}
        </p>
      )}
      <PayPalButtons
        style={{ layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay' }}
        forceReRender={[order.orderId, order.currency, order.payment.clientId]}
        createOrder={async () => {
          apiErrorRef.current = false
          onError(null)
          try {
            const result = await ordersClient.createPaypalOrder(ref)
            onState({ status: result.status })
            return result.paypalOrderId
          } catch (error) {
            report(error)
            throw error
          }
        }}
        onApprove={async (data, actions) => {
          onCapturing(true)
          try {
            const result = await ordersClient.capturePaypalOrder(ref, data.orderID)
            onState(result)
            if (result.retry === 'instrument_declined') {
              onError('instrument-declined')
              await actions.restart()
            }
          } catch (error) {
            report(error)
            // Le serveur relit PayPal : un paiement encaissé malgré l'erreur apparaît comme payé.
            await refresh()
          } finally {
            onCapturing(false)
          }
        }}
        onCancel={async () => {
          try {
            onState(await ordersClient.cancelOrder(ref))
          } catch (error) {
            report(error)
          }
        }}
        onError={async () => {
          if (!apiErrorRef.current) onError('paypal')
          await refresh()
        }}
      />
    </div>
  )
}

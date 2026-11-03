/**
 * Vérification de la configuration PayPal SANDBOX — à exécuter EN LOCAL, jamais en Live.
 *
 *   npm run paypal:sandbox
 *
 * Le script demande le client ID et le secret Sandbox (saisie masquée : rien n'est écrit sur
 * le disque ni dans l'historique), puis, avec le VRAI client REST des fonctions (src/paypal.ts) :
 *   1. obtient un jeton OAuth (identifiants valides ?) ;
 *   2. crée une commande de test de 1,00 EUR et affiche le lien d'approbation ;
 *   3. vous payez avec un compte ACHETEUR Sandbox (developer.paypal.com > Sandbox accounts) ;
 *   4. capture la commande puis vérifie la réponse avec verifyCapture() (montant, devise, référence) ;
 *   5. rejoue la capture pour montrer qu'aucun second encaissement n'a lieu.
 * Aucune donnée n'est écrite dans Firestore. Seul l'environnement Sandbox est contacté.
 *
 *   npm run paypal:sandbox -- --mock INSTRUMENT_DECLINED
 * demande à PayPal Sandbox de simuler un refus à la capture (« negative testing ») et affiche
 * la façon dont le serveur classe ce refus (autre moyen de paiement, échec définitif...).
 * Codes utiles : INSTRUMENT_DECLINED, TRANSACTION_REFUSED, ORDER_NOT_APPROVED.
 */
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { classifyCaptureIssue, verifyCapture } from '../src/orders.js'
import { PayPalError, createPayPalClient } from '../src/paypal.js'

async function ask(question: string, { hidden = false } = {}): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true })
  if (hidden) {
    // Masque la saisie (les caractères ne sont pas affichés).
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput
    ;(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (s.startsWith(question)) write.call(rl, question)
    }
  }
  const answer = await rl.question(question)
  rl.close()
  if (hidden) stdout.write('\n')
  return answer.trim()
}

const mockIndex = process.argv.indexOf('--mock')
const mock = mockIndex >= 0 ? process.argv[mockIndex + 1] : undefined
const kinds = { retry: 'autre moyen de paiement (actions.restart)', notReady: 'non approuvée, rien encaissé', captured: 'déjà capturée : relecture', failed: 'échec définitif' }

async function main() {
  if (mockIndex >= 0 && (!mock || !/^[A-Z_]{3,60}$/.test(mock))) throw new Error('Code --mock invalide (ex. INSTRUMENT_DECLINED).')
  console.log('Test PayPal SANDBOX (aucun paiement réel). Identifiants : developer.paypal.com > Apps & Credentials > Sandbox.\n')
  const clientId = process.env.PAYPAL_SANDBOX_CLIENT_ID?.trim() || (await ask('Client ID Sandbox : '))
  const clientSecret = await ask('Secret Sandbox (masqué) : ', { hidden: true })
  if (!clientId || !clientSecret) throw new Error('Client ID et secret requis.')

  const paypal = createPayPalClient({ clientId, clientSecret, env: 'sandbox' })
  const orderId = `SANDBOXTEST${randomBytes(6).toString('hex').toUpperCase()}`

  const created = await paypal.createOrder({
    orderId,
    attempt: 1,
    currency: 'EUR',
    totalCents: 100,
    items: [{ offerId: 'test', title: 'Test Sandbox Krimossimo', unitCents: 100, quantity: 1 }],
    payer: { firstName: 'Test', lastName: 'Sandbox' },
  })
  console.log(`\n1. Authentification OK. Commande PayPal créée : ${created.id} (statut ${created.status})`)
  const links = Array.isArray(created.links) ? (created.links as { rel?: string; href?: string }[]) : []
  const approve = links.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href
  console.log(`2. Ouvrez ce lien et payez avec un compte ACHETEUR Sandbox :\n   ${approve ?? '(lien absent de la réponse)'}`)
  await ask('\n3. Appuyez sur Entrée une fois le paiement approuvé (ou fermez la fenêtre pour tester l’abandon)… ')

  const before = await paypal.getOrder(created.id)
  console.log(`   Statut chez PayPal : ${before?.status ?? 'introuvable'}`)
  if (before?.status !== 'APPROVED') {
    console.log('   Non approuvée : rien ne sera capturé (scénario « annulation »). Fin du test.')
    return
  }
  const order = { status: 'payment_pending' as const, totalCents: 100, currency: 'EUR' as const, paypalOrderId: created.id, paypalOrderIds: [created.id] }
  if (mock) {
    try {
      await paypal.captureOrder(created.id, `${orderId}-capture-${created.id}-mock`, { mock })
      console.log(`4. Refus simulé ${mock} : PayPal a pourtant accepté la capture (à examiner).`)
    } catch (error) {
      if (!(error instanceof PayPalError)) throw error
      console.log(`4. Refus simulé reçu : HTTP ${error.httpStatus}, ${error.issue ?? '?'} → classé « ${error.httpStatus === 422 ? kinds[classifyCaptureIssue(error.issue)] : 'erreur PayPal'} »`)
    }
    return
  }
  const captured = await paypal.captureOrder(created.id, `${orderId}-capture-${created.id}-0`)
  const check = verifyCapture(captured, orderId, order)
  console.log(`4. Capture : ${check.ok ? `VÉRIFIÉE (capture ${check.capture.captureId}, ${check.capture.amount.value} ${check.capture.amount.currency})` : `NON conforme : ${check.reason}`}`)

  const replay = await paypal.captureOrder(created.id, `${orderId}-capture-${created.id}-0`)
  const again = verifyCapture(replay, orderId, order)
  console.log(`5. Capture rejouée avec la même clé : ${again.ok && check.ok && again.capture.captureId === check.capture.captureId ? 'même capture, aucun second encaissement' : 'résultat inattendu, à examiner'}`)
}

main().catch((error: unknown) => {
  if (error instanceof PayPalError) console.error(`\nPayPal a refusé la requête : ${error.message}`)
  else console.error(`\nÉchec : ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})

/**
 * Formulaire de contact de bout en bout côté serveur : le vrai service, un stockage en
 * mémoire et un faux serveur SMTP (accepte, refuse ou ne répond pas).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CONTACT_RATE_LIMIT } from './contact.js'
import { createContactService, type ContactRecord, type ContactStore } from './contactService.js'
import { smtpConfig, type Mailer, type OutgoingMail } from './mailer.js'

const body = (extra: Record<string, unknown> = {}) => ({
  lastName: 'Lovelace',
  firstName: 'Ada',
  email: 'ada@example.com',
  subject: 'website',
  message: 'Bonjour, je souhaite un site vitrine pour mon activité.',
  website: '',
  locale: 'fr',
  elapsedMs: 15_000,
  ...extra,
})

function setup({ mail = 'accept' as 'accept' | 'reject' | 'none', to = 'krimossimo.contact@gmail.com' } = {}) {
  const messages = new Map<string, ContactRecord & { deliveryAt?: Date }>()
  const counts = new Map<string, number>()
  const sent: OutgoingMail[] = []
  const logs: string[] = []
  const store: ContactStore = {
    async allow(key, max) {
      const n = (counts.get(key) ?? 0) + 1
      if (n > max) return false
      counts.set(key, n)
      return true
    },
    async saveMessage(record) {
      const id = `MSG${messages.size + 1}`
      messages.set(id, structuredClone(record))
      return id
    },
    async setDelivery(id, delivery, at) {
      Object.assign(messages.get(id)!, { delivery, deliveryAt: at })
    },
  }
  const mailer: Mailer = {
    async send(m) {
      if (mail === 'reject') throw Object.assign(new Error('535 Authentication failed for user secret@x'), { name: 'SmtpAuthError' })
      sent.push(m)
      return { messageId: '<id@smtp>' }
    },
  }
  const service = createContactService({
    store,
    mailer: () => (mail === 'none' ? null : mailer),
    to: () => to,
    log: { info: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m, d) => logs.push(`${m} ${JSON.stringify(d)}`) },
  })
  return { service, messages, sent, logs }
}

describe('envoi du formulaire de contact', () => {
  it('e-mail accepté par le serveur SMTP : succès, message enregistré « envoyé »', async () => {
    const t = setup()
    assert.deepEqual(await t.service.submit(body(), '203.0.113.7'), { status: 201, json: { ok: true, delivered: true } })
    assert.equal(t.sent.length, 1)
    assert.equal(t.sent[0]!.to, 'krimossimo.contact@gmail.com')
    assert.deepEqual(t.sent[0]!.replyTo, { name: 'Ada Lovelace', address: 'ada@example.com' })
    assert.equal(t.messages.get('MSG1')!.delivery, 'sent')
  })

  it('service d’envoi non configuré : erreur explicite, rien d’enregistré ni « envoyé »', async () => {
    for (const t of [setup({ mail: 'none' }), setup({ to: '' })]) {
      assert.deepEqual(await t.service.submit(body(), '203.0.113.7'), { status: 503, json: { error: 'mail_not_configured' } })
      assert.equal(t.messages.size, 0)
      assert.equal(t.sent.length, 0)
    }
  })

  it('échec SMTP : erreur explicite, message conservé « échec » pour l’administration, journal sans détail sensible', async () => {
    const t = setup({ mail: 'reject' })
    assert.deepEqual(await t.service.submit(body(), '203.0.113.7'), { status: 502, json: { error: 'mail_failed' } })
    assert.equal(t.messages.get('MSG1')!.delivery, 'failed')
    const logs = t.logs.join('\n')
    assert.ok(logs.includes('contact mail delivery failed'))
    assert.ok(!logs.includes('secret@x') && !logs.includes('ada@example.com'))
  })

  it('robot (champ piège) : réponse identique à un succès, rien n’est enregistré ni envoyé', async () => {
    const t = setup()
    assert.deepEqual(await t.service.submit(body({ website: 'http://spam.example' }), '203.0.113.7'), { status: 200, json: { ok: true, delivered: true } })
    assert.equal(t.messages.size, 0)
    assert.equal(t.sent.length, 0)
  })

  it('envoi trop rapide, trop de liens ou champ invalide : refusés sans envoi', async () => {
    const t = setup()
    assert.deepEqual(await t.service.submit(body({ elapsedMs: 800 }), '1'), { status: 400, json: { error: 'too_fast' } })
    assert.deepEqual(await t.service.submit(body({ message: 'a http://1.x b http://2.x c http://3.x d http://4.x e' }), '1'), {
      status: 400,
      json: { error: 'too_many_links' },
    })
    assert.deepEqual(await t.service.submit(body({ email: 'pas-un-email' }), '1'), { status: 400, json: { error: 'invalid_request', field: 'email' } })
    assert.equal(t.sent.length, 0)
  })

  it('limite de débit : 5 messages par heure et par adresse IP', async () => {
    const t = setup()
    for (let i = 0; i < CONTACT_RATE_LIMIT.max; i++) assert.equal((await t.service.submit(body(), '203.0.113.7')).status, 201)
    assert.deepEqual(await t.service.submit(body(), '203.0.113.7'), { status: 429, json: { error: 'rate_limited', retryAfterMs: CONTACT_RATE_LIMIT.windowMs } })
    assert.equal((await t.service.submit(body(), '198.51.100.9')).status, 201)
    assert.equal(t.sent.length, CONTACT_RATE_LIMIT.max + 1)
  })
})

describe('configuration SMTP', () => {
  it('incomplète ou invalide : envoi désactivé', () => {
    assert.deepEqual(smtpConfig({ host: 'smtp.gmail.com', port: '465', user: 'krimossimo.contact@gmail.com', pass: 'abcd efgh ijkl mnop' }), {
      host: 'smtp.gmail.com',
      port: 465,
      user: 'krimossimo.contact@gmail.com',
      pass: 'abcd efgh ijkl mnop',
    })
    assert.equal(smtpConfig({ host: 'smtp.gmail.com', port: '465', user: 'krimossimo.contact@gmail.com', pass: '' }), null)
    assert.equal(smtpConfig({ host: 'smtp.gmail.com', port: '465', user: '', pass: 'x' }), null)
    assert.equal(smtpConfig({ host: 'smtp.gmail.com', port: 'abc', user: 'a@b.fr', pass: 'x' }), null)
    assert.equal(smtpConfig({ host: 'smtp gmail', port: '465', user: 'a@b.fr', pass: 'x' }), null)
  })
})

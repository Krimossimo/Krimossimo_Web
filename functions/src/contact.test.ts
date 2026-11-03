/**
 * Formulaire de contact côté serveur (node:test) : `npm test` dans functions/.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CONTACT_RATE_LIMIT, MIN_FILL_MS, buildContactEmail, clientIp, isOverLimit, rateLimitExpiry, rateLimitKey, validateContactMessage } from './contact.js'

const valid = {
  lastName: ' Lovelace ',
  firstName: 'Ada',
  email: 'ada@example.com',
  subject: 'website',
  message: 'Bonjour, je souhaite un site vitrine pour mon activité.',
  website: '',
  locale: 'fr',
  elapsedMs: 12_000,
}

describe('validation du message', () => {
  it('accepte un message complet et nettoie les espaces', () => {
    const check = validateContactMessage(valid)
    assert.ok(check.ok)
    assert.equal(check.value.lastName, 'Lovelace')
    assert.deepEqual(Object.keys(check.value).sort(), ['email', 'firstName', 'lastName', 'locale', 'message', 'subject'])
  })

  it('refuse chaque champ invalide', () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ lastName: '' }, 'lastName'],
      [{ firstName: 'x'.repeat(81) }, 'firstName'],
      [{ email: 'ada@' }, 'email'],
      [{ subject: 'admin' }, 'subject'],
      [{ message: 'Trop court' }, 'message'],
      [{ message: 'x'.repeat(2001) }, 'message'],
    ]
    for (const [patch, field] of cases) assert.deepEqual(validateContactMessage({ ...valid, ...patch }), { ok: false, error: field })
  })

  it('anti-spam : délai de saisie, liens, balises et retours à la ligne dans les noms', () => {
    assert.deepEqual(validateContactMessage({ ...valid, elapsedMs: MIN_FILL_MS - 1 }), { ok: false, error: 'too_fast' })
    assert.deepEqual(validateContactMessage({ ...valid, elapsedMs: undefined }), { ok: false, error: 'too_fast' })
    assert.deepEqual(validateContactMessage({ ...valid, elapsedMs: '9000' }), { ok: false, error: 'too_fast' })
    const links = 'Voir https://a.example https://b.example www.c.example http://d.example pour le détail.'
    assert.deepEqual(validateContactMessage({ ...valid, message: links }), { ok: false, error: 'links' })
    assert.equal(validateContactMessage({ ...valid, message: 'Mon site actuel : https://exemple.fr, à refaire.' }).ok, true)
    assert.deepEqual(validateContactMessage({ ...valid, firstName: 'Ada\r\nBcc: x@y.z' }), { ok: false, error: 'firstName' })
    assert.deepEqual(validateContactMessage({ ...valid, lastName: '<b>Promo</b>' }), { ok: false, error: 'lastName' })
    assert.deepEqual(validateContactMessage({ ...valid, lastName: 'www.promo.example' }), { ok: false, error: 'lastName' })
    assert.deepEqual(validateContactMessage({ ...valid, message: 'Bonjour\u0000 je souhaite un devis complet.' }), { ok: false, error: 'message' })
    assert.equal(validateContactMessage({ ...valid, message: 'Bonjour,\n\nje souhaite un devis complet.\tMerci.' }).ok, true)
  })

  it('e-mail : texte brut, sujet lisible, réponse adressée au visiteur', () => {
    const check = validateContactMessage(valid)
    assert.ok(check.ok)
    const mail = buildContactEmail(check.value, new Date('2026-11-03T10:00:00Z'), 'MSG123')
    assert.equal(mail.subject, '[Krimossimo] Création de site web — Ada Lovelace')
    assert.deepEqual(mail.replyTo, { name: 'Ada Lovelace', address: 'ada@example.com' })
    assert.ok(mail.text.includes('Bonjour, je souhaite un site vitrine pour mon activité.'))
    assert.ok(mail.text.includes('Référence : MSG123'))
    assert.ok(!/[\r\n]/.test(mail.subject))
  })

  it('champ piège rempli : signalé comme spam (rien n’est enregistré)', () => {
    assert.deepEqual(validateContactMessage({ ...valid, website: 'http://spam' }), { ok: false, error: 'honeypot', spam: true })
  })

  it('ne conserve aucun champ inattendu', () => {
    const check = validateContactMessage({ ...valid, status: 'read', admin: true })
    assert.ok(check.ok)
    assert.equal('status' in check.value, false)
    assert.equal('admin' in check.value, false)
  })
})

describe('limite de débit', () => {
  const hour = CONTACT_RATE_LIMIT.windowMs
  it('même IP et même heure : même clé ; l’IP n’apparaît pas', () => {
    const t = Date.parse('2026-10-22T10:05:00Z')
    const key = rateLimitKey('203.0.113.7', t, 'sel')
    assert.equal(key, rateLimitKey('203.0.113.7', t + 10 * 60 * 1000, 'sel'))
    assert.notEqual(key, rateLimitKey('203.0.113.7', t + hour, 'sel'))
    assert.notEqual(key, rateLimitKey('203.0.113.8', t, 'sel'))
    assert.equal(key.includes('203'), false)
    assert.match(key, /^[0-9a-f]{40}$/)
  })

  it('adresse du client : dernière entrée ajoutée par l’infrastructure, pas celle fournie par le client', () => {
    assert.equal(clientIp('1.2.3.4, 203.0.113.7', '10.0.0.1'), '203.0.113.7')
    assert.equal(clientIp('203.0.113.7', '10.0.0.1'), '203.0.113.7')
    assert.equal(clientIp(['9.9.9.9', '203.0.113.7'], undefined), '203.0.113.7')
    assert.equal(clientIp(undefined, '10.0.0.1'), '10.0.0.1')
    assert.equal(clientIp(' , ', undefined), 'inconnue')
  })

  it('5 messages par heure, expiration en fin de fenêtre', () => {
    assert.equal(isOverLimit(5), false)
    assert.equal(isOverLimit(6), true)
    assert.equal(rateLimitExpiry(Date.parse('2026-10-22T10:05:00Z')), Date.parse('2026-10-22T11:00:00Z'))
  })
})

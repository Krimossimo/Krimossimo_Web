import { describe, expect, it } from 'vitest'
import { ContactNotConfiguredError, emptyContact, sendContactMessage, validateContact, validateField } from './contact'

const values = { ...emptyContact, lastName: 'Lovelace', firstName: 'Ada', email: 'ada@example.com', subject: 'website' as const, message: 'Bonjour, je souhaite un site vitrine.' }

function fakeFetch(reply: { status?: number; body?: unknown } | Error) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) })
    if (reply instanceof Error) throw reply
    return new Response(JSON.stringify(reply.body ?? null), { status: reply.status ?? 200 })
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe('validation du formulaire de contact', () => {
  it('nom, prénom, e-mail, sujet et message obligatoires', () => {
    expect(Object.keys(validateContact(emptyContact)).sort()).toEqual(['email', 'firstName', 'lastName', 'message', 'subject'])
    expect(validateContact(values)).toEqual({})
  })

  it('pas plus de 3 liens par message', () => {
    expect(validateField('message', { ...values, message: 'a https://1.fr b https://2.fr c www.3.fr d http://4.fr' })).toEqual({ code: 'links', max: 3 })
    expect(validateField('message', { ...values, message: 'Mon site : https://exemple.fr à refaire.' })).toBeUndefined()
  })
})

describe('envoi', () => {
  const url = 'https://api.test/submitContact'

  it('succès uniquement si le serveur confirme l’envoi de l’e-mail', async () => {
    const ok = fakeFetch({ status: 201, body: { ok: true, delivered: true } })
    await expect(sendContactMessage(values, 'fr', 12000, { url, fetch: ok.impl })).resolves.toBeUndefined()
    expect(ok.calls[0].body).toMatchObject({ lastName: 'Lovelace', firstName: 'Ada', subject: 'website', elapsedMs: 12000, website: '' })
    await expect(sendContactMessage(values, 'fr', 12000, { url, fetch: fakeFetch({ status: 200, body: { ok: true } }).impl })).rejects.toMatchObject({ code: 'server' })
    await expect(sendContactMessage(values, 'fr', 12000, { url, fetch: fakeFetch({ status: 200, body: null }).impl })).rejects.toMatchObject({ code: 'server' })
  })

  it('service non configuré (site ou serveur) : jamais présenté comme envoyé', async () => {
    await expect(sendContactMessage(values, 'fr', 12000, { url: '', fetch: fakeFetch({ body: { ok: true, delivered: true } }).impl })).rejects.toBeInstanceOf(ContactNotConfiguredError)
    await expect(sendContactMessage(values, 'fr', 12000, { url, fetch: fakeFetch({ status: 503, body: { error: 'mail_not_configured' } }).impl })).rejects.toBeInstanceOf(ContactNotConfiguredError)
  })

  it('traduit les refus du serveur et les erreurs réseau', async () => {
    const cases: [number, unknown, string][] = [
      [429, { error: 'rate_limited' }, 'rate-limited'],
      [400, { error: 'too_fast' }, 'too-fast'],
      [400, { error: 'too_many_links' }, 'too-many-links'],
      [400, { error: 'invalid_request', field: 'email' }, 'invalid'],
      [502, { error: 'mail_failed' }, 'mail-failed'],
      [500, { error: 'server' }, 'server'],
      [403, { error: 'origin_not_allowed' }, 'server'],
    ]
    for (const [status, body, code] of cases) {
      await expect(sendContactMessage(values, 'fr', 12000, { url, fetch: fakeFetch({ status, body }).impl })).rejects.toMatchObject({ code })
    }
    await expect(sendContactMessage(values, 'fr', 12000, { url, fetch: fakeFetch(new TypeError('Failed to fetch')).impl })).rejects.toMatchObject({ code: 'network' })
  })
})

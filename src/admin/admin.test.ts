import { describe, expect, it } from 'vitest'
import { projects } from '../data/projects'
import { offers } from '../data/offers'
import { demoGames, demoOffers, demoProjects } from '../data/demo'
import { AdminApiError, createAdminClient } from './adminApi'
import { mailtoHref, parseAdminMessage, parseAdminOrder } from './adminData'
import { authErrorCode, checkNewPassword, readAdminClaim } from './authService'
import { SERVER_TIMESTAMP, checkStoredDocument, displayTitle, prepareContentWrite, publicationUpdate } from './contentAdmin'
import { safeNext } from './navigation'
import { checkImageFile, storagePathFor } from './upload'

describe('rôle et connexion', () => {
  it('le rôle n’est reconnu que si le claim vaut exactement true', () => {
    expect(readAdminClaim({ admin: true })).toBe(true)
    for (const claims of [undefined, {}, { admin: 'true' }, { admin: 1 }, { role: 'admin' }, { isAdmin: true }]) {
      expect(readAdminClaim(claims as Record<string, unknown> | undefined)).toBe(false)
    }
  })

  it('erreurs de connexion : aucun indice sur l’existence d’un compte', () => {
    for (const code of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/user-disabled', 'auth/invalid-login-credentials']) {
      expect(authErrorCode({ code })).toBe('invalid-credentials')
    }
    expect(authErrorCode({ code: 'auth/too-many-requests' })).toBe('too-many-requests')
    expect(authErrorCode({ code: 'auth/requires-recent-login' })).toBe('requires-recent-login')
    expect(authErrorCode({ code: 'auth/password-does-not-meet-requirements' })).toBe('weak-password')
    expect(authErrorCode(new Error('x'))).toBe('unknown')
  })

  it('politique de mot de passe', () => {
    expect(checkNewPassword('Court-1')).toBe('too-short')
    expect(checkNewPassword('seulementdesminuscules')).toBe('not-varied')
    expect(checkNewPassword('Phrase-de-passe-solide')).toBeNull()
  })

  it('redirection après connexion limitée à l’administration', () => {
    expect(safeNext('/admin/orders')).toBe('/admin/orders')
    expect(safeNext('/admin')).toBe('/admin')
    expect(safeNext('/admin/projects/site-vitrine')).toBe('/admin/projects/site-vitrine')
    for (const next of [null, '', '//evil.example', 'https://evil.example', '/admin/../shop', '/shop', '/admin//x', '/admin?x=1']) {
      expect(safeNext(next)).toBe('/admin')
    }
  })
})

describe('écriture de contenus', () => {
  it('les contenus réels et de démonstration produisent des documents conformes', () => {
    for (const item of [...projects, ...demoProjects]) expect(prepareContentWrite('projects', item, 'uid-admin').ok).toBe(true)
    for (const item of [...offers, ...demoOffers]) expect(prepareContentWrite('offers', item, 'uid-admin').ok).toBe(true)
    for (const item of demoGames) expect(prepareContentWrite('games', item, 'uid-admin').ok).toBe(true)
  })

  it('document Firestore : sans id ni isDemo, auteur et horodatage serveur', () => {
    const result = prepareContentWrite('offers', demoOffers[0], 'uid-admin')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.id).toBe(demoOffers[0].id)
    expect('id' in result.data).toBe(false)
    expect('isDemo' in result.data).toBe(false)
    expect(result.data.updatedBy).toBe('uid-admin')
    expect(result.data.updatedAt).toBe(SERVER_TIMESTAMP)
    expect(result.data.price).toBe(149)
  })

  it('refuse un contenu invalide ou sans administrateur identifié', () => {
    const bad = prepareContentWrite('projects', { ...projects[0], externalUrl: 'javascript:alert(1)' }, 'uid-admin')
    expect(bad.ok).toBe(false)
    expect(prepareContentWrite('projects', projects[0], '').ok).toBe(false)
    expect(prepareContentWrite('offers', { ...demoOffers[0], price: -5 }, 'uid-admin').ok).toBe(false)
  })

  it('vidéo : identifiant YouTube comme identifiant de document', () => {
    const result = prepareContentWrite('videos', { youtubeId: 'dQw4w9WgXcQ', title: 'Vidéo', publishedAt: '2026-10-01' }, 'uid-admin')
    expect(result).toMatchObject({ ok: true, id: 'dQw4w9WgXcQ' })
  })

  it('publication et affichage', () => {
    expect(publicationUpdate('published', 'u')).toEqual({ publication: 'published', updatedAt: SERVER_TIMESTAMP, updatedBy: 'u' })
    expect(displayTitle({ title: { fr: 'Titre', en: 'Title' } }, 'id')).toBe('Titre')
    expect(displayTitle({}, 'id')).toBe('id')
    expect(checkStoredDocument('projects', 'x', { title: 'Sans le reste' }).length).toBeGreaterThan(0)
  })
})

describe('commandes et messages (lecture administrateur)', () => {
  const order = {
    status: 'paid',
    currency: 'EUR',
    totalCents: 22880,
    items: [
      { offerId: 'a', title: 'Prestation', unitCents: 14900, quantity: 1 },
      { offerId: 'b', title: 'Publication', unitCents: 3990, quantity: 2 },
    ],
    customer: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', country: 'France', phone: '+33 6 00 00 00 00' },
    project: { details: 'Besoin', referenceUrl: 'https://example.com', deadline: 'asap' },
    createdAt: { seconds: 1790000000 },
    accessTokenHash: 'x'.repeat(64),
  }

  it('lit une commande valide sans exposer le hachage du jeton', () => {
    const parsed = parseAdminOrder('Commande1234', order)
    expect(parsed).toMatchObject({ id: 'Commande1234', status: 'paid', totalCents: 22880, fulfillment: 'todo' })
    expect(JSON.stringify(parsed)).not.toContain('accessTokenHash')
    expect(parsed?.customer.phone).toBe('+33 6 00 00 00 00')
  })

  it('écarte une commande incohérente', () => {
    expect(parseAdminOrder('x', { ...order, status: 'livrée' })).toBeNull()
    expect(parseAdminOrder('x', { ...order, currency: 'BTC' })).toBeNull()
    expect(parseAdminOrder('x', { ...order, customer: { firstName: 'A' } })).toBeNull()
    expect(parseAdminOrder('x', { ...order, items: [{ offerId: 'a' }] })).toBeNull()
  })

  it('commande : environnement PayPal, capture et anomalies de paiement', () => {
    expect(parseAdminOrder('x', order)).toMatchObject({ paymentEnv: 'sandbox', lateCapture: false, alerts: [] })
    const live = parseAdminOrder('x', {
      ...order,
      paymentEnv: 'live',
      paypalCaptureId: 'CAP123',
      lateCapture: true,
      paymentAlerts: [{ kind: 'duplicate_capture', captureId: 'CAP456' }, { kind: 'autre' }, 'x'],
    })
    expect(live).toMatchObject({ paymentEnv: 'live', paypalCaptureId: 'CAP123', lateCapture: true })
    expect(live?.alerts).toEqual([{ kind: 'duplicate_capture', captureId: 'CAP456' }])
    expect(parseAdminOrder('x', { ...order, status: 'payment_failed', failureReason: 'TRANSACTION_REFUSED' })?.failureReason).toBe('TRANSACTION_REFUSED')
  })

  it('lien mailto sans injection de paramètres', () => {
    expect(mailtoHref('ada@example.com', 'Re: Site')).toBe('mailto:ada@example.com?subject=Re%3A%20Site')
    expect(mailtoHref('a@b.co?cc=pirate@x.fr')).toBe('mailto:a%40b.co%3Fcc%3Dpirate%40x.fr')
  })

  it('message : statut par défaut « nouveau »', () => {
    expect(parseAdminMessage('m1', { firstName: 'A', lastName: 'B', email: 'a@b.fr', message: 'Bonjour', subject: 'website' })).toMatchObject({
      status: 'new',
      subject: 'website',
    })
    expect(parseAdminMessage('m1', { firstName: 'A' })).toBeNull()
  })

  it('message : état d’envoi de l’e-mail (absent pour les anciens messages)', () => {
    const base = { firstName: 'A', lastName: 'B', email: 'a@b.fr', message: 'Bonjour', subject: 'website' }
    expect(parseAdminMessage('m1', { ...base, delivery: 'failed' })?.delivery).toBe('failed')
    expect(parseAdminMessage('m1', { ...base, delivery: 'sent' })?.delivery).toBe('sent')
    expect(parseAdminMessage('m1', { ...base, delivery: 'autre' })?.delivery).toBeUndefined()
    expect(parseAdminMessage('m1', base)?.delivery).toBeUndefined()
  })
})

describe('client des fonctions d’administration', () => {
  function fakeFetch(status: number, body: unknown) {
    const calls: { url: string; headers: Record<string, string>; body: unknown }[] = []
    const impl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify(body), { status })
    }) as unknown as typeof fetch
    return { impl, calls }
  }

  it('joint le jeton de session et n’envoie que l’action demandée', async () => {
    const { impl, calls } = fakeFetch(200, { orderId: 'Commande1234', fulfillment: 'delivered' })
    const client = createAdminClient({ baseUrl: 'https://api.test', getToken: async () => 'jeton-id', fetch: impl })
    expect(await client.updateOrderFulfillment('Commande1234', 'delivered')).toBe('delivered')
    expect(calls[0].url).toBe('https://api.test/adminUpdateOrder')
    expect(calls[0].headers.Authorization).toBe('Bearer jeton-id')
    expect(calls[0].body).toEqual({ orderId: 'Commande1234', fulfillment: 'delivered' })
  })

  it('refus du serveur : codes lisibles', async () => {
    const cases: [number, string][] = [
      [401, 'unauthenticated'],
      [403, 'forbidden'],
      [409, 'invalid-state'],
      [500, 'server'],
    ]
    for (const [status, code] of cases) {
      const { impl } = fakeFetch(status, { error: 'x' })
      const client = createAdminClient({ baseUrl: 'https://api.test', getToken: async () => 't', fetch: impl })
      await expect(client.updateMessageStatus('Message12345', 'read')).rejects.toMatchObject({ code })
    }
  })

  it('sans session ou sans URL : aucun appel', async () => {
    const { impl, calls } = fakeFetch(200, {})
    const noSession = createAdminClient({ baseUrl: 'https://api.test', getToken: async () => Promise.reject(new Error('x')), fetch: impl })
    await expect(noSession.updateMessageStatus('Message12345', 'read')).rejects.toBeInstanceOf(AdminApiError)
    const noUrl = createAdminClient({ baseUrl: '', getToken: async () => 't', fetch: impl })
    await expect(noUrl.updateMessageStatus('Message12345', 'read')).rejects.toMatchObject({ code: 'not-configured' })
    expect(calls).toHaveLength(0)
  })
})

describe('envoi d’images', () => {
  it('formats raster seulement, 5 Mo maximum', () => {
    expect(checkImageFile({ type: 'image/webp', size: 1000 })).toBeNull()
    expect(checkImageFile({ type: 'image/svg+xml', size: 1000 })).toBe('type')
    expect(checkImageFile({ type: 'text/html', size: 1000 })).toBe('type')
    expect(checkImageFile({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toBe('size')
    expect(checkImageFile({ type: 'image/png', size: 0 })).toBe('empty')
  })

  it('chemin sûr, extension déduite du type réel', () => {
    const path = storagePathFor('projects', { name: '../Évènement été!!.php.png', type: 'image/jpeg' }, new Date('2026-10-22T21:05:09Z'), 'a1b2c3')
    expect(path).toBe('public/images/projects/20261022-210509-a1b2c3-evenement-ete-php.jpg')
    expect(storagePathFor('site', { name: '.png', type: 'image/webp' }, new Date('2026-10-22T21:05:09Z'), '00ff00')).toBe('public/images/site/20261022-210509-00ff00-image.webp')
    expect(storagePathFor('games', { name: 'a.png', type: 'image/png' })).toMatch(/^public\/images\/games\/\d{8}-\d{6}-[0-9a-f]{6}-a\.png$/)
  })
})

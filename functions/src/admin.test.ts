/**
 * Contrôle d'accès administrateur et gestion des rôles (node:test) : `npm test` dans functions/.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  auditEntry,
  canUpdateFulfillment,
  hasAdminClaim,
  readBearerToken,
  validateMessageUpdate,
  validateOrderUpdate,
} from './admin.js'
import {
  AdminRoleError,
  checkAdminPassword,
  checkServiceAccountKey,
  parseUserRef,
  createAdmin,
  grantAdmin,
  listAdmins,
  revokeAdmin,
  type AdminUser,
  type AuthLike,
} from './adminRoles.js'

const token = 'eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiJ4In0.signature_abc-123'

describe('jeton et rôle', () => {
  it('lit uniquement un en-tête Bearer bien formé', () => {
    assert.equal(readBearerToken(`Bearer ${token}`), token)
    assert.equal(readBearerToken(token), null)
    assert.equal(readBearerToken('Basic dXNlcjpwYXNz'), null)
    assert.equal(readBearerToken('Bearer court'), null)
    assert.equal(readBearerToken(`Bearer ${token} autre`), null)
    assert.equal(readBearerToken(undefined), null)
    assert.equal(readBearerToken(['Bearer', token]), null)
  })

  it('exige le claim admin === true, rien d’autre', () => {
    assert.equal(hasAdminClaim({ uid: 'a', admin: true }), true)
    for (const decoded of [
      { uid: 'a' },
      { uid: 'a', admin: 'true' },
      { uid: 'a', admin: 1 },
      { uid: 'a', role: 'admin' },
      { uid: 'a', isAdmin: true },
      { admin: true },
      { uid: '', admin: true },
      null,
      'admin',
    ]) {
      assert.equal(hasAdminClaim(decoded), false, JSON.stringify(decoded))
    }
  })
})

describe('opérations d’administration', () => {
  it('suivi de commande : valeurs connues uniquement, note bornée', () => {
    assert.deepEqual(validateOrderUpdate({ orderId: 'AbCdEf1234567890', fulfillment: 'in_progress', note: ' Maquette envoyée ' }), {
      ok: true,
      value: { orderId: 'AbCdEf1234567890', fulfillment: 'in_progress', note: 'Maquette envoyée' },
    })
    assert.deepEqual(validateOrderUpdate({ orderId: 'AbCdEf1234567890', fulfillment: 'paid' }), { ok: false, error: 'fulfillment' })
    assert.deepEqual(validateOrderUpdate({ orderId: '../x', fulfillment: 'todo' }), { ok: false, error: 'orderId' })
    assert.deepEqual(validateOrderUpdate({ orderId: 'AbCdEf1234567890', fulfillment: 'todo', note: 'x'.repeat(1001) }), { ok: false, error: 'note' })
  })

  it('le suivi ne concerne que les commandes payées ; le paiement n’est jamais modifiable', () => {
    assert.equal(canUpdateFulfillment('paid'), true)
    for (const status of ['created', 'payment_pending', 'payment_failed', 'cancelled', undefined]) assert.equal(canUpdateFulfillment(status), false)
    // Aucun champ de la demande ne peut changer le statut de paiement.
    const check = validateOrderUpdate({ orderId: 'AbCdEf1234567890', fulfillment: 'delivered', status: 'paid', totalCents: 1 })
    assert.ok(check.ok)
    assert.deepEqual(Object.keys(check.value).sort(), ['fulfillment', 'note', 'orderId'])
  })

  it('statut de message', () => {
    assert.deepEqual(validateMessageUpdate({ messageId: 'AbCdEf1234567890', status: 'read' }), {
      ok: true,
      value: { messageId: 'AbCdEf1234567890', status: 'read' },
    })
    assert.deepEqual(validateMessageUpdate({ messageId: 'AbCdEf1234567890', status: 'deleted' }), { ok: false, error: 'status' })
  })

  it('journal : auteur et cible', () => {
    assert.deepEqual(auditEntry('order.fulfillment', { uid: 'u1', email: 'a@b.fr' }, 'o1', { fulfillment: 'todo' }), {
      action: 'order.fulfillment',
      actorUid: 'u1',
      actorEmail: 'a@b.fr',
      target: 'o1',
      details: { fulfillment: 'todo' },
    })
  })
})

/** Faux service d'authentification en mémoire. */
function fakeAuth(initial: AdminUser[] = []) {
  const users = new Map(initial.map((u) => [u.uid, { ...u }]))
  const revoked: string[] = []
  const auth: AuthLike = {
    async getUser(uid) {
      const user = users.get(uid)
      if (!user) throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' })
      return { ...user }
    },
    async getUserByEmail(email) {
      const user = [...users.values()].find((u) => u.email === email)
      if (!user) throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' })
      return { ...user }
    },
    async createUser({ email, disabled = false, emailVerified = false }) {
      if ([...users.values()].some((u) => u.email === email)) throw Object.assign(new Error('exists'), { code: 'auth/email-already-exists' })
      const user: AdminUser = { uid: `uid-${users.size + 1}`, email, disabled, emailVerified, customClaims: null }
      users.set(user.uid, user)
      return { ...user }
    },
    async setCustomUserClaims(uid, claims) {
      users.get(uid)!.customClaims = claims
    },
    async revokeRefreshTokens(uid) {
      revoked.push(uid)
    },
    async listUsers() {
      return { users: [...users.values()] }
    },
  }
  return { auth, users, revoked }
}

describe('gestion des rôles (script local)', () => {
  it('grant : ajoute admin en conservant les autres claims', async () => {
    const { auth, users } = fakeAuth([{ uid: 'u1', email: 'karim@example.com', disabled: false, customClaims: { beta: true } }])
    const { changed } = await grantAdmin(auth, ' Karim@Example.com ')
    assert.equal(changed, true)
    assert.deepEqual(users.get('u1')!.customClaims, { beta: true, admin: true })
    assert.equal((await grantAdmin(auth, 'karim@example.com')).changed, false)
  })

  it('grant par UID (copié depuis la console)', async () => {
    const { auth, users } = fakeAuth([{ uid: 'blTaWe7M5aao5wlilYcOiYwnNal1', email: 'krimossimopro@gmail.com', disabled: false }])
    const { user, changed } = await grantAdmin(auth, ' blTaWe7M5aao5wlilYcOiYwnNal1 ')
    assert.equal(changed, true)
    assert.equal(user.email, 'krimossimopro@gmail.com')
    assert.deepEqual(users.get('blTaWe7M5aao5wlilYcOiYwnNal1')!.customClaims, { admin: true })
    await assert.rejects(grantAdmin(auth, 'uidInconnu123'), (e: unknown) => e instanceof AdminRoleError && e.code === 'user-not-found')
  })

  it('identifiant : e-mail ou UID, rien d’autre', () => {
    assert.deepEqual(parseUserRef('Karim@Example.com'), { kind: 'email', email: 'karim@example.com' })
    assert.deepEqual(parseUserRef('blTaWe7M5aao5wlilYcOiYwnNal1'), { kind: 'uid', uid: 'blTaWe7M5aao5wlilYcOiYwnNal1' })
    for (const bad of ['', 'uid avec espace', '../x', 'x'.repeat(129), 'uid;rm']) {
      assert.throws(() => parseUserRef(bad), (e: unknown) => e instanceof AdminRoleError && e.code === 'invalid-uid', bad)
    }
  })

  it('clé de compte de service : hors du projet et du bon projet uniquement', () => {
    const key = JSON.stringify({ type: 'service_account', project_id: 'krimossimo-1111', private_key: '-----BEGIN PRIVATE KEY-----', client_email: 'x@krimossimo-1111.iam.gserviceaccount.com' })
    const root = 'E:\\Coding\\Mes projets\\Krimossimo_Web'
    assert.equal(checkServiceAccountKey('C:\\cles\\krimossimo.json', root, key, 'krimossimo-1111'), null)
    assert.equal(checkServiceAccountKey('E:\\Coding\\Mes projets\\Krimossimo_Web\\cle.json', root, key, 'krimossimo-1111'), 'inside-project')
    assert.equal(checkServiceAccountKey('e:\\coding\\mes projets\\krimossimo_web\\functions\\cle.json', root, key, 'krimossimo-1111'), 'inside-project')
    assert.equal(checkServiceAccountKey('E:\\Coding\\Mes projets\\Krimossimo_Web-cles\\cle.json', root, key, 'krimossimo-1111'), null)
    assert.equal(checkServiceAccountKey('C:\\cles\\k.json', root, key, 'autre-projet'), 'project-mismatch')
    assert.equal(checkServiceAccountKey('C:\\cles\\k.json', root, null, 'krimossimo-1111'), 'unreadable')
    assert.equal(checkServiceAccountKey('C:\\cles\\k.json', root, '{"apiKey":"AIza"}', 'krimossimo-1111'), 'not-service-account')
    assert.equal(checkServiceAccountKey('/home/k/cle.json', '/home/k/projet', key, 'krimossimo-1111'), null)
  })

  it('grant : refuse un compte inconnu, désactivé ou une adresse invalide', async () => {
    const { auth } = fakeAuth([{ uid: 'u2', email: 'off@example.com', disabled: true }])
    await assert.rejects(grantAdmin(auth, 'inconnu@example.com'), (e: unknown) => e instanceof AdminRoleError && e.code === 'user-not-found')
    await assert.rejects(grantAdmin(auth, 'off@example.com'), (e: unknown) => e instanceof AdminRoleError && e.code === 'user-disabled')
    await assert.rejects(grantAdmin(auth, 'pas@adresse'), (e: unknown) => e instanceof AdminRoleError && e.code === 'invalid-email')
  })

  it('revoke : retire le claim et révoque les sessions', async () => {
    const { auth, users, revoked } = fakeAuth([{ uid: 'u1', email: 'karim@example.com', disabled: false, customClaims: { admin: true } }])
    const { changed } = await revokeAdmin(auth, 'karim@example.com')
    assert.equal(changed, true)
    assert.equal(users.get('u1')!.customClaims, null)
    assert.deepEqual(revoked, ['u1'])
  })

  it('create : mot de passe robuste exigé, rôle posé, compte unique', async () => {
    const { auth, users } = fakeAuth()
    await assert.rejects(createAdmin(auth, 'karim@example.com', 'motdepasse'), (e: unknown) => e instanceof AdminRoleError && e.code === 'weak-password')
    const user = await createAdmin(auth, 'karim@example.com', 'Un-mot-de-passe-solide-42')
    assert.deepEqual(users.get(user.uid)!.customClaims, { admin: true })
    await assert.rejects(createAdmin(auth, 'karim@example.com', 'Un-mot-de-passe-solide-42'), (e: unknown) => e instanceof AdminRoleError && e.code === 'email-exists')
  })

  it('politique de mot de passe', () => {
    assert.equal(checkAdminPassword('Court1!'), 'too-short')
    assert.equal(checkAdminPassword('toutenminusculesmaislong'), 'not-varied')
    assert.equal(checkAdminPassword('Majuscules-et-minuscules'), null)
    assert.equal(checkAdminPassword('x'.repeat(129) + 'A1'), 'too-long')
  })

  it('list : uniquement les comptes avec admin === true', async () => {
    const { auth } = fakeAuth([
      { uid: 'u1', email: 'a@example.com', disabled: false, customClaims: { admin: true } },
      { uid: 'u2', email: 'b@example.com', disabled: false, customClaims: { admin: 'true' } },
      { uid: 'u3', email: 'c@example.com', disabled: false },
    ])
    assert.deepEqual((await listAdmins(auth)).map((u) => u.uid), ['u1'])
  })
})

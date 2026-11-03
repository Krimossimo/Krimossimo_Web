/**
 * Gestion des administrateurs Krimossimo — à exécuter EN LOCAL par le propriétaire du projet.
 *
 *   npm run admin -- create <email> --project <id-projet>   crée le compte initial (mot de passe saisi, masqué)
 *   npm run admin -- grant  <email|uid> --project <id>      donne le rôle à un compte existant
 *   npm run admin -- revoke <email|uid> --project <id>      retire le rôle et révoque les sessions
 *   npm run admin -- show   <email|uid> --project <id>      affiche le compte et ses claims
 *   npm run admin -- list           --project <id-projet>   liste les administrateurs
 *
 * grant et revoke affichent le compte visé et demandent de taper OUI avant d'agir.
 * Ajoutez --emulator pour agir sur les émulateurs locaux (aucun projet réel contacté).
 *
 * Identifiants : ce script utilise l'Admin SDK avec les identifiants Google de la personne
 * qui l'exécute (Application Default Credentials) :
 *   - soit `gcloud auth application-default login` (recommandé) ;
 *   - soit une clé de compte de service téléchargée dans la console, conservée HORS du dépôt,
 *     désignée par la variable GOOGLE_APPLICATION_CREDENTIALS, puis supprimée après usage.
 *     Le script refuse une clé placée dans le dossier du projet ou appartenant à un autre projet.
 * Aucun mot de passe n'est écrit sur le disque, dans l'historique du terminal ou dans les journaux.
 */
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import {
  AdminRoleError,
  checkAdminPassword,
  checkServiceAccountKey,
  createAdmin,
  findUser,
  grantAdmin,
  isAdmin,
  listAdmins,
  normalizeEmail,
  revokeAdmin,
  type AdminUser,
  type AuthLike,
  type KeyProblem,
} from '../src/adminRoles.js'

const usage = `Utilisation :
  npm run admin -- create <email>      --project <id>
  npm run admin -- grant  <email|uid>  --project <id>
  npm run admin -- revoke <email|uid>  --project <id>
  npm run admin -- show   <email|uid>  --project <id>
  npm run admin -- list                --project <id>
Options : --emulator (émulateurs locaux, projet demo-krimossimo par défaut)
          --yes      (pas de confirmation : à éviter, sauf automatisation contrôlée)`

const messages: Record<AdminRoleError['code'], string> = {
  'invalid-email': 'Adresse e-mail invalide.',
  'invalid-uid': 'UID invalide : copiez-le depuis la console Firebase (Authentication > Utilisateurs).',
  'user-not-found': 'Aucun compte avec cet identifiant dans ce projet. Vérifiez l’UID/l’adresse et --project.',
  'user-disabled': 'Ce compte est désactivé.',
  'weak-password': 'Mot de passe refusé : 12 caractères minimum, avec au moins 3 types (minuscules, majuscules, chiffres, symboles).',
  'email-exists': 'Un compte existe déjà avec cette adresse : utilisez « grant ».',
}

/** Lit une saisie sans l'afficher (mot de passe). */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    if (!stdin.isTTY) {
      reject(new Error('Saisie interactive requise (terminal) : le mot de passe ne peut pas être passé en argument.'))
      return
    }
    process.stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          process.stdout.write('\n')
          resolve(value)
          return
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false)
          process.stdout.write('\n')
          process.exit(130)
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1)
        else value += ch
      }
    }
    stdin.on('data', onData)
  })
}

const keyMessages: Record<KeyProblem, string> = {
  'inside-project':
    'La clé de compte de service est DANS le dossier du projet : déplacez-la hors du projet (ex. C:\\cles\\) ' +
    'pour qu’elle ne puisse jamais être versionnée, puis mettez à jour GOOGLE_APPLICATION_CREDENTIALS.',
  unreadable: 'Fichier de clé introuvable ou illisible (GOOGLE_APPLICATION_CREDENTIALS).',
  'not-service-account': 'Ce fichier n’est pas une clé de compte de service Firebase/Google Cloud.',
  'project-mismatch': 'Cette clé appartient à un AUTRE projet que celui indiqué par --project. Aucune action effectuée.',
}

/** Vérifie la clé de compte de service avant toute connexion à Firebase. */
function checkCredentials(project: string): boolean {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyPath) {
    console.log('Identifiants : Application Default Credentials (gcloud auth application-default login).')
    return true
  }
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  let absolute = resolve(keyPath)
  let content: string | null = null
  try {
    absolute = realpathSync(absolute)
    content = readFileSync(absolute, 'utf8')
  } catch {
    content = null
  }
  const problem = checkServiceAccountKey(absolute, realpathSync(projectRoot), content, project)
  if (problem) {
    console.error(keyMessages[problem])
    return false
  }
  console.log('Identifiants : clé de compte de service (hors du projet, projet vérifié).')
  return true
}

function describe(user: AdminUser): string {
  const claims = user.customClaims && Object.keys(user.customClaims).length ? JSON.stringify(user.customClaims) : 'aucun'
  return [
    `  e-mail        : ${user.email ?? '(aucun)'}`,
    `  uid           : ${user.uid}`,
    `  e-mail vérifié: ${user.emailVerified ? 'oui' : 'non'}`,
    `  désactivé     : ${user.disabled ? 'OUI' : 'non'}`,
    `  claims        : ${claims}`,
  ].join('\n')
}

/** Confirmation explicite (taper OUI). Sans terminal interactif, --yes est obligatoire. */
async function confirm(question: string, assumeYes: boolean): Promise<boolean> {
  if (assumeYes) return true
  if (!process.stdin.isTTY) {
    console.error('Confirmation impossible hors d’un terminal interactif : relancez dans un terminal (ou ajoutez --yes).')
    return false
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(`${question} Tapez OUI pour confirmer : `)).trim() === 'OUI'
  } finally {
    rl.close()
  }
}

async function audit(action: string, target: { uid: string; email?: string }) {
  try {
    await getFirestore()
      .collection('adminAudit')
      .add({ action, actorUid: 'cli', actorEmail: null, target: target.uid, details: { email: target.email ?? null }, at: FieldValue.serverTimestamp() })
  } catch (error) {
    // L'action est faite ; seul le journal a échoué (ex. base Firestore pas encore créée).
    console.warn('Attention : entrée de journal non enregistrée :', error instanceof Error ? error.message : error)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const flag = (name: string) => {
    const i = args.indexOf(name)
    if (i < 0) return undefined
    const value = args[i + 1]
    args.splice(i, 2)
    return value
  }
  const takeSwitch = (name: string) => {
    const i = args.indexOf(name)
    if (i >= 0) args.splice(i, 1)
    return i >= 0
  }
  const emulator = takeSwitch('--emulator')
  const assumeYes = takeSwitch('--yes')
  const project = flag('--project') ?? (emulator ? 'demo-krimossimo' : undefined)
  const [command, target] = args

  if (!command || !['create', 'grant', 'revoke', 'show', 'list'].includes(command) || (command !== 'list' && !target)) {
    console.log(usage)
    process.exitCode = 1
    return
  }
  if (!project) {
    console.error('Précisez le projet Firebase : --project <id-projet> (visible dans la console, Paramètres du projet).')
    process.exitCode = 1
    return
  }
  if (emulator) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
  } else if (!checkCredentials(project)) {
    process.exitCode = 1
    return
  }

  initializeApp({ projectId: project })
  const auth = getAuth() as unknown as AuthLike
  console.log(`Projet : ${project}${emulator ? ' (émulateurs locaux)' : ''}`)

  if (command === 'list') {
    const admins = await listAdmins(auth)
    if (!admins.length) console.log('Aucun administrateur.')
    for (const user of admins) console.log(`- ${user.email ?? '(sans e-mail)'}  uid=${user.uid}${user.disabled ? '  [désactivé]' : ''}`)
    return
  }

  if (command === 'show') {
    console.log(describe(await findUser(auth, target)))
    return
  }

  const email = target
  if (command === 'create') {
    normalizeEmail(email)
    const password = await promptHidden('Mot de passe (masqué) : ')
    const problem = checkAdminPassword(password)
    if (problem) throw new AdminRoleError('weak-password')
    const confirm = await promptHidden('Confirmez le mot de passe : ')
    if (confirm !== password) {
      console.error('Les deux saisies ne correspondent pas. Aucun compte créé.')
      process.exitCode = 1
      return
    }
    const user = await createAdmin(auth, email, password)
    await audit('admin.create', { uid: user.uid, email: user.email })
    console.log(`Compte administrateur créé : ${user.email} (uid=${user.uid}).`)
    console.log('Connectez-vous sur /admin/login du site.')
    return
  }

  // grant / revoke : on montre d'abord le compte visé, puis on demande confirmation.
  const account = await findUser(auth, target)
  console.log('Compte visé :')
  console.log(describe(account))

  if (command === 'grant') {
    if (isAdmin(account)) {
      console.log('Ce compte est déjà administrateur : rien à faire.')
      return
    }
    if (account.disabled) throw new AdminRoleError('user-disabled')
    if (!(await confirm(`Donner le rôle administrateur à ${account.email ?? account.uid} ?`, assumeYes))) {
      console.log('Annulé : aucune modification.')
      process.exitCode = 1
      return
    }
    const { user, changed } = await grantAdmin(auth, account.uid)
    if (changed) await audit('admin.grant', { uid: user.uid, email: user.email })
    const after = await auth.getUser(user.uid)
    console.log(`Rôle administrateur accordé. Claims enregistrés : ${JSON.stringify(after.customClaims ?? {})}`)
    console.log("Il s'applique à la prochaine connexion (le site force le rafraîchissement du jeton à la connexion).")
    return
  }

  if (!(await confirm(`Retirer le rôle administrateur à ${account.email ?? account.uid} et fermer ses sessions ?`, assumeYes))) {
    console.log('Annulé : aucune modification.')
    process.exitCode = 1
    return
  }
  const { user, changed } = await revokeAdmin(auth, account.uid)
  await audit('admin.revoke', { uid: user.uid, email: user.email })
  console.log(changed ? `Rôle retiré à ${user.email} et sessions révoquées.` : `${user.email} n'était pas administrateur ; sessions révoquées.`)
  console.log('Effet immédiat sur les fonctions serveur ; au plus tard 1 heure sur les règles Firestore/Storage.')
}

main().catch((error: unknown) => {
  if (error instanceof AdminRoleError) console.error(messages[error.code])
  else console.error('Échec :', error instanceof Error ? error.message : error)
  process.exitCode = 1
})

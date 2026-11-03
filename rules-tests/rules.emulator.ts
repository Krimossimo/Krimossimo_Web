/**
 * Tests des règles de sécurité contre les émulateurs Firebase (Firestore + Storage).
 *
 *   npm run test:rules
 *
 * Lance les émulateurs avec un projet de démonstration local (demo-krimossimo :
 * aucun projet réel n'est contacté), puis rejoue chaque cas de rules-tests/cases.ts.
 * Prérequis : Java 21+ (utilisé par les émulateurs).
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore'
import {
  SERVER_TIME,
  firestoreCases,
  firestoreSeed,
  storageCases,
  storageSeed,
  type FirestoreCase,
  type StorageCase,
  type Who,
} from './cases'

let env: RulesTestEnvironment

/** Remplace le marqueur d'horodatage et retire les champs undefined (refusés par le SDK). */
function prepare(data: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    out[key] = value === SERVER_TIME ? serverTimestamp() : value
  }
  return out
}

function contextOf(who: Who): RulesTestContext {
  return who.kind === 'anonymous' ? env.unauthenticatedContext() : env.authenticatedContext(who.uid, who.token ?? {})
}

function runFirestore(db: Firestore, test: FirestoreCase): Promise<unknown> {
  switch (test.op) {
    case 'get':
      return getDoc(doc(db, test.path))
    case 'list': {
      const ref = collection(db, test.path)
      const filters = (test.where ?? []).map(([field, value]) => where(field, '==', value))
      return getDocs(filters.length ? query(ref, ...filters) : ref)
    }
    case 'create':
      return setDoc(doc(db, test.path), prepare(test.data))
    case 'update':
      return updateDoc(doc(db, test.path), prepare(test.data))
    case 'delete':
      return deleteDoc(doc(db, test.path))
  }
}

function runStorage(context: RulesTestContext, test: StorageCase): Promise<unknown> {
  const ref = context.storage().ref(test.path)
  switch (test.op) {
    case 'get':
      return ref.getMetadata()
    case 'list':
      return ref.listAll()
    case 'upload':
      return Promise.resolve(ref.put(new Uint8Array(test.size ?? 1), { contentType: test.contentType }))
    case 'delete':
      return ref.delete()
  }
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-krimossimo',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env?.cleanup()
})

describe('firestore.rules', () => {
  beforeEach(async () => {
    await env.clearFirestore()
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore() as unknown as Firestore
      for (const [path, data] of Object.entries(firestoreSeed)) await setDoc(doc(db, path), data)
    })
  })

  for (const test of firestoreCases) {
    it(`${test.expect === 'allow' ? 'autorise' : 'refuse'} — ${test.name}`, async () => {
      const db = contextOf(test.who).firestore() as unknown as Firestore
      const attempt = runFirestore(db, test)
      await (test.expect === 'allow' ? assertSucceeds(attempt) : assertFails(attempt))
    })
  }
})

describe('storage.rules', () => {
  beforeEach(async () => {
    await env.clearStorage()
    await env.withSecurityRulesDisabled(async (context) => {
      for (const [path, file] of Object.entries(storageSeed)) {
        await context.storage().ref(path).put(new Uint8Array(file.size), { contentType: file.contentType })
      }
    })
  })

  for (const test of storageCases) {
    it(`${test.expect === 'allow' ? 'autorise' : 'refuse'} — ${test.name}`, async () => {
      const attempt = runStorage(contextOf(test.who), test)
      await (test.expect === 'allow' ? assertSucceeds(attempt) : assertFails(attempt))
    })
  }
})

import { refreshLoginLock } from './login-lock.mjs'
import { ensureMerchants } from './merchants.mjs'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const file = resolve(dirname(fileURLToPath(import.meta.url)), 'data/store.json')
const emptyStore = { users: [], transactions: [], sessions: [], otps: [], merchants: [] }

export function readStore() {
  const store = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : structuredClone(emptyStore)
  const now = Date.now()
  let changed = false
  // Los archivos creados por versiones anteriores no tienen todas las colecciones.
  for (const [key, value] of Object.entries(emptyStore)) {
    if (!Array.isArray(store[key])) { store[key] = structuredClone(value); changed = true }
  }
  if (ensureMerchants(store)) changed = true
  for (const user of store.users) {
    if (refreshLoginLock(user, now)) changed = true
  }
  if (changed) writeStore(store)
  return store
}

export function writeStore(store) {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(store, null, 2))
  renameSync(temp, file)
}

export function resetStore() {
  writeStore(structuredClone(emptyStore))
}

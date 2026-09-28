import { refreshLoginLock } from './login-lock.mjs'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const file = resolve(dirname(fileURLToPath(import.meta.url)), 'data/store.json')
const emptyStore = { users: [], transactions: [] }

export function readStore() {
  if (!existsSync(file)) return structuredClone(emptyStore)
  const store = JSON.parse(readFileSync(file, 'utf8'))
  const now = Date.now()
  let changed = false
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

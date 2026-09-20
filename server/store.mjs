import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const file = resolve(dirname(fileURLToPath(import.meta.url)), 'data/store.json')
const emptyStore = { users: [], transactions: [] }

export function readStore() {
  if (!existsSync(file)) return structuredClone(emptyStore)
  return JSON.parse(readFileSync(file, 'utf8'))
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

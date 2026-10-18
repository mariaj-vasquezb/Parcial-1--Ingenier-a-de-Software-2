import { randomUUID } from 'node:crypto'

// La sesión se cierra tras 15 minutos sin actividad del usuario (SWR-002).
export const SESSION_IDLE_MS = 15 * 60 * 1000

export const sessionExpired = (session, now = Date.now()) => now - Date.parse(session.lastActivityAt) >= SESSION_IDLE_MS

export function pruneSessions(store, now = Date.now()) {
  store.sessions = store.sessions.filter((session) => !sessionExpired(session, now))
}

export function openSession(store, userId, now = Date.now()) {
  pruneSessions(store, now)
  const stamp = new Date(now).toISOString()
  const session = { id: randomUUID(), userId, createdAt: stamp, lastActivityAt: stamp }
  store.sessions.push(session)
  return session
}

export function touchSession(session, now = Date.now()) {
  session.lastActivityAt = new Date(now).toISOString()
}

export function closeSession(store, sessionId) {
  store.sessions = store.sessions.filter((session) => session.id !== sessionId)
}

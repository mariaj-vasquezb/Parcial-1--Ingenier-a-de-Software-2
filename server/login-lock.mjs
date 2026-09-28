export const MAX_LOGIN_ATTEMPTS = 3
export const LOGIN_LOCK_MS = 15 * 60 * 1000

export function resetLoginAttempts(user) {
  user.failedAttempts = 0
  delete user.blockedUntil
}

export function refreshLoginLock(user, now = Date.now()) {
  if (user.status !== 'blocked') return false
  // Older lockouts have no expiry: start their temporary period once.
  if (!user.blockedUntil && user.failedAttempts >= MAX_LOGIN_ATTEMPTS) {
    user.blockedUntil = new Date(now + LOGIN_LOCK_MS).toISOString()
    return true
  }
  if (user.blockedUntil && Date.parse(user.blockedUntil) <= now) {
    user.status = 'active'
    resetLoginAttempts(user)
    return true
  }
  return false
}

export function recordFailedLogin(user, now = Date.now()) {
  if (user.status !== 'active') return
  user.failedAttempts = (user.failedAttempts || 0) + 1
  if (user.failedAttempts >= MAX_LOGIN_ATTEMPTS) {
    user.status = 'blocked'
    user.blockedUntil = new Date(now + LOGIN_LOCK_MS).toISOString()
  }
}

export function loginLockMessage(user, now = Date.now()) {
  const remaining = Date.parse(user.blockedUntil) - now
  if (!Number.isFinite(remaining)) return 'La cuenta está bloqueada. Contacta soporte.'
  const minutes = Math.max(1, Math.ceil(remaining / 60_000))
  return 'Cuenta bloqueada temporalmente por 3 intentos fallidos. Intenta nuevamente en ' + minutes + (minutes === 1 ? ' minuto.' : ' minutos.')
}

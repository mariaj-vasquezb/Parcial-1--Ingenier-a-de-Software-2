import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OTP_MAX_ATTEMPTS, OTP_TTL_MS, consumeOtp, issueOtp } from './otp.mjs'
import { SESSION_IDLE_MS, openSession, sessionExpired, touchSession } from './sessions.mjs'
import { rememberChallenge, takeChallenge } from './webauthn.mjs'

const now = Date.parse('2026-10-18T12:00:00Z')
const context = { recipientId: 'b', amount: 2_000_000 }
const wrong = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')

test('session closes after exactly 15 minutes without activity', () => {
  const store = { sessions: [] }
  const session = openSession(store, 'a', now)
  assert.equal(sessionExpired(session, now + SESSION_IDLE_MS - 1), false)
  touchSession(session, now + 10 * 60 * 1000)
  assert.equal(sessionExpired(session, now + SESSION_IDLE_MS + 1000), false)
  assert.equal(sessionExpired(session, now + 10 * 60 * 1000 + SESSION_IDLE_MS), true)
  openSession(store, 'b', now + 40 * 60 * 1000)
  assert.deepEqual(store.sessions.map((item) => item.userId), ['b'])
})

test('OTP is single use and bound to the previewed transfer', () => {
  const store = { otps: [] }
  const code = issueOtp(store, 'a', context, now)
  assert.match(code, /^[0-9]{6}$/)
  assert.equal(consumeOtp(store, 'a', { ...context, amount: 3_000_000 }, code, now).ok, false)
  assert.equal(consumeOtp(store, 'a', context, code, now).ok, true)
  assert.equal(consumeOtp(store, 'a', context, code, now).ok, false)
})

test('OTP expires and is discarded after too many wrong attempts', () => {
  const store = { otps: [] }
  assert.match(consumeOtp(store, 'a', context, '123456', now).message, /Solicita el código/)
  let code = issueOtp(store, 'a', context, now)
  assert.match(consumeOtp(store, 'a', context, code, now + OTP_TTL_MS).message, /expiró/)
  code = issueOtp(store, 'a', context, now)
  for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) assert.match(consumeOtp(store, 'a', context, wrong(code), now).message, /Te quedan/)
  assert.match(consumeOtp(store, 'a', context, wrong(code), now).message, /Superaste/)
  assert.equal(consumeOtp(store, 'a', context, code, now).ok, false)
})

test('a new OTP replaces the previous one', () => {
  const store = { otps: [] }
  const first = issueOtp(store, 'a', context, now)
  const second = issueOtp(store, 'a', context, now)
  assert.equal(store.otps.length, 1)
  if (first !== second) assert.equal(consumeOtp(store, 'a', context, first, now).ok, false)
})

test('biometric challenges are single use, purpose bound and expire', () => {
  const user = {}
  rememberChallenge(user, 'login', 'abc', now)
  assert.equal(takeChallenge(user, 'register', now), null)
  rememberChallenge(user, 'login', 'abc', now)
  assert.equal(takeChallenge(user, 'login', now + 1000), 'abc')
  assert.equal(takeChallenge(user, 'login', now + 1000), null)
  rememberChallenge(user, 'login', 'abc', now)
  assert.equal(takeChallenge(user, 'login', now + 2 * 60 * 1000), null)
})

import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

// Segundo factor para transferencias superiores a $1.000.000 (SWR-005).
export const OTP_TTL_MS = 5 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 3

const digest = (code) => createHash('sha256').update(String(code)).digest()
// El código solo sirve para la transferencia exacta que se previsualizó.
const bindingFor = ({ recipientId, amount }) => `${recipientId}:${amount}`

export function issueOtp(store, userId, context, now = Date.now()) {
  store.otps = store.otps.filter((otp) => otp.userId !== userId && Date.parse(otp.expiresAt) > now)
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  store.otps.push({ userId, binding: bindingFor(context), codeHash: digest(code).toString('hex'), attempts: 0, expiresAt: new Date(now + OTP_TTL_MS).toISOString() })
  return code
}

export function consumeOtp(store, userId, context, code, now = Date.now()) {
  const otp = store.otps.find((item) => item.userId === userId)
  const discard = () => { store.otps = store.otps.filter((item) => item !== otp) }
  if (!otp) return { ok: false, message: 'Solicita el código de confirmación para esta transferencia.' }
  if (Date.parse(otp.expiresAt) <= now) { discard(); return { ok: false, message: 'El código expiró. Solicita uno nuevo.' } }
  if (otp.binding !== bindingFor(context)) return { ok: false, message: 'El código no corresponde a esta transferencia. Solicita uno nuevo.' }
  const valid = /^[0-9]{6}$/.test(String(code ?? '')) && timingSafeEqual(digest(code), Buffer.from(otp.codeHash, 'hex'))
  if (valid) { discard(); return { ok: true } }
  otp.attempts += 1
  if (otp.attempts >= OTP_MAX_ATTEMPTS) { discard(); return { ok: false, message: 'Código incorrecto. Superaste los intentos; solicita un código nuevo.' } }
  return { ok: false, message: `Código incorrecto. Te quedan ${OTP_MAX_ATTEMPTS - otp.attempts} intentos.` }
}

import { createHmac, timingSafeEqual } from 'node:crypto'
import { WalletError } from './wallet.mjs'

// Formato: walletuq://pagar?c=<código del comercio>[&a=<monto>]&s=<firma>.
// La firma HMAC impide alterar el comercio o el monto impresos en el QR.
const PREFIX = 'walletuq://pagar?'
const invalid = () => new WalletError(400, 'El código QR no es válido para pagos WalletUQ.')
const sign = (secret, code, amount) => createHmac('sha256', secret).update(`${code}|${amount ?? ''}`).digest('base64url').slice(0, 22)

export function merchantQrPayload(secret, code, amount = null) {
  const params = new URLSearchParams({ c: code })
  if (amount) params.set('a', String(amount))
  params.set('s', sign(secret, code, amount))
  return PREFIX + params
}

export function readMerchantQr(secret, text) {
  const value = String(text ?? '').trim()
  if (!value.startsWith(PREFIX)) throw invalid()
  const params = new URLSearchParams(value.slice(PREFIX.length))
  const code = params.get('c'); const rawAmount = params.get('a'); const signature = params.get('s')
  if (!code || !signature || !/^[A-Z0-9-]{3,20}$/.test(code)) throw invalid()
  const amount = rawAmount === null ? null : Number(rawAmount)
  if (amount !== null && (!Number.isSafeInteger(amount) || amount <= 0)) throw invalid()
  const expected = Buffer.from(sign(secret, code, amount))
  const supplied = Buffer.from(signature)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw invalid()
  return { code, amount }
}

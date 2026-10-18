import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyIdentity } from './kyc.mjs'
import { APPROVED_TEST_CARD, DECLINED_TEST_CARD, chargeCard, debitPse, findPseBank, validateCard } from './payment-gateway.mjs'
import { merchantQrPayload, readMerchantQr } from './qr.mjs'

const now = new Date('2026-10-18T12:00:00Z')
const card = (overrides = {}) => ({ number: APPROVED_TEST_CARD, expiry: '12/30', cvv: '123', ...overrides })

test('KYC mock approves real documents and rejects the test suffix', () => {
  assert.equal(verifyIdentity({ document: '1094001234' }).approved, true)
  const rejected = verifyIdentity({ document: '1094000000' })
  assert.equal(rejected.approved, false)
  assert.match(rejected.reason, /proveedor de identidad/)
})

test('card validation checks Luhn, expiry and CVV', () => {
  assert.equal(validateCard(card(), now), null)
  assert.match(validateCard(card({ number: '4242424242424241' }), now), /número/)
  assert.match(validateCard(card({ expiry: '13/30' }), now), /MM\/AA/)
  assert.match(validateCard(card({ expiry: '09/26' }), now), /vencida/)
  assert.equal(validateCard(card({ expiry: '10/26' }), now), null)
  assert.match(validateCard(card({ cvv: '12' }), now), /CVV/)
})

test('gateway approves, declines the test card and the rejecting PSE bank', () => {
  assert.equal(chargeCard(card()).approved, true)
  assert.equal(chargeCard(card({ number: DECLINED_TEST_CARD })).approved, false)
  assert.equal(debitPse(findPseBank('bancolombia')).approved, true)
  assert.equal(debitPse(findPseBank('pruebas-rechazo')).approved, false)
  assert.equal(findPseBank('inexistente'), undefined)
})

test('merchant QR round-trips and rejects tampering', () => {
  const secret = 'test-secret'
  assert.deepEqual(readMerchantQr(secret, merchantQrPayload(secret, 'CAFE-UQ', 12000)), { code: 'CAFE-UQ', amount: 12000 })
  assert.deepEqual(readMerchantQr(secret, merchantQrPayload(secret, 'LIB-CENTRO')), { code: 'LIB-CENTRO', amount: null })
  const fixed = merchantQrPayload(secret, 'CAFE-UQ', 12000)
  for (const forged of [fixed.replace('a=12000', 'a=100'), fixed.replace('CAFE-UQ', 'LIB-CENTRO'), merchantQrPayload('other-secret', 'CAFE-UQ', 12000), 'https://example.com', '', 'walletuq://pagar?c=CAFE-UQ']) {
    assert.throws(() => readMerchantQr(secret, forged), /no es válido/, forged)
  }
})

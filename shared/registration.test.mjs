import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateRegistration } from './registration.mjs'
const valid = { fullName: 'Ana Torres', document: '12345678', email: 'ana@gmail.com', phone: '3001234567', pin: '012345', acceptedKyc: true }
test('accepts six-digit PINs including leading zeroes and multiple email providers', () => {
  for (const email of ['ana@gmail.com', 'ana@outlook.com', 'ana@uni.edu.co', ' ana@gmail.com ']) assert.deepEqual(validateRegistration({ ...valid, email }), {})
})
test('reports the actual invalid field without blaming a valid PIN', () => {
  for (const [field, values] of Object.entries({ email: ['', 'ana', 'ana@', 'ana@gmail', 'ana@.com', 'ana@gmail.', 'ana@@gmail.com', 'ana..torres@gmail.com'], phone: ['', '300123456', '30012345678', '2001234567', '30012abc67'], document: ['', '12345', '1234567890123'], fullName: ['   '], acceptedKyc: [false] })) {
    for (const value of values) {
      const errors = validateRegistration({ ...valid, [field]: value })
      assert.deepEqual(Object.keys(errors), [field], field + ': ' + value)
      assert.equal(errors.pin, undefined)
    }
  }
})
test('rejects incomplete, long, nonnumeric and non-string PINs', () => {
  for (const pin of ['', '12345', '1234567', '12345a', 123456]) assert.ok(validateRegistration({ ...valid, pin }).pin)
})
test('reports all missing fields', () => assert.equal(Object.keys(validateRegistration({})).length, 6))

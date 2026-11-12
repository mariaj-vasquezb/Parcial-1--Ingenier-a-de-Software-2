import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WalletError } from './wallet.mjs'
import { createTransferService } from './transfer-service.mjs'

const user = (id, overrides = {}) => ({ id, document: `${id}-document`, accountNumber: `${id}-account`, status: 'active', points: 0, balance: 200_000, ...overrides })
const setup = (otp = { issue: () => '123456', consume: () => ({ ok: true }) }) => {
  const sender = user('sender')
  const recipient = user('recipient', { balance: 10_000 })
  const store = { users: [sender, recipient], transactions: [], otps: [] }
  const events = []
  const service = createTransferService({
    repository: { save: (savedStore) => events.push(['save', savedStore]) },
    notifier: { notify: (...userIds) => events.push(['notify', ...userIds]) },
    otp,
  })
  return { sender, recipient, store, events, service }
}

test('executes a transfer, persists it, then notifies both users', () => {
  const { sender, recipient, store, events, service } = setup()
  const result = service.execute({ input: { recipient: recipient.document, amount: 100_000, description: 'Pago' }, user: sender, store })

  assert.equal(sender.balance, 95_000)
  assert.equal(recipient.balance, 110_000)
  assert.equal(sender.points, 10)
  assert.deepEqual({ amount: result.transaction.amount, fee: result.transaction.fee, status: result.transaction.status, description: result.transaction.description }, {
    amount: 100_000, fee: 5_000, status: 'completed', description: 'Pago',
  })
  assert.equal(store.transactions[0], result.transaction)
  assert.equal(events[0][0], 'save')
  assert.deepEqual(events[1], ['notify', sender.id, recipient.id])
})

test('persists invalid OTP attempts without moving balances or notifying', () => {
  let attempts = 0
  const { sender, recipient, store, events, service } = setup({
    issue: () => '123456',
    consume: () => {
      attempts += 1
      return { ok: false, message: 'Código incorrecto. Te quedan 2 intentos.' }
    },
  })
  sender.points = 500
  sender.balance = 2_000_000
  const initialSenderBalance = sender.balance
  const initialRecipientBalance = recipient.balance

  assert.throws(
    () => service.execute({ input: { recipient: recipient.accountNumber, amount: 1_000_001, otp: '000000' }, user: sender, store }),
    (error) => error instanceof WalletError && error.status === 400 && error.extra.code === 'OTP_INVALID',
  )

  assert.equal(attempts, 1)
  assert.equal(sender.balance, initialSenderBalance)
  assert.equal(recipient.balance, initialRecipientBalance)
  assert.equal(store.transactions.length, 0)
  assert.equal(events.length, 1)
  assert.equal(events[0][0], 'save')
})

test('issues a confirmation only for transfers that require it and persists it', () => {
  const { sender, recipient, store, events, service } = setup({
    issue: (currentStore, userId, binding) => {
      currentStore.issuedOtp = { userId, binding }
      return '432100'
    },
    consume: () => ({ ok: true }),
  })
  sender.points = 500
  sender.balance = 2_000_000

  assert.equal(service.issueConfirmation({ input: { recipient: recipient.document, amount: 1_000_001 }, user: sender, store }), '432100')
  assert.deepEqual(store.issuedOtp, { userId: sender.id, binding: { recipientId: recipient.id, amount: 1_000_001 } })
  assert.equal(events.length, 1)
  assert.equal(events[0][0], 'save')
  assert.throws(
    () => service.issueConfirmation({ input: { recipient: recipient.document, amount: 100_000 }, user: sender, store }),
    (error) => error instanceof WalletError && error.status === 400,
  )
})

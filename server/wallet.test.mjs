import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WalletError, bogotaDay, levelInfo, newReference, parseAmount, quotePayment, quoteTransfer, sentToday } from './wallet.mjs'

const sender = (points, balance = 50_000_000) => ({ id: 'a', points, balance })
const transfer = (amount, createdAt, extra = {}) => ({ type: 'transfer', status: 'completed', fromUserId: 'a', amount, createdAt, ...extra })

test('level boundaries set fee, daily limit and progress', () => {
  for (const [points, level, feeRate, dailyLimit] of [[0, 'Bronze', 0.05, 500_000], [499, 'Bronze', 0.05, 500_000], [500, 'Silver', 0.03, 2_000_000], [1999, 'Silver', 0.03, 2_000_000], [2000, 'Gold', 0.01, 5_000_000], [9999, 'Gold', 0.01, 5_000_000], [10000, 'Platinum', 0, 20_000_000]]) {
    assert.deepEqual({ ...levelInfo(points), progress: undefined }, { level, feeRate, dailyLimit, progress: undefined }, String(points))
  }
  assert.equal(levelInfo(250).progress, 50)
  assert.equal(levelInfo(10000).progress, 100)
})

test('transfer quote applies the sender level fee and points', () => {
  for (const [points, fee] of [[0, 5_000], [500, 3_000], [2000, 1_000], [10000, 0]]) {
    const quote = quoteTransfer({ sender: sender(points), amount: 100_000, transactions: [] })
    assert.equal(quote.fee, fee); assert.equal(quote.total, 100_000 + fee); assert.equal(quote.points, 10)
  }
})

test('2FA is required only above $1.000.000', () => {
  assert.equal(quoteTransfer({ sender: sender(2000), amount: 1_000_000, transactions: [] }).requiresOtp, false)
  assert.equal(quoteTransfer({ sender: sender(2000), amount: 1_000_001, transactions: [] }).requiresOtp, true)
})

test('rejects insufficient balance including the fee', () => {
  assert.throws(() => quoteTransfer({ sender: sender(0, 100_000), amount: 100_000, transactions: [] }), (error) => error instanceof WalletError && /Te faltan \$5\.000/.test(error.message))
  assert.throws(() => quotePayment({ payer: sender(0, 10_000), amount: 10_000 }), /Saldo insuficiente/)
})

test('daily limit counts only completed transfers sent on the current Colombian day', () => {
  const now = Date.parse('2026-10-18T15:00:00Z')
  const transactions = [
    transfer(300_000, '2026-10-18T14:00:00Z'),
    transfer(100_000, '2026-10-18T03:00:00Z'), // 17 de octubre a las 10 p. m. en Bogotá
    transfer(100_000, '2026-10-18T13:00:00Z', { status: 'failed' }),
    transfer(100_000, '2026-10-18T13:00:00Z', { fromUserId: 'b' }),
  ]
  assert.equal(bogotaDay('2026-10-18T03:00:00Z'), '2026-10-17')
  assert.equal(sentToday(transactions, 'a', now), 300_000)
  assert.equal(quoteTransfer({ sender: sender(0), amount: 200_000, transactions, now }).amount, 200_000)
  assert.throws(() => quoteTransfer({ sender: sender(0), amount: 200_001, transactions, now }), /disponibles \$200\.000/)
})

test('amounts must be positive integers and references are unique', () => {
  for (const value of [0, -5, 'abc', undefined, Infinity]) assert.throws(() => parseAmount(value), /monto válido/)
  assert.equal(parseAmount('25000'), 25_000)
  const transactions = []
  for (let i = 0; i < 200; i++) transactions.push({ reference: newReference('TRX', transactions) })
  assert.equal(new Set(transactions.map((tx) => tx.reference)).size, 200)
})

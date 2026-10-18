import { randomUUID } from 'node:crypto'

export const LEVELS = {
  Bronze: { fee: 0.05, limit: 500_000, min: 0, next: 500 },
  Silver: { fee: 0.03, limit: 2_000_000, min: 500, next: 2_000 },
  Gold: { fee: 0.01, limit: 5_000_000, min: 2_000, next: 10_000 },
  Platinum: { fee: 0, limit: 20_000_000, min: 10_000, next: null },
}
export const POINTS_UNIT = 10_000
export const OTP_THRESHOLD = 1_000_000
export const MIN_DEPOSIT = 10_000
export const MAX_DEPOSIT = 20_000_000

// Error de negocio con el código HTTP que debe recibir el cliente.
export class WalletError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export const cop = (amount) => `$${amount.toLocaleString('es-CO')}`
export const levelFor = (points) => points >= 10000 ? 'Platinum' : points >= 2000 ? 'Gold' : points >= 500 ? 'Silver' : 'Bronze'
export const pointsFor = (amount) => Math.floor(amount / POINTS_UNIT)

export function levelInfo(points) {
  const level = levelFor(points)
  const config = LEVELS[level]
  const progress = config.next ? Math.min(100, Math.round(((points - config.min) / (config.next - config.min)) * 100)) : 100
  return { level, progress, feeRate: config.fee, dailyLimit: config.limit }
}

export function parseAmount(value) {
  const amount = Math.round(Number(value))
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new WalletError(400, 'Ingresa un monto válido.')
  return amount
}

// El límite diario se reinicia a medianoche en Colombia, no a medianoche UTC.
const bogotaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' })
export const bogotaDay = (value) => bogotaDate.format(new Date(value))

export function sentToday(transactions, userId, now = Date.now()) {
  const today = bogotaDay(now)
  return transactions
    .filter((tx) => tx.fromUserId === userId && tx.type === 'transfer' && tx.status === 'completed' && bogotaDay(tx.createdAt) === today)
    .reduce((sum, tx) => sum + tx.amount, 0)
}

function quote(payer, amount) {
  const { level, feeRate } = levelInfo(payer.points)
  const fee = Math.round(amount * feeRate)
  return { amount, fee, total: amount + fee, level, feeRate, points: pointsFor(amount) }
}

function assertBalance(payer, total) {
  if (payer.balance < total) throw new WalletError(400, `Saldo insuficiente. Te faltan ${cop(total - payer.balance)}.`)
}

export function quoteTransfer({ sender, amount, transactions, now = Date.now() }) {
  const result = quote(sender, amount)
  const { dailyLimit } = levelInfo(sender.points)
  const used = sentToday(transactions, sender.id, now)
  if (used + amount > dailyLimit) throw new WalletError(400, `Superas tu límite diario. Tienes disponibles ${cop(Math.max(0, dailyLimit - used))}.`)
  assertBalance(sender, result.total)
  return { ...result, requiresOtp: amount > OTP_THRESHOLD }
}

// Los pagos QR usan las mismas tasas de comisión que las transferencias (RF-006).
export function quotePayment({ payer, amount }) {
  const result = quote(payer, amount)
  assertBalance(payer, result.total)
  return result
}

export function newReference(prefix, transactions) {
  let reference
  do reference = `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`
  while (transactions.some((tx) => tx.reference === reference))
  return reference
}

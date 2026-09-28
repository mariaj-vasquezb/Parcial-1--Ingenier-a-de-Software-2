import { MAX_LOGIN_ATTEMPTS, recordFailedLogin, resetLoginAttempts, loginLockMessage } from './login-lock.mjs'
import express from 'express'
import { validateRegistration } from '../shared/registration.mjs'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { readStore, writeStore } from './store.mjs'

const app = express()
const PORT = Number(process.env.PORT || 4000)
const JWT_SECRET = process.env.JWT_SECRET || 'walletuq-local-development-secret'
const LEVELS = {
  Bronze: { fee: 0.05, limit: 500_000, min: 0, next: 500 },
  Silver: { fee: 0.03, limit: 2_000_000, min: 500, next: 2_000 },
  Gold: { fee: 0.01, limit: 5_000_000, min: 2_000, next: 10_000 },
  Platinum: { fee: 0, limit: 20_000_000, min: 10_000, next: null },
}

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }))
app.use(express.json({ limit: '100kb' }))

const hashPin = (pin, salt) => scryptSync(pin, salt, 64).toString('hex')
const levelFor = (points) => points >= 10000 ? 'Platinum' : points >= 2000 ? 'Gold' : points >= 500 ? 'Silver' : 'Bronze'
const publicUser = (user) => {
  const level = levelFor(user.points)
  const config = LEVELS[level]
  const progress = config.next ? Math.min(100, Math.round(((user.points - config.min) / (config.next - config.min)) * 100)) : 100
  return { id: user.id, document: user.document, fullName: user.fullName, email: user.email, phone: user.phone, accountNumber: user.accountNumber, status: user.status, balance: user.balance, points: user.points, level, progress, feeRate: config.fee, dailyLimit: config.limit, createdAt: user.createdAt }
}
const createToken = (user) => jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '15m' })
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    const payload = jwt.verify(token, JWT_SECRET)
    const store = readStore(); const user = store.users.find((item) => item.id === payload.sub)
    if (user?.status === 'blocked') return res.status(423).json({ message: loginLockMessage(user), blockedUntil: user.blockedUntil })
    if (!user || user.status !== 'active') return res.status(403).json({ message: 'La cuenta no está disponible.' })
    req.user = user; req.store = store; next()
  } catch { res.status(401).json({ message: 'Tu sesión expiró. Inicia sesión nuevamente.' }) }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'WalletUQ API' }))

app.post('/api/auth/register', (req, res) => {
  const errors = validateRegistration(req.body ?? {})
  if (Object.keys(errors).length) return res.status(400).json({ message: Object.values(errors)[0], errors })
  const { fullName, document, phone, pin } = req.body
  const email = req.body.email.trim().toLowerCase()
  const store = readStore()
  if (store.users.some((user) => user.document === document)) return res.status(409).json({ message: 'Ya existe una cuenta con este documento.' })
  if (store.users.some((user) => user.email.toLowerCase() === email.toLowerCase())) return res.status(409).json({ message: 'Este correo ya está registrado.' })
  const salt = randomBytes(16).toString('hex')
  const user = { id: randomUUID(), fullName: fullName.trim(), document, email: email.toLowerCase(), phone, pinSalt: salt, pinHash: hashPin(pin, salt), accountNumber: `47${Math.floor(10000000 + Math.random() * 89999999)}`, status: 'active', failedAttempts: 0, balance: 0, points: 0, createdAt: new Date().toISOString() }
  store.users.push(user); writeStore(store)
  res.status(201).json({ token: createToken(user), user: publicUser(user) })
})

app.post('/api/auth/login', (req, res) => {
  const { document, pin } = req.body ?? {}; const store = readStore(); const user = store.users.find((item) => item.document === document)
  if (!user) return res.status(401).json({ message: 'Documento o PIN incorrectos.' })
  if (user.status === 'blocked') return res.status(423).json({ message: loginLockMessage(user), blockedUntil: user.blockedUntil })
  if (user.status !== 'active') return res.status(403).json({ message: 'La cuenta no está disponible.' })
  const supplied = Buffer.from(hashPin(String(pin ?? ''), user.pinSalt), 'hex'); const expected = Buffer.from(user.pinHash, 'hex')
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    recordFailedLogin(user)
    writeStore(store)
    return res.status(user.status === 'blocked' ? 423 : 401).json({ message: user.status === 'blocked' ? loginLockMessage(user) : `PIN incorrecto. Te quedan ${MAX_LOGIN_ATTEMPTS - user.failedAttempts} intentos.`, ...(user.status === 'blocked' ? { blockedUntil: user.blockedUntil } : {}) })
  }
  resetLoginAttempts(user); writeStore(store)
  res.json({ token: createToken(user), user: publicUser(user) })
})

app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }))

app.get('/api/users/lookup', auth, (req, res) => {
  const query = String(req.query.q ?? '').trim(); const target = req.store.users.find((user) => user.status === 'active' && user.id !== req.user.id && (user.document === query || user.accountNumber === query))
  if (!target) return res.status(404).json({ message: 'No encontramos un usuario activo con esos datos.' })
  const parts = target.fullName.split(/\s+/); res.json({ user: { fullName: `${parts[0]} ${parts.at(-1)?.[0] ?? ''}.`, document: `••••${target.document.slice(-4)}`, accountNumber: target.accountNumber } })
})

app.get('/api/transactions', auth, (req, res) => {
  const transactions = req.store.transactions.filter((tx) => tx.fromUserId === req.user.id || tx.toUserId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50).map((tx) => {
    const incoming = tx.toUserId === req.user.id; const counterpartId = incoming ? tx.fromUserId : tx.toUserId; const counterpart = req.store.users.find((user) => user.id === counterpartId)
    return { ...tx, direction: incoming ? 'in' : 'out', counterpart: counterpart?.fullName ?? (tx.type === 'deposit' ? 'Recarga simulada' : 'WalletUQ') }
  })
  res.json({ transactions })
})

app.post('/api/deposits', auth, (req, res) => {
  const amount = Math.round(Number(req.body?.amount)); const source = req.body?.source === 'bank' ? 'Cuenta bancaria' : 'Tarjeta débito'
  if (!Number.isFinite(amount) || amount < 10_000) return res.status(400).json({ message: 'La recarga mínima es de $10.000.' })
  if (amount > 20_000_000) return res.status(400).json({ message: 'La recarga mock no puede superar $20.000.000.' })
  req.user.balance += amount
  const tx = { id: randomUUID(), reference: `REC-${Date.now().toString().slice(-8)}`, type: 'deposit', amount, fee: 0, fromUserId: null, toUserId: req.user.id, status: 'completed', description: source, createdAt: new Date().toISOString() }
  req.store.transactions.push(tx); writeStore(req.store)
  res.status(201).json({ transaction: tx, user: publicUser(req.user) })
})

app.post('/api/transfers/preview', auth, (req, res) => {
  const amount = Math.round(Number(req.body?.amount)); const target = req.store.users.find((user) => user.status === 'active' && user.id !== req.user.id && (user.document === req.body?.recipient || user.accountNumber === req.body?.recipient))
  if (!target) return res.status(404).json({ message: 'El destinatario no existe o no está activo.' })
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Ingresa un monto válido.' })
  const level = levelFor(req.user.points); const fee = Math.round(amount * LEVELS[level].fee); const total = amount + fee
  const today = new Date().toISOString().slice(0, 10); const sentToday = req.store.transactions.filter((tx) => tx.fromUserId === req.user.id && tx.type === 'transfer' && tx.status === 'completed' && tx.createdAt.startsWith(today)).reduce((sum, tx) => sum + tx.amount, 0)
  if (sentToday + amount > LEVELS[level].limit) return res.status(400).json({ message: `Superas tu límite diario. Tienes disponibles $${(LEVELS[level].limit - sentToday).toLocaleString('es-CO')}.` })
  if (req.user.balance < total) return res.status(400).json({ message: `Saldo insuficiente. Te faltan $${(total - req.user.balance).toLocaleString('es-CO')}.` })
  res.json({ preview: { recipient: { fullName: target.fullName, accountNumber: target.accountNumber }, amount, fee, total, level, points: Math.floor(amount / 10_000), requiresOtp: amount > 1_000_000 } })
})

app.post('/api/transfers', auth, (req, res) => {
  const amount = Math.round(Number(req.body?.amount)); const target = req.store.users.find((user) => user.status === 'active' && user.id !== req.user.id && (user.document === req.body?.recipient || user.accountNumber === req.body?.recipient))
  if (!target || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Transferencia inválida.' })
  const level = levelFor(req.user.points); const fee = Math.round(amount * LEVELS[level].fee); const total = amount + fee
  const today = new Date().toISOString().slice(0, 10); const sentToday = req.store.transactions.filter((tx) => tx.fromUserId === req.user.id && tx.type === 'transfer' && tx.status === 'completed' && tx.createdAt.startsWith(today)).reduce((sum, tx) => sum + tx.amount, 0)
  if (sentToday + amount > LEVELS[level].limit) return res.status(400).json({ message: 'La operación supera tu límite diario.' })
  if (req.user.balance < total) return res.status(400).json({ message: 'Saldo insuficiente para cubrir monto y comisión.' })
  if (amount > 1_000_000 && req.body?.otp !== '123456') return res.status(400).json({ code: 'OTP_REQUIRED', message: 'Para el demo usa el OTP 123456.' })
  req.user.balance -= total; target.balance += amount; const points = Math.floor(amount / 10_000); req.user.points += points
  const tx = { id: randomUUID(), reference: `TRX-${Date.now().toString().slice(-8)}`, type: 'transfer', amount, fee, fromUserId: req.user.id, toUserId: target.id, status: 'completed', description: String(req.body?.description ?? '').slice(0, 80), createdAt: new Date().toISOString() }
  req.store.transactions.push(tx); writeStore(req.store)
  res.status(201).json({ transaction: tx, user: publicUser(req.user) })
})

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ message: 'Ocurrió un error inesperado.' }) })
app.listen(PORT, () => console.log(`WalletUQ API disponible en http://localhost:${PORT}`))

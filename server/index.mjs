import { MAX_LOGIN_ATTEMPTS, recordFailedLogin, resetLoginAttempts, loginLockMessage } from './login-lock.mjs'
import express from 'express'
import { validateRegistration } from '../shared/registration.mjs'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { readStore, writeStore } from './store.mjs'
import { WalletError, levelInfo, newReference, parseAmount, quotePayment, quoteTransfer } from './wallet.mjs'
import { verifyIdentity } from './kyc.mjs'
import { PSE_BANKS } from './payment-gateway.mjs'
import { cardDepositProvider, pseDepositProvider } from './deposit-providers.mjs'
import { createDepositService } from './deposit-service.mjs'
import { closeSession, openSession, sessionExpired, touchSession } from './sessions.mjs'
import { consumeOtp, issueOtp, OTP_TTL_MS } from './otp.mjs'
import { merchantQrPayload, readMerchantQr } from './qr.mjs'
import { notify, subscribe } from './events.mjs'
import { authenticationOptions, registrationOptions, rememberChallenge, takeChallenge, verifyAuthentication, verifyRegistration } from './webauthn.mjs'

// Composición de adaptadores concretos: el servicio depende de sus contratos (DIP).
const deposits = createDepositService({
  providers: new Map([['card', cardDepositProvider], ['bank', pseDepositProvider]]),
  repository: { save: writeStore },
  notifier: { notify },
})

const app = express()
const PORT = Number(process.env.PORT || 4000)
const JWT_SECRET = process.env.JWT_SECRET || 'walletuq-local-development-secret'
const QR_SECRET = process.env.QR_SECRET || 'walletuq-local-qr-secret'
const CLIENT_ORIGINS = ['http://localhost:5173', 'http://localhost:5174']

app.use(cors({ origin: CLIENT_ORIGINS }))
app.use(express.json({ limit: '100kb' }))

const hashPin = (pin, salt) => scryptSync(pin, salt, 64).toString('hex')
const publicUser = (user) => ({ id: user.id, document: user.document, fullName: user.fullName, email: user.email, phone: user.phone, accountNumber: user.accountNumber, status: user.status, balance: user.balance, points: user.points, ...levelInfo(user.points), biometricEnabled: Boolean(user.passkeys?.length), createdAt: user.createdAt })
const createToken = (user, session) => jwt.sign({ sub: user.id, sid: session.id }, JWT_SECRET, { expiresIn: '12h' })
const startSession = (store, user) => createToken(user, openSession(store, user.id))
const findRecipient = (store, sender, recipient) => store.users.find((user) => user.status === 'active' && user.id !== sender.id && (user.document === recipient || user.accountNumber === recipient))

// Resuelve token y sesión. Las consultas en segundo plano (sondeo del panel) no cuentan como actividad.
function resolveSession(token, store, now) {
  let payload
  try { payload = jwt.verify(token, JWT_SECRET) } catch { throw new WalletError(401, 'Tu sesión expiró. Inicia sesión nuevamente.') }
  const session = store.sessions.find((item) => item.id === payload.sid && item.userId === payload.sub)
  if (!session) throw new WalletError(401, 'Tu sesión expiró. Inicia sesión nuevamente.')
  if (sessionExpired(session, now)) {
    closeSession(store, session.id); writeStore(store)
    throw new WalletError(401, 'Tu sesión se cerró tras 15 minutos de inactividad.', { code: 'SESSION_IDLE' })
  }
  const user = store.users.find((item) => item.id === payload.sub)
  if (user?.status === 'blocked') throw new WalletError(423, loginLockMessage(user), { blockedUntil: user.blockedUntil })
  if (!user || user.status !== 'active') throw new WalletError(403, 'La cuenta no está disponible.')
  return { session, user }
}

const auth = (req, res, next) => {
  const store = readStore(); const now = Date.now()
  const { session, user } = resolveSession(req.headers.authorization?.replace(/^Bearer\s+/i, ''), store, now)
  if (req.get('x-walletuq-background') !== '1') { touchSession(session, now); writeStore(store) }
  req.user = user; req.store = store; req.session = session; next()
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'WalletUQ API' }))

// F-01 · Registro: documento único y cuenta creada solo si el proveedor KYC aprueba la identidad.
app.post('/api/auth/register', (req, res) => {
  const errors = validateRegistration(req.body ?? {})
  if (Object.keys(errors).length) return res.status(400).json({ message: Object.values(errors)[0], errors })
  const { fullName, document, phone, pin } = req.body
  const email = req.body.email.trim().toLowerCase()
  const store = readStore()
  if (store.users.some((user) => user.document === document)) return res.status(409).json({ message: 'Ya existe una cuenta con este documento.' })
  if (store.users.some((user) => user.email.toLowerCase() === email.toLowerCase())) return res.status(409).json({ message: 'Este correo ya está registrado.' })
  const kyc = verifyIdentity({ document, fullName })
  if (!kyc.approved) return res.status(422).json({ code: 'KYC_REJECTED', message: kyc.reason })
  const salt = randomBytes(16).toString('hex')
  const user = { id: randomUUID(), fullName: fullName.trim(), document, email: email.toLowerCase(), phone, pinSalt: salt, pinHash: hashPin(pin, salt), accountNumber: `47${Math.floor(10000000 + Math.random() * 89999999)}`, status: 'active', failedAttempts: 0, balance: 0, points: 0, kycReference: kyc.reference, createdAt: new Date().toISOString() }
  store.users.push(user)
  const token = startSession(store, user); writeStore(store)
  res.status(201).json({ token, user: publicUser(user) })
})

// F-02 · Autenticación con PIN de seis dígitos.
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
  resetLoginAttempts(user)
  const token = startSession(store, user); writeStore(store)
  res.json({ token, user: publicUser(user) })
})

// F-02 · Autenticación opcional con la biometría del dispositivo (WebAuthn).
const NO_BIOMETRIC = 'No hay biometría activa para este documento en este dispositivo. Ingresa con tu PIN.'

app.post('/api/auth/biometric/options', async (req, res) => {
  const document = String(req.body?.document ?? '')
  const user = readStore().users.find((item) => item.document === document)
  if (user?.status === 'blocked') return res.status(423).json({ message: loginLockMessage(user), blockedUntil: user.blockedUntil })
  if (!user || user.status !== 'active' || !user.passkeys?.length) return res.status(400).json({ message: NO_BIOMETRIC })
  const options = await authenticationOptions(user)
  const store = readStore(); rememberChallenge(store.users.find((item) => item.id === user.id), 'login', options.challenge); writeStore(store)
  res.json({ options })
})

app.post('/api/auth/biometric/verify', async (req, res) => {
  const { document, response } = req.body ?? {}
  let store = readStore(); let user = store.users.find((item) => item.document === document)
  if (!user) return res.status(400).json({ message: NO_BIOMETRIC })
  const challenge = takeChallenge(user, 'login'); writeStore(store)
  if (!challenge) return res.status(400).json({ message: 'La verificación biométrica expiró. Intenta de nuevo.' })
  if (user.status === 'blocked') return res.status(423).json({ message: loginLockMessage(user), blockedUntil: user.blockedUntil })
  if (user.status !== 'active') return res.status(403).json({ message: 'La cuenta no está disponible.' })
  const passkey = user.passkeys?.find((item) => item.id === response?.id)
  if (!passkey) return res.status(400).json({ message: NO_BIOMETRIC })
  const result = await verifyAuthentication({ response, challenge, passkey, origins: CLIENT_ORIGINS }).catch(() => null)
  if (!result) return res.status(401).json({ message: 'No pudimos verificar tu biometría. Intenta de nuevo o usa tu PIN.' })
  // La verificación es asíncrona: se relee el almacenamiento para no pisar cambios hechos mientras tanto.
  store = readStore(); user = store.users.find((item) => item.id === user.id)
  const stored = user.passkeys.find((item) => item.id === passkey.id)
  stored.counter = result.newCounter; stored.lastUsedAt = new Date().toISOString()
  resetLoginAttempts(user)
  const token = startSession(store, user); writeStore(store)
  res.json({ token, user: publicUser(user) })
})

app.post('/api/biometric/register/options', auth, async (req, res) => {
  const options = await registrationOptions(req.user)
  const store = readStore(); rememberChallenge(store.users.find((item) => item.id === req.user.id), 'register', options.challenge); writeStore(store)
  res.json({ options })
})

app.post('/api/biometric/register/verify', auth, async (req, res) => {
  const challenge = takeChallenge(req.user, 'register'); writeStore(req.store)
  if (!challenge) return res.status(400).json({ message: 'El registro biométrico expiró. Intenta de nuevo.' })
  const passkey = await verifyRegistration({ response: req.body?.response, challenge, origins: CLIENT_ORIGINS }).catch(() => null)
  if (!passkey) return res.status(400).json({ message: 'No pudimos registrar tu biometría. Intenta de nuevo.' })
  const store = readStore(); const user = store.users.find((item) => item.id === req.user.id)
  user.passkeys = [...(user.passkeys ?? []).filter((item) => item.id !== passkey.id), passkey]; writeStore(store)
  res.status(201).json({ user: publicUser(user) })
})

app.delete('/api/biometric', auth, (req, res) => {
  delete req.user.passkeys; writeStore(req.store)
  res.json({ user: publicUser(req.user) })
})

app.post('/api/auth/logout', auth, (req, res) => {
  closeSession(req.store, req.session.id); writeStore(req.store)
  res.json({ ok: true })
})

// Actividad del usuario en la interfaz sin solicitudes al servidor (mantiene viva la sesión).
app.post('/api/session/ping', auth, (_req, res) => res.json({ ok: true }))

// F-03 · Panel financiero.
app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }))

// EventSource no permite cabeceras, por eso el token viaja en la consulta.
app.get('/api/events', (req, res) => {
  const { user } = resolveSession(String(req.query.token ?? ''), readStore(), Date.now())
  subscribe(user.id, res)
})

app.get('/api/users/lookup', auth, (req, res) => {
  const query = String(req.query.q ?? '').trim(); const target = findRecipient(req.store, req.user, query)
  if (!target) return res.status(404).json({ message: 'No encontramos un usuario activo con esos datos.' })
  const parts = target.fullName.split(/\s+/); res.json({ user: { fullName: `${parts[0]} ${parts.at(-1)?.[0] ?? ''}.`, document: `••••${target.document.slice(-4)}`, accountNumber: target.accountNumber } })
})

app.get('/api/transactions', auth, (req, res) => {
  const transactions = req.store.transactions.filter((tx) => tx.fromUserId === req.user.id || tx.toUserId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50).map((tx) => {
    const incoming = tx.toUserId === req.user.id; const counterpartId = incoming ? tx.fromUserId : tx.toUserId; const counterpart = req.store.users.find((user) => user.id === counterpartId)
    const fallback = tx.type === 'deposit' ? 'Recarga' : tx.type === 'payment' ? tx.merchantName : 'WalletUQ'
    return { ...tx, direction: incoming ? 'in' : 'out', counterpart: counterpart?.fullName ?? fallback }
  })
  res.json({ transactions })
})

// F-04 · Recarga desde tarjeta o PSE. Aprobada o rechazada, la recarga queda registrada.
app.get('/api/deposits/banks', auth, (_req, res) => res.json({ banks: PSE_BANKS }))

app.post('/api/deposits', auth, (req, res) => {
  const { approved, reason, transaction } = deposits.execute({ input: req.body ?? {}, user: req.user, store: req.store })
  res.status(approved ? 201 : 402).json({ ...(approved ? {} : { message: reason }), transaction, user: publicUser(req.user) })
})

// F-05 · Transferencia entre usuarios.
function transferRequest(req) {
  const amount = parseAmount(req.body?.amount)
  const target = findRecipient(req.store, req.user, req.body?.recipient)
  if (!target) throw new WalletError(404, 'El destinatario no existe o no está activo.')
  return { target, quote: quoteTransfer({ sender: req.user, amount, transactions: req.store.transactions }) }
}

app.post('/api/transfers/preview', auth, (req, res) => {
  const { target, quote } = transferRequest(req)
  res.json({ preview: { recipient: { fullName: target.fullName, accountNumber: target.accountNumber }, ...quote } })
})

app.post('/api/transfers/otp', auth, (req, res) => {
  const { target, quote } = transferRequest(req)
  if (!quote.requiresOtp) return res.status(400).json({ message: 'Esta transferencia no requiere código de confirmación.' })
  const code = issueOtp(req.store, req.user.id, { recipientId: target.id, amount: quote.amount }); writeStore(req.store)
  const sentTo = `••• ${req.user.phone.slice(-4)}`
  console.log(`[SMS simulado] ${sentTo}: tu código WalletUQ es ${code}`)
  // Prototipo: no hay proveedor SMS real, así que el código se devuelve para mostrarlo en pantalla.
  res.json({ sentTo, expiresInSeconds: OTP_TTL_MS / 1000, demoCode: code })
})

app.post('/api/transfers', auth, (req, res) => {
  const { target, quote } = transferRequest(req)
  if (quote.requiresOtp) {
    const otp = consumeOtp(req.store, req.user.id, { recipientId: target.id, amount: quote.amount }, req.body?.otp)
    if (!otp.ok) { writeStore(req.store); return res.status(400).json({ code: 'OTP_INVALID', message: otp.message }) }
  }
  // Todo el movimiento se aplica en memoria y se persiste con una sola escritura atómica:
  // si algo falla antes de guardar, ningún saldo cambia.
  req.user.balance -= quote.total; target.balance += quote.amount; req.user.points += quote.points
  const tx = { id: randomUUID(), reference: newReference('TRX', req.store.transactions), type: 'transfer', amount: quote.amount, fee: quote.fee, fromUserId: req.user.id, toUserId: target.id, status: 'completed', description: String(req.body?.description ?? '').slice(0, 80), createdAt: new Date().toISOString() }
  req.store.transactions.push(tx); writeStore(req.store); notify(req.user.id, target.id)
  res.status(201).json({ transaction: tx, user: publicUser(req.user) })
})

// F-06 · Pago a comercio afiliado con código QR.
app.get('/api/merchants', auth, (req, res) => {
  const merchants = req.store.merchants.map(({ code, name, category, status, qrAmount }) => ({ code, name, category, status, qrAmount, qr: merchantQrPayload(QR_SECRET, code, qrAmount) }))
  res.json({ merchants })
})

function paymentRequest(req, { allowMissingAmount = false } = {}) {
  const scanned = readMerchantQr(QR_SECRET, req.body?.qr)
  const merchant = req.store.merchants.find((item) => item.code === scanned.code)
  if (!merchant) throw new WalletError(404, 'El comercio de este QR no está afiliado a WalletUQ.')
  if (merchant.status !== 'active') throw new WalletError(409, `${merchant.name} no está activo para recibir pagos en este momento.`)
  const info = { code: merchant.code, name: merchant.name, category: merchant.category }
  // Un QR con monto fijo manda sobre el monto que envíe el cliente.
  if (scanned.amount === null && allowMissingAmount && !req.body?.amount) return { merchant, info, fixedAmount: false, quote: null }
  const amount = scanned.amount ?? parseAmount(req.body?.amount)
  return { merchant, info, fixedAmount: scanned.amount !== null, quote: quotePayment({ payer: req.user, amount }) }
}

app.post('/api/payments/preview', auth, (req, res) => {
  const { info, fixedAmount, quote } = paymentRequest(req, { allowMissingAmount: true })
  res.json({ preview: { merchant: info, fixedAmount, needsAmount: !quote, ...(quote ?? {}) } })
})

app.post('/api/payments', auth, (req, res) => {
  const { merchant, quote } = paymentRequest(req)
  req.user.balance -= quote.total; merchant.balance += quote.amount; req.user.points += quote.points
  const tx = { id: randomUUID(), reference: newReference('PAG', req.store.transactions), type: 'payment', amount: quote.amount, fee: quote.fee, fromUserId: req.user.id, toUserId: null, merchantCode: merchant.code, merchantName: merchant.name, status: 'completed', description: 'Pago con QR', createdAt: new Date().toISOString() }
  req.store.transactions.push(tx); writeStore(req.store); notify(req.user.id)
  res.status(201).json({ transaction: tx, user: publicUser(req.user) })
})

app.use((err, _req, res, _next) => {
  if (err instanceof WalletError) return res.status(err.status).json({ message: err.message, ...err.extra })
  console.error(err); res.status(500).json({ message: 'Ocurrió un error inesperado.' })
})
app.listen(PORT, () => console.log(`WalletUQ API disponible en http://localhost:${PORT}`))

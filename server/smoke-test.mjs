const API = 'http://localhost:4000/api'
const stamp = Date.now().toString().slice(-8)
const call = async (path, body, token) => {
  const response = await fetch(`${API}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: response.status, data: await response.json() }
}
const request = async (path, body, token) => { const { status, data } = await call(path, body, token); if (status >= 400) throw new Error(`${path}: ${data.message}`); return data }
const expectStatus = async (expected, path, body, token) => { const { status, data } = await call(path, body, token); if (status !== expected) throw new Error(`${path}: se esperaba ${expected} y llegó ${status} (${data.message})`); return data }
const card = { number: '4242424242424242', expiry: '12/30', cvv: '123' }
const register = (name, suffix, document = `10${stamp.slice(0,6)}${suffix}`) => request('/auth/register', { fullName: name, document, email: `${suffix}.${stamp}@walletuq.test`, phone: `300${stamp.slice(0,7)}`, pin: '123456', acceptedKyc: true })

// F-01: KYC rechazado y documento duplicado.
await expectStatus(422, '/auth/register', { fullName: 'Usuario Rechazado', document: `10${stamp.slice(0,4)}0000`, email: `r.${stamp}@walletuq.test`, phone: `300${stamp.slice(0,7)}`, pin: '123456', acceptedKyc: true })
const a = await register('Usuario Prueba A', '1'); const b = await register('Usuario Prueba B', '2')
await expectStatus(409, '/auth/register', { fullName: 'Duplicado', document: a.user.document, email: `d.${stamp}@walletuq.test`, phone: `300${stamp.slice(0,7)}`, pin: '123456', acceptedKyc: true })

// F-04: recarga rechazada registrada sin mover saldo, mínimo y recarga aprobada sin comisión.
await expectStatus(402, '/deposits', { amount: 50000, source: 'card', card: { ...card, number: '4000000000000002' } }, a.token)
await expectStatus(402, '/deposits', { amount: 50000, source: 'bank', bank: 'pruebas-rechazo' }, a.token)
await expectStatus(400, '/deposits', { amount: 9999, source: 'bank', bank: 'bancolombia' }, a.token)
await request('/deposits', { amount: 100000, source: 'bank', bank: 'bancolombia' }, a.token)
await request('/deposits', { amount: 100000, source: 'card', card }, a.token)

// F-05: transferencia con comisión Bronze del 5 %.
await request('/transfers', { recipient: b.user.document, amount: 100000, description: 'Prueba automática' }, a.token)

// F-06: pago QR con monto fijo y rechazo de comercio inactivo y QR alterado.
const { merchants } = await request('/merchants', null, a.token)
const cafe = merchants.find((merchant) => merchant.code === 'CAFE-UQ'); const inactive = merchants.find((merchant) => merchant.status === 'inactive')
await expectStatus(409, '/payments/preview', { qr: inactive.qr }, a.token)
await expectStatus(400, '/payments', { qr: cafe.qr.replace('a=12000', 'a=1') }, a.token)
const { preview } = await request('/payments/preview', { qr: cafe.qr, amount: 1 }, a.token)
if (preview.amount !== 12000 || preview.fee !== 600 || !preview.fixedAmount) throw new Error('La vista previa del pago QR no coincide.')
await request('/payments', { qr: cafe.qr }, a.token)

// F-03: el panel refleja todo.
const [aNow, bNow, history] = await Promise.all([request('/me', null, a.token), request('/me', null, b.token), request('/transactions', null, a.token)])
if (aNow.user.balance !== 82400 || bNow.user.balance !== 100000 || aNow.user.points !== 11) throw new Error(`Los saldos o puntos no coinciden: ${JSON.stringify({ a: aNow.user.balance, b: bNow.user.balance, puntos: aNow.user.points })}`)
if (history.transactions.filter((tx) => tx.status === 'failed').length !== 2) throw new Error('Las recargas rechazadas no quedaron registradas.')

// F-02: cerrar sesión invalida el token.
await request('/auth/logout', {}, a.token)
await expectStatus(401, '/me', null, a.token)

console.log('✓ Flujo completo correcto:', { emisor: aNow.user.balance, receptor: bNow.user.balance, puntos: aNow.user.points, movimientos: history.transactions.length })

const API = 'http://localhost:4000/api'
const stamp = Date.now().toString().slice(-8)
const request = async (path, body, token) => {
  const response = await fetch(`${API}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await response.json(); if (!response.ok) throw new Error(`${path}: ${data.message}`); return data
}
const register = (name, suffix) => request('/auth/register', { fullName: name, document: `10${stamp.slice(0,6)}${suffix}`, email: `${suffix}.${stamp}@walletuq.test`, phone: `300${stamp.slice(0,7)}`, pin: '123456', acceptedKyc: true })
const a = await register('Usuario Prueba A', '1'); const b = await register('Usuario Prueba B', '2')
await request('/deposits', { amount: 200000, source: 'bank' }, a.token)
await request('/transfers', { recipient: b.user.document, amount: 100000, description: 'Prueba automática' }, a.token)
const [aNow,bNow] = await Promise.all([request('/me',null,a.token),request('/me',null,b.token)])
if (aNow.user.balance !== 95000 || bNow.user.balance !== 100000 || aNow.user.points !== 10) throw new Error('Los saldos o puntos no coinciden.')
console.log('✓ Flujo completo correcto:', { emisor: aNow.user.balance, receptor: bNow.user.balance, puntos: aNow.user.points })

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDepositService } from './deposit-service.mjs'
import { cardDepositProvider, pseDepositProvider } from './deposit-providers.mjs'

const sources = [
  ['card', cardDepositProvider, { card: { number: '4242 4242 4242 4242', expiry: '12/99', cvv: '123' } }, { card: { number: '4000000000000002', expiry: '12/99', cvv: '123' } }],
  ['bank', pseDepositProvider, { bank: 'bancolombia' }, { bank: 'pruebas-rechazo' }],
]

function fixture(providers = new Map(sources.map(([name, provider]) => [name, provider]))) {
  const user = { id: 'alice', balance: 5000 }
  const store = { users: [user], transactions: [] }
  const events = []
  const service = createDepositService({
    providers,
    repository: { save: (snapshot) => events.push(['save', structuredClone(snapshot)]) },
    notifier: { notify: (id) => events.push(['notify', id]) },
  })
  const execute = (input) => service.execute({ input, user, store })
  return { user, store, events, execute }
}

// LSP: la misma batería se ejecuta con las dos implementaciones reales.
for (const [source, , valid, rejected] of sources) {
  test(`LSP: ${source} acredita sin comisión y guarda antes de notificar`, () => {
    const f = fixture()
    const result = f.execute({ source, amount: 10000, ...valid })
    assert.equal(result.approved, true)
    assert.equal(f.user.balance, 15000)
    assert.equal(result.transaction.fee, 0)
    assert.equal(result.transaction.status, 'completed')
    assert.equal(typeof result.transaction.providerReference, 'string')
    assert.deepEqual(f.events.map(([name]) => name), ['save', 'notify'])
    assert.equal(f.events[0][1].users[0].balance, 15000)
    assert.equal(f.events[1][1], 'alice')
    assert.equal(f.store.transactions.length, 1)
  })

  test(`LSP: ${source} registra rechazos sin acreditar saldo`, () => {
    const f = fixture()
    const result = f.execute({ source, amount: 10000, ...rejected })
    assert.equal(result.approved, false)
    assert.equal(f.user.balance, 5000)
    assert.equal(result.transaction.status, 'failed')
    assert.equal(result.transaction.providerReference, null)
    assert.equal(typeof result.transaction.failureReason, 'string')
    assert.equal(f.store.transactions.length, 1)
    assert.equal(f.events.length, 2)
  })

  test(`LSP: ${source} rechaza datos inválidos sin movimientos ni efectos externos`, () => {
    const f = fixture()
    assert.throws(() => f.execute({ source, amount: 10000 }), { status: 400 })
    assert.equal(f.user.balance, 5000)
    assert.deepEqual(f.store.transactions, [])
    assert.deepEqual(f.events, [])
  })
}

test('SRP: límites del monto se validan antes de invocar la pasarela', () => {
  const f = fixture(new Map([['spy', { charge: () => assert.fail('No debe cobrar') }]]))
  for (const amount of [9999, 20000001, 'abc', Infinity]) {
    assert.throws(() => f.execute({ source: 'spy', amount }), { status: 400 })
  }
  assert.deepEqual(f.events, [])
  assert.equal(f.user.balance, 5000)
})

test('OCP, DIP e ISP: agregar una fuente e inyectar adaptadores mínimos sin modificar el servicio', () => {
  const f = fixture(new Map([['voucher', {
    charge: () => ({ approved: true, authorization: 'BONO-1', description: 'Bono universitario' }),
  }]]))
  const result = f.execute({ source: 'voucher', amount: 20000000 })
  assert.equal(f.user.balance, 20005000)
  assert.equal(result.transaction.description, 'Bono universitario')
  assert.equal(result.transaction.providerReference, 'BONO-1')
})

test('fuentes desconocidas fallan y omitir source conserva tarjeta como predeterminada', () => {
  const f = fixture()
  assert.throws(() => f.execute({ source: 'unknown', amount: 10000 }), { status: 400 })
  assert.deepEqual(f.events, [])
  assert.equal(f.execute({ amount: 10000, ...sources[0][2] }).approved, true)
})

import { randomUUID } from 'node:crypto'

// Simulación de las API de tarjeta y PSE (SWR-004). No procesa dinero real.
export const APPROVED_TEST_CARD = '4242424242424242'
export const DECLINED_TEST_CARD = '4000000000000002'
export const PSE_BANKS = [
  { id: 'bancolombia', name: 'Bancolombia' },
  { id: 'davivienda', name: 'Davivienda' },
  { id: 'bogota', name: 'Banco de Bogotá' },
  { id: 'pruebas-rechazo', name: 'Banco de Pruebas (rechaza)' },
]

const authorization = () => randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()

export function luhnValid(number) {
  let sum = 0
  for (let i = 0; i < number.length; i++) {
    let digit = Number(number[number.length - 1 - i])
    if (i % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9 }
    sum += digit
  }
  return sum % 10 === 0
}

export function validateCard({ number, expiry, cvv }, now = new Date()) {
  if (!/^[0-9]{13,19}$/.test(number) || !luhnValid(number)) return 'El número de la tarjeta no es válido.'
  const match = /^(0[1-9]|1[0-2])\/([0-9]{2})$/.exec(expiry)
  if (!match) return 'La fecha de vencimiento debe tener el formato MM/AA.'
  // La tarjeta vence al terminar el mes indicado.
  if (Date.UTC(2000 + Number(match[2]), Number(match[1]), 1) <= now.getTime()) return 'La tarjeta está vencida.'
  if (!/^[0-9]{3,4}$/.test(cvv)) return 'El CVV debe tener 3 o 4 dígitos.'
  return null
}

export function chargeCard({ number }) {
  if (number === DECLINED_TEST_CARD) return { approved: false, reason: 'El emisor rechazó la tarjeta por fondos insuficientes.' }
  return { approved: true, authorization: `TC-${authorization()}` }
}

export const findPseBank = (id) => PSE_BANKS.find((bank) => bank.id === id)

export function debitPse(bank) {
  if (bank.id === 'pruebas-rechazo') return { approved: false, reason: `${bank.name} rechazó el débito PSE.` }
  return { approved: true, authorization: `PSE-${authorization()}` }
}

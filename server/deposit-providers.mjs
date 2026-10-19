import { chargeCard, debitPse, findPseBank, validateCard } from './payment-gateway.mjs'
import { WalletError } from './wallet.mjs'

/**
 * ISP: una fuente solo necesita cobrar; no debe implementar bancos, reembolsos o historial.
 * LSP: todos los proveedores validan antes de cobrar y devuelven el mismo resultado.
 * @typedef {Object} DepositProvider
 * @property {(input: Object) => { approved: boolean, description: string, authorization?: string, reason?: string }} charge
 * Los datos inválidos lanzan WalletError(400); un rechazo devuelve approved:false y reason.
 * charge es síncrono en este prototipo y no modifica saldos ni persiste datos.
 */

const digits = (value) => String(value ?? '').replace(/\D/g, '')

/** @type {DepositProvider} */
export const cardDepositProvider = {
  charge(input) {
    const card = { number: digits(input.card?.number), expiry: String(input.card?.expiry ?? '').trim(), cvv: digits(input.card?.cvv) }
    const error = validateCard(card)
    if (error) throw new WalletError(400, error)
    return { ...chargeCard(card), description: `Tarjeta ••${card.number.slice(-4)}` }
  },
}

/** @type {DepositProvider} */
export const pseDepositProvider = {
  charge(input) {
    const bank = findPseBank(input.bank)
    if (!bank) throw new WalletError(400, 'Selecciona tu banco para pagar por PSE.')
    return { ...debitPse(bank), description: `PSE · ${bank.name}` }
  },
}

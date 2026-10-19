import { randomUUID } from 'node:crypto'
import { MAX_DEPOSIT, MIN_DEPOSIT, WalletError, cop, newReference } from './wallet.mjs'

// SRP: esta función únicamente valida el monto de una recarga.
export function validateDepositAmount(value) {
  const amount = Math.round(Number(value))
  if (!Number.isSafeInteger(amount) || amount < MIN_DEPOSIT) throw new WalletError(400, `La recarga mínima es de ${cop(MIN_DEPOSIT)}.`)
  if (amount > MAX_DEPOSIT) throw new WalletError(400, `La recarga no puede superar ${cop(MAX_DEPOSIT)}.`)
  return amount
}

/**
 * DIP: el caso de uso recibe contratos pequeños, sin importar Express, JSON o SSE.
 * @param {Object} dependencies
 * @param {Map<string, import('./deposit-providers.mjs').DepositProvider>} dependencies.providers
 * @param {{save: (store: Object) => void}} dependencies.repository ISP: solo escritura.
 * @param {{notify: (...userIds: string[]) => void}} dependencies.notifier ISP: solo notificación.
 */
export function createDepositService({ providers, repository, notifier }) {
  return {
    execute({ input, user, store }) {
      const amount = validateDepositAmount(input.amount)
      // OCP: otra fuente se registra en el Map sin cambiar este caso de uso.
      const provider = providers.get(input.source ?? 'card')
      if (!provider) throw new WalletError(400, 'Selecciona un medio de recarga válido.')
      const result = provider.charge(input)
      const transaction = {
        id: randomUUID(), reference: newReference('REC', store.transactions), type: 'deposit',
        amount, fee: 0, fromUserId: null, toUserId: user.id,
        status: result.approved ? 'completed' : 'failed', description: result.description,
        providerReference: result.authorization ?? null,
        ...(result.approved ? {} : { failureReason: result.reason }), createdAt: new Date().toISOString(),
      }
      if (result.approved) user.balance += amount
      store.transactions.push(transaction)
      repository.save(store)
      notifier.notify(user.id)
      return { approved: result.approved, reason: result.reason, transaction }
    },
  }
}

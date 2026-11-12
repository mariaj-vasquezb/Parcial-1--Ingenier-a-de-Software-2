import { randomUUID } from 'node:crypto'
import { consumeOtp, issueOtp } from './otp.mjs'
import { WalletError, newReference, parseAmount, quoteTransfer } from './wallet.mjs'

function prepareTransfer({ input, user, store }) {
  const amount = parseAmount(input.amount)
  const target = store.users.find((item) => item.status === 'active' && item.id !== user.id && (item.document === input.recipient || item.accountNumber === input.recipient))
  if (!target) throw new WalletError(404, 'El destinatario no existe o no está activo.')
  return { target, quote: quoteTransfer({ sender: user, amount, transactions: store.transactions }) }
}

/**
 * Coordinates transfer rules and settlement without depending on HTTP or storage implementations.
 * @param {{ repository: { save: (store: Object) => void }, notifier: { notify: (...userIds: string[]) => void }, otp?: { issue: typeof issueOtp, consume: typeof consumeOtp } }} dependencies
 */
export function createTransferService({ repository, notifier, otp = { issue: issueOtp, consume: consumeOtp } }) {
  return {
    preview(context) {
      return prepareTransfer(context)
    },

    issueConfirmation(context) {
      const { target, quote } = prepareTransfer(context)
      if (!quote.requiresOtp) throw new WalletError(400, 'Esta transferencia no requiere código de confirmación.')
      const code = otp.issue(context.store, context.user.id, { recipientId: target.id, amount: quote.amount })
      repository.save(context.store)
      return code
    },

    execute({ input, user, store }) {
      const { target, quote } = prepareTransfer({ input, user, store })
      if (quote.requiresOtp) {
        const result = otp.consume(store, user.id, { recipientId: target.id, amount: quote.amount }, input.otp)
        if (!result.ok) {
          repository.save(store)
          throw new WalletError(400, result.message, { code: 'OTP_INVALID' })
        }
      }

      user.balance -= quote.total
      target.balance += quote.amount
      user.points += quote.points
      const transaction = {
        id: randomUUID(),
        reference: newReference('TRX', store.transactions),
        type: 'transfer',
        amount: quote.amount,
        fee: quote.fee,
        fromUserId: user.id,
        toUserId: target.id,
        status: 'completed',
        description: String(input.description ?? '').slice(0, 80),
        createdAt: new Date().toISOString(),
      }
      store.transactions.push(transaction)
      repository.save(store)
      notifier.notify(user.id, target.id)
      return { transaction, quote }
    },
  }
}

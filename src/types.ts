export type User = {
  id: string; document: string; fullName: string; email: string; phone: string; accountNumber: string
  status: string; balance: number; points: number; level: string; progress: number; feeRate: number; dailyLimit: number; createdAt: string
}

export type Transaction = {
  id: string; reference: string; type: 'deposit' | 'transfer'; amount: number; fee: number; direction: 'in' | 'out'; counterpart: string; description: string; createdAt: string; status: string
}

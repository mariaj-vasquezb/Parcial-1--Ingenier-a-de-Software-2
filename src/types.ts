export type User = {
  id: string; document: string; fullName: string; email: string; phone: string; accountNumber: string
  status: string; balance: number; points: number; level: string; progress: number; feeRate: number; dailyLimit: number; biometricEnabled: boolean; createdAt: string
}

export type Transaction = {
  id: string; reference: string; type: 'deposit' | 'transfer' | 'payment'; amount: number; fee: number; direction: 'in' | 'out'; counterpart: string; description: string; createdAt: string
  status: 'completed' | 'failed'; failureReason?: string
}

export type Merchant = { code: string; name: string; category: string; status: 'active' | 'inactive'; qrAmount: number | null; qr: string }

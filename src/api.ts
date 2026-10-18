export const API_URL = 'http://localhost:4000/api'
export const TOKEN_KEY = 'walletuq_token'

export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

// Errores que significan que la sesión ya no sirve y hay que volver a ingresar.
export const isSessionError = (error: unknown) => error instanceof ApiError && [401, 403, 423].includes(error.status)

type Options = RequestInit & { background?: boolean }

// background: consultas automáticas que no deben contar como actividad del usuario.
export async function api<T>(path: string, { background, ...options }: Options = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(background ? { 'X-WalletUQ-Background': '1' } : {}), ...options.headers },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(data.message || 'No fue posible completar la operación.', response.status, data.code)
  return data
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Error inesperado'
export const money = (amount: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount)
export const shortDate = (value: string) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value))

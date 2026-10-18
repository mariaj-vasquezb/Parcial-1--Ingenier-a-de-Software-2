// Comercios afiliados de demostración. Uno está inactivo para probar el rechazo del pago.
export const DEMO_MERCHANTS = [
  { code: 'CAFE-UQ', name: 'Café Universitario UQ', category: 'Cafetería', status: 'active', qrAmount: 12_000 },
  { code: 'LIB-CENTRO', name: 'Librería Centro Armenia', category: 'Librería', status: 'active', qrAmount: null },
  { code: 'MKT-NORTE', name: 'Minimercado El Norte', category: 'Supermercado', status: 'inactive', qrAmount: null },
]

export function ensureMerchants(store) {
  let changed = false
  for (const seed of DEMO_MERCHANTS) {
    if (store.merchants.some((merchant) => merchant.code === seed.code)) continue
    store.merchants.push({ ...seed, balance: 0, createdAt: new Date().toISOString() })
    changed = true
  }
  return changed
}

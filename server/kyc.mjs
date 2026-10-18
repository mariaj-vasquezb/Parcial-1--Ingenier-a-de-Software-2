import { randomUUID } from 'node:crypto'

// Simulación del proveedor KYC (IF-010). Para probar el rechazo, usa un documento terminado en 0000.
export const KYC_REJECTED_SUFFIX = '0000'

export function verifyIdentity({ document }) {
  if (document.endsWith(KYC_REJECTED_SUFFIX)) {
    return { approved: false, reason: 'El proveedor de identidad no pudo validar tu documento. Revisa tus datos e intenta de nuevo.' }
  }
  return { approved: true, reference: `KYC-${randomUUID().slice(0, 8).toUpperCase()}` }
}

import { browserSupportsWebAuthn, startAuthentication, startRegistration, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { api } from './api'
import type { User } from './types'

export const biometricSupported = () => browserSupportsWebAuthn()

// Traduce las cancelaciones del diálogo del sistema (Touch ID, Windows Hello…) a un mensaje claro.
async function withDeviceDialog<T>(run: () => Promise<T>): Promise<T> {
  try { return await run() }
  catch (error) {
    if (error instanceof Error && ['NotAllowedError', 'AbortError'].includes(error.name)) throw new Error('Cancelaste la verificación biométrica o el tiempo se agotó.')
    if (error instanceof Error && error.name === 'InvalidStateError') throw new Error('Este dispositivo ya tiene la biometría registrada para tu cuenta.')
    throw error
  }
}

export async function loginWithBiometric(document: string) {
  const { options } = await api<{ options: PublicKeyCredentialRequestOptionsJSON }>('/auth/biometric/options', { method: 'POST', body: JSON.stringify({ document }) })
  const response = await withDeviceDialog(() => startAuthentication({ optionsJSON: options }))
  return api<{ token: string; user: User }>('/auth/biometric/verify', { method: 'POST', body: JSON.stringify({ document, response }) })
}

export async function enrollBiometric() {
  const { options } = await api<{ options: PublicKeyCredentialCreationOptionsJSON }>('/biometric/register/options', { method: 'POST' })
  const response = await withDeviceDialog(() => startRegistration({ optionsJSON: options }))
  return api<{ user: User }>('/biometric/register/verify', { method: 'POST', body: JSON.stringify({ response }) })
}

export const disableBiometric = () => api<{ user: User }>('/biometric', { method: 'DELETE' })

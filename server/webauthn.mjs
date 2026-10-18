import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server'
import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers'

// Biometría del dispositivo (Touch ID, Windows Hello, huella) mediante WebAuthn (SWR-002).
// El servidor solo guarda la clave pública; la huella o el rostro nunca salen del dispositivo.
export const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost'
const RP_NAME = 'WalletUQ'
const CHALLENGE_TTL_MS = 2 * 60 * 1000

const descriptors = (user) => (user.passkeys ?? []).map(({ id, transports }) => ({ id, transports }))

export function rememberChallenge(user, purpose, challenge, now = Date.now()) {
  user.webauthnChallenge = { purpose, value: challenge, expiresAt: new Date(now + CHALLENGE_TTL_MS).toISOString() }
}

export function takeChallenge(user, purpose, now = Date.now()) {
  const challenge = user.webauthnChallenge
  delete user.webauthnChallenge
  if (!challenge || challenge.purpose !== purpose || Date.parse(challenge.expiresAt) <= now) return null
  return challenge.value
}

export function registrationOptions(user) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: user.document,
    userDisplayName: user.fullName,
    userID: isoUint8Array.fromUTF8String(user.id),
    attestationType: 'none',
    excludeCredentials: descriptors(user),
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
  })
}

export async function verifyRegistration({ response, challenge, origins }) {
  const { verified, registrationInfo } = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origins, expectedRPID: RP_ID, requireUserVerification: true })
  if (!verified) return null
  const { credential } = registrationInfo
  return { id: credential.id, publicKey: isoBase64URL.fromBuffer(credential.publicKey), counter: credential.counter, transports: credential.transports ?? [], createdAt: new Date().toISOString() }
}

export const authenticationOptions = (user) => generateAuthenticationOptions({ rpID: RP_ID, allowCredentials: descriptors(user), userVerification: 'required' })

export async function verifyAuthentication({ response, challenge, passkey, origins }) {
  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origins,
    expectedRPID: RP_ID,
    credential: { id: passkey.id, publicKey: isoBase64URL.toBuffer(passkey.publicKey), counter: passkey.counter, transports: passkey.transports },
    requireUserVerification: true,
  })
  return verified ? { newCounter: authenticationInfo.newCounter } : null
}

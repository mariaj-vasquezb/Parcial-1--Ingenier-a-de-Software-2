export type RegistrationField = 'fullName' | 'document' | 'email' | 'phone' | 'pin' | 'acceptedKyc'
export function validateRegistration(form: Partial<Record<RegistrationField, unknown>>): Partial<Record<RegistrationField, string>>

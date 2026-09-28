const emailPattern = /^[^\s@.]+(?:\.[^\s@.]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

export function validateRegistration(form) {
  const errors = {}
  if (typeof form.fullName !== 'string' || !form.fullName.trim()) errors.fullName = 'Ingresa tu nombre completo.'
  if (typeof form.document !== 'string' || !/^[0-9]{6,12}$/.test(form.document)) errors.document = 'El documento debe tener entre 6 y 12 dígitos.'
  if (typeof form.email !== 'string' || !emailPattern.test(form.email.trim())) errors.email = 'Ingresa un correo completo, por ejemplo: nombre@gmail.com.'
  if (typeof form.phone !== 'string' || !/^3[0-9]{9}$/.test(form.phone)) errors.phone = 'El celular debe tener 10 dígitos y empezar por 3.'
  if (typeof form.pin !== 'string' || !/^[0-9]{6}$/.test(form.pin)) errors.pin = 'El PIN debe tener exactamente 6 dígitos.'
  if (form.acceptedKyc !== true) errors.acceptedKyc = 'Debes confirmar la validación de identidad.'
  return errors
}

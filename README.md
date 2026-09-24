# WalletUQ

Prototipo funcional de billetera digital basado en los requisitos académicos suministrados.

## Ejecutar dos clientes

```bash
npm install
npm run dev
```

Esto inicia:

- API compartida: http://localhost:4000
- Cliente A: http://localhost:5173
- Cliente B: http://localhost:5174

Registra un usuario distinto en cada cliente. Recarga saldo en el Cliente A y transfiere usando el documento o número de cuenta del Cliente B.

Para transferencias superiores a $1.000.000, el OTP de demostración es `123456`.

## Requisitos implementados

- Registro con documento único y KYC mock.
- Login con PIN de seis dígitos y bloqueo tras tres intentos fallidos.
- Sesión JWT de 15 minutos.
- Panel con saldo, puntos, nivel, progreso, comisión y límite diario.
- Recarga mock con mínimo de $10.000 y sin comisión interna.
- Transferencia atómica entre usuarios con vista previa, comisión y validaciones.
- Puntos: `floor(monto / 10.000)`.
- Niveles Bronze, Silver, Gold y Platinum.
- Historial compartido y persistente en JSON local.
- Interfaz responsive desde 320 px.
"# Parcial-1--Ingenier-a-de-Software-2" 

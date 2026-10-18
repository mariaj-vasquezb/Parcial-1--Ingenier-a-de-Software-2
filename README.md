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

## Datos de prueba

| Caso | Cómo probarlo |
|---|---|
| KYC rechazado (F-01) | Registra un documento terminado en `0000`. |
| Tarjeta aprobada / rechazada (F-04) | `4242 4242 4242 4242` se aprueba; `4000 0000 0000 0002` se rechaza. Cualquier vencimiento futuro (MM/AA) y CVV de 3 dígitos. |
| PSE rechazado (F-04) | Elige "Banco de Pruebas (rechaza)". |
| Código 2FA (F-05) | Transferencias de más de $1.000.000 (desde Silver). El SMS es simulado: el código aparece en pantalla y en la consola de la API. |
| Pago QR (F-06) | Pagar → "Ver QR de comercios de prueba". El Café tiene QR con monto fijo, la Librería monto libre y el Minimercado está inactivo. Los QR se pueden descargar y escanear con la cámara o subir como imagen. |
| Biometría (F-02) | En el panel, "Activar biometría" (Touch ID, Windows Hello o huella del dispositivo). Luego, en el ingreso, escribe el documento y usa "Ingresar con biometría". |

## Requisitos implementados

- **F-01 Registrar usuario:** documento único y cuenta creada solo si el proveedor KYC simulado (IF-010) aprueba la identidad.
- **F-02 Autenticar usuario:** PIN de seis dígitos guardado con scrypt; bloqueo temporal de 15 minutos tras tres intentos fallidos; biometría opcional del dispositivo con WebAuthn; la sesión se cierra tras 15 minutos de inactividad (el sondeo automático no cuenta como actividad).
- **F-03 Panel financiero:** saldo, nivel, puntos y progreso. El servidor avisa por Server-Sent Events después de cada movimiento, así que el panel se actualiza en menos de 2 segundos.
- **F-04 Recargar saldo:** tarjeta o PSE mediante pasarelas simuladas, mínimo $10.000, sin comisión interna; las recargas aprobadas y rechazadas quedan registradas.
- **F-05 Transferir saldo:** destinatario activo, saldo, límite diario por nivel (día calendario de Colombia), código 2FA de un solo uso ligado a la transferencia para montos superiores a $1.000.000, comisión por nivel, actualización atómica e identificador único.
- **F-06 Pagar a comercio por QR:** lectura con la cámara (o imagen/código pegado), QR firmado con HMAC, comercio activo, comisión según el nivel y débito/crédito atómico.
- Puntos: `floor(monto / 10.000)` por transferencias y pagos. Niveles Bronze, Silver, Gold y Platinum.
- Historial compartido y persistente en JSON local. Interfaz responsive desde 320 px.

## Pruebas

```bash
npm test            # pruebas unitarias, sin servidor
npm run test:flow   # flujo completo F-01 a F-06 contra la API en el puerto 4000
```
"# Parcial-1--Ingenier-a-de-Software-2" 

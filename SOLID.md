# SOLID aplicado en WalletUQ

Los cinco principios se muestran en el flujo real de recargas (F-04). La ruta
`POST /api/deposits` utiliza este código tanto para tarjeta como para PSE.

| Principio | Ejemplo del proyecto | Qué permite |
|---|---|---|
| **S — Responsabilidad única (SRP)** | `validateDepositAmount` valida montos; los proveedores validan y cobran por su medio; `createDepositService` coordina la recarga; la ruta construye la respuesta HTTP. | Cambiar la validación de tarjeta sin tocar la persistencia ni la respuesta HTTP. |
| **O — Abierto/cerrado (OCP)** | El servicio busca el proveedor en un `Map`, sin condiciones específicas para tarjeta o PSE. | Agregar un medio registrando otro proveedor, sin modificar `execute`. |
| **L — Sustitución de Liskov (LSP)** | `cardDepositProvider` y `pseDepositProvider` cumplen el contrato `DepositProvider`. | Intercambiarlos conservando las reglas de aprobación, rechazo y validación del servicio. |
| **I — Segregación de interfaces (ISP)** | Los contratos son `charge(input)`, `save(store)` y `notify(userId)`. | El proveedor no necesita implementar historial o reembolsos; el servicio no necesita lectura o borrado del repositorio ni suscripción a eventos. |
| **D — Inversión de dependencias (DIP)** | `createDepositService` recibe proveedores, repositorio y notificador. `server/index.mjs` conecta las implementaciones concretas. | Probar la lógica sin Express, archivos JSON ni conexiones SSE. |

## S: responsabilidades separadas

Antes, la ruta validaba montos, elegía la pasarela, validaba tarjetas o bancos,
acreditaba saldo, creaba el movimiento, guardaba y notificaba. Ahora:

- `server/deposit-service.mjs`: validación de monto y coordinación del caso de uso.
- `server/deposit-providers.mjs`: adaptación de tarjeta y PSE al contrato común.
- `server/payment-gateway.mjs`: simulación de los proveedores externos.
- `server/store.mjs`: persistencia JSON.
- `server/events.mjs`: notificaciones SSE.
- `server/index.mjs`: composición de dependencias y traducción a HTTP.

SRP se refiere a un motivo de cambio: el servicio puede coordinar varios pasos
sin implementar los detalles de cada infraestructura.

## O: agregar otro medio sin cambiar el servicio

Ejemplo didáctico de un bono simulado (no está habilitado en la API):

```js
const voucherProvider = {
  charge(input) {
    if (input.voucher !== 'UQ-DEMO') {
      return { approved: false, reason: 'Bono rechazado.', description: 'Bono UQ' }
    }
    return { approved: true, authorization: 'BONO-DEMO', description: 'Bono UQ' }
  },
}

const providers = new Map([
  ['card', cardDepositProvider],
  ['bank', pseDepositProvider],
  ['voucher', voucherProvider],
])
// Se inyecta este Map en createDepositService; execute no cambia.
```

Una integración completa también requiere la opción correspondiente en la interfaz
y las validaciones específicas del nuevo proveedor.

## L: contrato de sustitución

Los dos proveedores reales implementan `charge(input)` con estas reglas:

1. Datos inválidos: lanzan `WalletError` con estado 400 antes de cobrar.
2. Aprobación: devuelven `approved: true`, `authorization` y `description`.
3. Rechazo del proveedor: devuelven `approved: false`, `reason` y `description`.
4. No cambian saldos ni escriben archivos. En este prototipo son síncronos.

Por ello, el mismo servicio acredita el monto exacto cuando se aprueba y registra
el rechazo sin acreditar cuando falla. La misma batería de pruebas se ejecuta
contra tarjeta y PSE. Un proveedor asíncrono requeriría adaptar el contrato y la
coordinación del servicio; no sería un reemplazo directo del contrato actual.

## I y D: contratos pequeños e inyección

Composición real en `server/index.mjs`:

```js
const deposits = createDepositService({
  providers: new Map([['card', cardDepositProvider], ['bank', pseDepositProvider]]),
  repository: { save: writeStore },
  notifier: { notify },
})
```

`DepositProvider` está documentado con JSDoc en `deposit-providers.mjs`. JavaScript
usa contratos estructurales: no requiere una clase base ni métodos vacíos.
El servicio importa reglas del dominio, pero no importa Express, el repositorio
JSON ni SSE. La composición conoce los detalles y los inyecta.

Las pruebas sustituyen `save` y `notify` por funciones en memoria, verifican lo que
se guarda y comprueban que la notificación ocurre después de guardar.

## Ejecutar los ejemplos verificables

```bash
node --test server/deposit-service.test.mjs
npm test
```

Las pruebas cubren aprobación y rechazo en ambos medios, entradas inválidas,
límites de recarga, registro del movimiento, notificación y una tercera fuente
inyectada sin modificar el servicio. La API conserva estados 201 (aprobada),
402 (rechazada) y 400 (datos inválidos). Omitir `source` usa tarjeta; un valor
desconocido devuelve 400.

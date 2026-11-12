# Diagnóstico y refactorización de transferencias

## 1. Contexto

- **Equipo:** no indicado en los archivos del repositorio.
- **Repositorio:** `mariaj-vasquezb/Parcial-1--Ingenier-a-de-Software-2`.
- **Funcionalidad:** F-05, transferencia entre usuarios.
- **Requisito relacionado:** SWR-005. La funcionalidad se documenta en `DOCUMENTACION_WALLETUQ.txt`, sección “Reglas de transferencia”.
- **Alcance:** vista previa, confirmación OTP y ejecución de transferencia en la API. Se conserva la persistencia JSON local existente.

## 2. Arquitectura real y flujo

1. `src/Dashboard.tsx` ofrece el formulario de transferencia y solicita vista previa, OTP y confirmación a la API.
2. `server/index.mjs` resuelve la sesión y expone `POST /api/transfers/preview`, `/otp` y `/api/transfers`.
3. Las rutas delegan la preparación y ejecución a `server/transfer-service.mjs`.
4. El servicio aplica `parseAmount` y `quoteTransfer` de `server/wallet.mjs`; las reglas de OTP se implementan en `server/otp.mjs`.
5. El servicio recibe el repositorio y notificador al componerse en `server/index.mjs`. La implementación guarda el estado mediante `server/store.mjs` y notifica a los usuarios mediante `server/events.mjs`.
6. El resultado vuelve a la interfaz, que actualiza el panel e historial.

La persistencia es un archivo JSON, no una base de datos transaccional. `writeStore` escribe un archivo temporal y lo renombra, pero el diseño no ofrece coordinación entre varias instancias del servidor.

## 3. Hallazgos

### H-01 — Responsabilidades de caso de uso en la ruta HTTP

- **Tipo:** deuda técnica / riesgo arquitectónico.
- **Ubicación original:** `server/index.mjs`, rutas F-05 (aprox. líneas 198–229 antes de la intervención).
- **Evidencia original:** `transferRequest` interpretaba el monto, buscaba al destinatario y calculaba la cotización; la ruta de confirmación consumía OTP, cambiaba ambos saldos y puntos, creaba el movimiento, persistía y notificaba.
- **Observación:** la ruta HTTP coordinaba decisiones del caso de uso y detalles de infraestructura además de traducir la solicitud/respuesta. Esto elevaba el acoplamiento y hacía más difícil probar el flujo sin Express o almacenamiento real.
- **Criterio:** separación de responsabilidades, cohesión y dependencias testeables.
- **Consecuencia:** un cambio en el proceso de transferencia podía requerir editar y probar directamente el módulo que concentra las rutas de toda la aplicación.
- **Acción:** extraer preparación, OTP y liquidación a `server/transfer-service.mjs`, con repositorio, notificador y OTP sustituibles en pruebas.
- **Verificación:** pruebas unitarias del servicio para transferencia aprobada y OTP inválido; suite completa y flujo integrado.
- **Estado:** implementado y verificado.

### H-02 — Secuencia de liquidación repetida entre pagos y transferencias

- **Tipo:** oportunidad de mejora.
- **Ubicación:** `server/transfer-service.mjs`, método `execute` (líneas 40–57); `server/index.mjs`, ruta `POST /api/payments` (líneas 242–247).
- **Evidencia:** ambos flujos mutan saldo/puntos o saldo de la contraparte, agregan un movimiento, guardan y notifican desde sus respectivos coordinadores. En pagos, esa secuencia sigue estando dentro de la ruta.
- **Observación:** las operaciones tienen reglas distintas, por lo que no se justifica forzar una única función ahora; sin embargo, cada coordinador mantiene su propia secuencia de liquidación y puede evolucionar de forma diferente.
- **Criterio:** consistencia y mantenibilidad de operaciones financieras.
- **Consecuencia:** futuras modificaciones a persistencia o notificaciones deben revisarse en más de un flujo.
- **Acción propuesta:** mantener separado por ahora; si aparecen más operaciones, evaluar una abstracción de liquidación con pruebas que expresen diferencias entre destinatario usuario y comercio.
- **Verificación:** revisión de las secuencias de pago y transferencia; no se cambió el flujo de pagos.
- **Estado:** pendiente, fuera del alcance acotado de esta intervención.

### H-03 — El límite diario recorre el historial completo

- **Tipo:** deuda técnica / riesgo de rendimiento.
- **Ubicación:** `server/wallet.mjs`, `sentToday` (líneas 44–49), invocada al cotizar transferencias.
- **Evidencia:** `sentToday` filtra `transactions` y suma coincidencias; no limita ni pagina la colección antes del filtro. El almacenamiento JSON conserva la colección completa de movimientos.
- **Observación:** cada vista previa o confirmación de transferencia puede recorrer el historial global, aunque solo necesita los movimientos completados del usuario en el día colombiano actual.
- **Criterio:** eficiencia y escalabilidad del cálculo de límites.
- **Consecuencia:** el costo de cada cotización crece con el historial acumulado; con persistencia JSON también se reescribe el estado completo en cada guardado.
- **Acción propuesta:** cuando el volumen lo justifique, mantener un agregado diario indexado o mover transacciones a persistencia consultable por usuario/fecha, preservando la zona horaria y los estados válidos.
- **Verificación:** la prueba existente de `server/wallet.test.mjs` comprueba fecha de Bogotá, estado completado y emisor. No se modificó el algoritmo en este cambio.
- **Estado:** pendiente; requiere una decisión de persistencia y pruebas de migración/consistencia.

## 4. Priorización

| Hallazgo | Impacto (1–3) | Riesgo (1–3) | Esfuerzo (1–3) | Prioridad y razón |
|---|---:|---:|---:|---|
| H-01 | 3 | 2 | 2 | Seleccionado: interviene directamente en una transacción financiera y se puede aislar sin cambiar contratos HTTP. |
| H-02 | 2 | 2 | 2 | Se posterga: es una duplicación acotada y los pagos tienen reglas y contraparte diferentes. |
| H-03 | 2 | 2 | 3 | Se posterga: su solución adecuada depende de volumen y de una estrategia de persistencia fuera del alcance del refactor. |

Escala: 1 = bajo, 2 = medio, 3 = alto. El esfuerzo se expresa como costo relativo.

## 5. Intervención

- **Antes:** las rutas F-05 en `server/index.mjs` resolvían el destinatario, cotizaban, validaban/consumían OTP, cambiaban saldos y puntos, creaban el movimiento, guardaban y notificaban.
- **Después:** `server/transfer-service.mjs` prepara transferencias, emite confirmaciones y coordina la ejecución. `server/index.mjs` conserva autenticación, códigos HTTP y forma de respuesta, y compone el servicio con `writeStore` y `notify`.
- **Decisiones de compatibilidad:** se mantienen rutas, nombres/campos de respuesta, reglas de destinatario, comisión, límite, puntos, OTP, concepto de hasta 80 caracteres, referencia de movimiento y orden guardar-antes-de-notificar. Los intentos fallidos de OTP se guardan antes de devolver el error.
- **Archivos afectados:** `server/index.mjs`, `server/transfer-service.mjs`, `server/transfer-service.test.mjs` y este informe.

## 6. Verificación

- `npm test`: **36 pruebas aprobadas, 0 fallidas**.
- `npm run build`: **aprobado** (TypeScript y compilación Vite).
- `npm run test:flow`: **aprobado**. El flujo completo reportó emisor `$82.400`, receptor `$100.000`, 11 puntos y 6 movimientos.
- Las pruebas nuevas verifican la emisión de OTP solo sobre el umbral y su persistencia, el débito del emisor con comisión Bronze, crédito del receptor, puntos, persistencia previa a la notificación y que un OTP inválido persiste el intento sin mover saldos ni notificar.
- El archivo de almacenamiento creado por la prueba integrada se retiró al terminar; no había datos previos en `server/data`.
- **Limitaciones:** no se probaron varias instancias concurrentes ni rendimiento con historiales grandes. `npm ci` informó 6 avisos de dependencias (1 moderado, 3 altos y 2 críticos); su análisis y remediación no forman parte de esta intervención.

## 7. Cierre

La extracción deja el caso de uso de transferencia probado sin Express ni archivos y alinea su composición con el patrón usado por recargas. Queda pendiente decidir cómo escalar el historial y si conviene compartir una abstracción de liquidación con pagos.

Una práctica del proceso que habría detectado H-01 antes de entregar es revisar las responsabilidades y dependencias de cada ruta durante la revisión de diseño, junto con pruebas unitarias del caso de uso que lo separen de HTTP e infraestructura.

## 8. Git

- Diagnóstico: pendiente de registrar en commit.
- Intervención: pendiente de registrar en commit.
- Verificación: pendiente de registrar en commit.

# Auditoría — Caja (Cash) y módulos relacionados

**Proyecto:** DentiaCore · **Fecha:** 2026-06-02 · **Alcance:** módulo de caja de extremo a extremo (sesiones/cortes, movimientos, edición con audit trail) + cobros de paciente (`PatientCharge`), integración con citas y estadísticas, y permisos/roles.

## Resumen

El módulo de caja está **muy bien defendido** y se nota que pasó por auditorías previas: índice único parcial para garantizar **una sola caja OPEN**, estado intermedio `CLOSING` con guard de sesiones colgadas, *sagas* compensatorias con re‑chequeo de sesión (rollback del `CashMovement` si la caja se cierra a media operación), inmutabilidad de pagos en `PatientCharge` (hook `pre('save')`), guard atómico anti‑sobrepago (`saldoPendiente >= monto` dentro del `findOneAndUpdate`), redondeo a 2 decimales en todos los montos, y autorización por permisos en cada ruta (autenticación global + `authorize` + audit logger NOM‑024).

Encontré **1 defecto real de severidad alta** —que afectaba dinero cobrado al paciente— y **5 hallazgos menores**. Tras tu revisión: **2 corregidos** (A1 y A5), **1 aceptado por diseño** (A2) y **3 recomendaciones abiertas** (A3, A4, A6).

| # | Severidad | Área | Estado |
|---|-----------|------|--------|
| A1 | **Alta** | `saldoPendiente` del cobro de cita se desincroniza al editar los conceptos → sobre/sub‑cobro | ✅ Corregido |
| A5 | Baja | Abrir caja con el campo de monto vacío daba 400 en vez de abrir en ceros | ✅ Corregido |
| A2 | Media | El reverso de pagos al cancelar un cobro puede dejar la caja en efectivo negativo | ✅ Aceptado por diseño |
| A3 | Media | Las estadísticas de "ingresos" no netean egresos/reversos (sobreestiman) | ⚠️ Recomendación abierta |
| A4 | Baja | Balance mensual usa límites de mes en hora local del servidor (fechas en UTC) + umbral 48 h vs 24 h | ⚠️ Recomendación abierta |
| A6 | Baja | `describeChanges` (historial de ediciones) puede romper con ediciones legacy/corruptas | ⚠️ Recomendación abierta |

---

## Hallazgos corregidos

### A1. El `saldoPendiente` de un cobro de cita se desincroniza al editar los conceptos — *Alta*

**Dónde:** `Server/controllers/appointmentController.js` → `updateAppointment`, rama de sincronización `updateItems`. **Causa raíz** en la interacción con `Server/models/patientCharge.js` y `Server/controllers/patientChargeController.js`.

**Problema (cadena completa):**

1. Al crear una cita con conceptos, `createAppointment` **auto‑crea** el cobro con `confirmado: false` (`appointmentController.js` ~línea 386). Verifiqué por búsqueda en todo el servidor que **ningún flujo promueve ese cobro a `confirmado: true`** — el único lugar que asigna `confirmado: true` es `patientChargeController.createCharge` (cobro manual). Es decir, **los cobros nacidos de una cita quedan `confirmado:false` para siempre**.
2. Como consecuencia, el guard de inmutabilidad de `updateAppointment` (`findOne({ confirmado: true })`, ~línea 547) **nunca dispara** para estos cobros: sus conceptos siempre se pueden editar desde la cita.
3. La sincronización se hacía con `PatientCharge.findOneAndUpdate(..., { $set: { items, total } })`. Mongoose **no ejecuta el hook `pre('save')`** en `findOneAndUpdate`, y ese hook es justo el que recalcula `totalPagado` y `saldoPendiente`. Resultado: se actualiza `total` pero **`saldoPendiente` se queda con el valor viejo** (rompe la invariante `saldoPendiente = max(0, total − totalPagado)`).

**Impacto — dinero real:** si un cobro de cita recibe un **pago parcial** y luego se editan los conceptos, `saldoPendiente` queda obsoleto. Como `addPayment` recalcula `saldoPendiente` desde `total` en el siguiente pago, el desfase se traduce en **sobre‑cobro o sub‑cobro al paciente**, además de panel de "Cobros de Citas" y reportes de pendientes incorrectos.

Ejemplo: cobro total $1 000 → se paga $400 (`saldoPendiente` $600) → se editan items a total $600. Antes del fix `saldoPendiente` seguía en $600 cuando lo correcto es $200; el paciente terminaba pagando $400 de más.

**Arreglo (`appointmentController.js`):**

- Si el cobro de la cita **ya tiene pagos** (`totalPagado > 0`): **no se reescriben** los conceptos facturados; se devuelve un *warning* (`warnings[]` en la respuesta, igual que el patrón ya existente) indicando que el ajuste se haga desde el expediente del paciente (cancelar + reemitir). Alterar la base de un cobro pagado por la puerta lateral de la cita corrompe la contabilidad.
- Si **no tiene pagos**: se sincronizan `items` y `total` **y se fija `saldoPendiente` explícitamente** (`round2(max(0, total − totalPagado))`), preservando la invariante aunque el hook `pre('save')` no corra.
- Se añadió un helper `round2` en el controlador para el cálculo.

> Nota de comportamiento: tras este cambio, editar los conceptos de una cita cuyo cobro ya recibió pagos **dejará de reescribir el cobro** y devolverá un aviso. Es intencional (protege el cobro pagado), pero conviene que el equipo lo conozca.

**Prueba añadida:** `Server/tests/cash-flow.test.js` → bloque `A1 · cobro de cita — saldoPendiente consistente al editar items` con dos casos: (1) sin pagos, al bajar el total `saldoPendiente` se recalcula; (2) con pago parcial, editar items **no** altera el cobro y la invariante `saldoPendiente = total − totalPagado` se mantiene.

### A5. Abrir la caja con el campo de monto vacío daba 400 — *Baja* → *(decisión: debe poder abrirse en ceros)*

**Dónde:** `Client/src/features/cash/OpenBoxModal.jsx` + `Server/routes/cashRoutes.js`.

**Problema:** si el usuario **borra** el campo de monto inicial, antd `InputNumber` deja el valor en `null` y el cliente enviaba `{ initialAmount: null }`. La validación de ruta `body('initialAmount').optional()` sólo omite `undefined`, no `null`, así que `isFloat` fallaba y respondía **400** en lugar de abrir la caja en ceros (que es lo que el controlador ya resolvería con `Number(initialAmount) || 0`).

**Arreglo:**

- **Cliente (`OpenBoxModal.jsx`):** se coerciona el monto a 0 antes de enviar — `const initialAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0;`. Abrir una caja sin fondo de cambio queda soportado.
- **Ruta (`cashRoutes.js`):** `body('initialAmount').optional({ values: 'null' })` — `null`/`undefined` se tratan como ausentes (el controlador hace `Number()||0`). Defensa para cualquier otro cliente. Los montos fuera de rango (negativos, no numéricos) **siguen rechazándose**.

---

## Decisiones registradas

### A2. El reverso de pagos puede dejar la caja en efectivo negativo — *Media* → **Aceptado por diseño**

**Dónde:** `Server/controllers/patientChargeController.js` → `cancelCharge`, rama `reversePayments = true` (~líneas 429‑461).

Al cancelar un cobro con "revertir pagos", por cada pago se crea un `CashMovement` `EXPENSE` en la caja OPEN actual **sin verificar el efectivo disponible** (`cashOnHand`). A diferencia de `addMovement` (que bloquea un retiro CASH que deje la caja en negativo), el reverso no aplica ese guard, así que el efectivo físico de la sesión puede quedar negativo (p. ej. cuando los pagos originales se cobraron en una sesión ya cerrada).

**Decisión (tuya, 2026‑06‑02):** se **mantiene** el comportamiento — un reembolso es legítimo y la caja **sí puede quedar en negativo** en un reverso. **No se cambió el código.** (El dashboard ya muestra los saldos negativos en rojo, así que el operador lo ve.)

---

## Recomendaciones abiertas (sin acción aún)

### A3. Las estadísticas de ingresos no netean egresos/reversos — *Media*

**Dónde:** `Server/controllers/statsController.js` (pipelines de ingresos en ~líneas 125‑130, 185 y 474‑479): agrupan **sólo** `type: 'INCOME'`.

Un pago revertido genera un `EXPENSE` compensatorio que **no se resta** del "ingreso" reportado; lo mismo con cualquier gasto. Los reportes de ingresos por periodo/servicio quedan **sobreestimados** cuando hay reversos o reembolsos.

**Sugerencia:** definir si el reporte es **bruto** (lo actual) o **neto**. Si es neto, restar los `EXPENSE` (o al menos los reversos `linkedChargeId != null`) en los pipelines. Es decisión de negocio + posible cambio en las gráficas.

### A4. Límites de mes en hora local del servidor + umbral inconsistente — *Baja*

**Dónde:** `Server/controllers/cashController.js` → `getMonthlyBalance` (~líneas 62‑63).

`startOfMonth`/`endOfMonth` se calculan con la **hora local del servidor**, mientras los movimientos se guardan en UTC (`date: new Date()`). Si el servidor no corre en la zona horaria de la clínica, los movimientos cerca del cambio de mes pueden mal‑atribuirse. Además, el umbral de "sesión rezagada" en este endpoint es **48 h** (~línea 69), pero `getStaleSessions` usa **24 h** (~línea 113): dos definiciones de "caja olvidada".

**Sugerencia:** fijar la zona horaria de la clínica para los cortes mensuales (o documentar que el servidor debe correr en esa TZ) y unificar el umbral de sesión rezagada.

### A6. `describeChanges` puede romper con ediciones legacy/corruptas — *Baja*

**Dónde:** `Client/src/features/cash/MovementsList.jsx` → `describeChanges` (~línea 42).

`Object.entries(changes).map(([field, { from, to }]) => …)` desestructura `{ from, to }` sin guarda. El backend ya sanea `changes` a `{from,to}`, pero un registro de edición antiguo con otra forma haría que la lista de movimientos lance al renderizar el historial.

**Sugerencia:** validar la forma antes de desestructurar (defensa en profundidad).

---

## Lo que está bien (verificado)

- **Una sola caja OPEN**: índice único parcial `{status:'OPEN'}` + manejo de `E11000` en `openBox`. Doble apertura concurrente bloqueada.
- **Cierre atómico**: `OPEN → CLOSING → CLOSED` con `findOneAndUpdate`, recálculo del corte, y reversión a `OPEN` si falla a mitad. `CLOSING` huérfano bloquea nuevas aperturas y es recuperable (`force-resolve`).
- **Sagas compensatorias** en `addMovement` y `addPayment`: re‑chequean que la sesión siga OPEN tras crear el movimiento y hacen rollback si se cerró; `addPayment` además usa guard atómico `saldoPendiente >= monto` contra sobrepago concurrente.
- **Inmutabilidad de pagos** (`patientCharge` `pre('save')`): no se pueden borrar ni alterar pagos ya registrados.
- **Edición de movimientos** con audit trail append‑only, bloqueo de edición de movimientos ligados a un cobro activo, y recálculo de `finalAmount` si la sesión ya estaba cerrada (con guard de no dejar el corte en negativo).
- **Seguridad/permología**: autenticación global antes de `/cash` y `/patient-charges`, `authorize(['cash.read'|'cash.manage'])` por ruta, validación `express-validator`, y `auditLogger` registrando las escrituras.

---

## Verificación realizada

- **`node --check`** OK en `appointmentController.js`, `cashRoutes.js` y `cash-flow.test.js`.
- **A1 — lógica pura** del recálculo (`saldoPendiente = round2(max(0, total − totalPagado))`): 5/5 casos PASS — baja/sube de total sin pagos, pago parcial (caso del bug), total por debajo de lo pagado (no negativo) y redondeo a 2 decimales.
- **A1 — pruebas de integración añadidas** al suite de caja (2 casos). **No** se pudieron ejecutar aquí: `mongodb-memory-server` no descarga el binario de `mongod` para `aarch64` (HTTP 403, red restringida) — mismo límite que en auditorías previas. **Corre `npm test` en tu equipo** para validar A1 con la suite existente.
- **A5 — comportamiento de `optional({ values: 'null' })`** verificado con un script de `express-validator`: `null`/`undefined`/`0`/`1500.5` se aceptan (se abre en ceros), y `-5`/`"abc"` se siguen rechazando por rango.
- **Revisión de diffs**: cambios acotados; el resto de `updateAppointment` (conflictos, transiciones de estado, cancelaciones) queda intacto.

## Archivos modificados

- `Server/controllers/appointmentController.js` — helper `round2`; la sincronización de items del cobro recalcula `saldoPendiente` y no reescribe cobros con pagos (A1).
- `Server/tests/cash-flow.test.js` — bloque de pruebas `A1` (2 casos).
- `Client/src/features/cash/OpenBoxModal.jsx` — coerción de monto inicial a 0 al abrir caja (A5).
- `Server/routes/cashRoutes.js` — `initialAmount` opcional acepta vacío/`null` como 0 (A5).

## Pendiente (tu decisión)

- **A3** — ¿ingresos brutos (actual) o netos (restando reversos/egresos)?
- **A4** — fijar/uniformar zona horaria del corte mensual y umbral de sesión rezagada (24 h vs 48 h).
- **A6** — guarda defensiva en `describeChanges` (1 línea).

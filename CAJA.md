1. Distribución Visual (Layout)
La pantalla se divide en dos columnas principales (Izquierda y Derecha):

A. Columna Izquierda (50% del ancho)
Esta columna gestiona el estado y las acciones. Se subdivide verticalmente:

Panel Superior (50% alto): "Ganancias y Estado"

Indicador Principal: Muestra el saldo acumulado del mes (ej. "$90.000").
Privacidad: Icono de "ojo" para ocultar/mostrar el monto sensible.
Filtros (Tabs/Píldoras):
Efectivo: Muestra solo dinero físico en caja.
Digital: Muestra dinero en bancos/transferencias.
Ambos: Total consolidado.
Panel Inferior (50% alto): "Acciones Operativas"

Botones de Acción:
Ingresar (Verde): Botón prominente para registrar cobros o entradas de dinero.
Retirar (Rojo): Botón prominente para registrar gastos, pagos a proveedores o retiros de efectivo.
(Opcional) Botón o control discreto para "Cerrar Caja" al final del turno.
B. Columna Derecha (50% del ancho, 100% del alto)

Panel: "Últimos Movimientos"
Scroll independiente
Cronológico
Lista Vertical: Historial cronológico de transacciones (scrollable).
Tarjeta de Movimiento: Cada fila incluye:
Avatar/Foto: Del paciente (si es ingreso) o usuario/icono (si es gasto).
Título: Nombre del paciente o concepto principal.
Subtítulo: Detalle (ej. "Implante dental", "Pago de luz").
Monto: Coloreado (Verde para ingresos, Rojo para egresos).
Pie de auditoría: Indicador de quién registró la transacción (ej. "Registrado por: Dr. Jefferson").
2. Flujos de Trabajo Críticos
A. Flujo de Apertura de Caja (Inicio del Día/Turno)

Disparador: Cuando el usuario entra a la sección "Caja".
Condición: Si la caja está CERRADA (ej. es un nuevo día o se cerró el turno anterior).
Interfaz: Modal Automático (Pop-up). No se puede usar la caja sin pasar por aquí.
Datos requeridos en el Modal:
Monto Inicial (Base): ¿Con cuánto efectivo inicia el cajón para dar cambio? (Puede ser $0).
Confirmación: Botón "Abrir Caja".
Resultado: Se crea una nueva BoxSession y se habilita la interfaz principal.
B. Flujo de Registro (Ingresar / Retirar)

Ingresar (Botón Verde): Abre formulario para:
Seleccionar Paciente (opcional, buscador).
Monto y Método de Pago (Efectivo/Digital).
Concepto.
Retirar (Botón Rojo): Abre formulario para:
Concepto del gasto/retiro.
Monto.
Validación: Si es efectivo, el sistema impide retirar más de lo que existe en el saldo de "Efectivo" actual.
3. Modelo de Datos (Backend)
Para soportar esto, mantendremos la estructura sugerida anteriormente, pero ahora sabemos exactamente cómo se consumirá:

BoxSession: Controla el estado (Abierta/Cerrada) y el monto inicial del Modal.
CashMovement: Registra cada transacción individual que aparece en la lista derecha.
¿Te parece bien esta definición? Si estás de acuerdo, el siguiente paso lógico sería crear estos modelos en el servidor (opción C del plan original, pero enfocado en Caja) o implementar la autenticación (que quedó pendiente en el plan) para saber quién está abriendo la caja.

1. Visión General y Propósito
El módulo de Caja tiene como objetivo gestionar el flujo de dinero (Cash Flow) de la clínica en tiempo real. A diferencia de un sistema contable complejo, este módulo se enfoca en la operatividad diaria: ¿Cuánto dinero entró hoy? ¿Cuánto salió? ¿Quién lo registró? ¿Cuánto tengo en efectivo vs. digital?

2. Desglose de Funcionalidades (Basado en Wireframe)
A. Panel de Estado y Ganancias ("Ganancias mensuales")
Este es el indicador principal.

Visualización de Saldo: Debe mostrar el total acumulado del periodo (mes actual por defecto).
Privacidad: El icono de "ojo" es crítico. Permite ocultar el monto si el doctor está mostrando la pantalla a un paciente o si hay personas no autorizadas cerca.
Filtros de Método de Pago (Tabs):
Efectivo: Muestra solo el dinero físico que debería haber en el cajón. Es vital para el "Arqueo de Caja" al final del día.
Digital: Suma de transferencias, tarjetas, depósitos. Dinero que ya está en el banco.
Ambos: Visión global de la rentabilidad.
B. Control de Sesión ("Abrir caja / Chairiruta")
El switch en la parte inferior izquierda indica un flujo de Apertura y Cierre de Caja.

Concepto: La caja no es un flujo infinito; se abre al inicio del turno y se cierra al final.
Funcionalidad:
Abrir Caja: Solicita un "Monto Inicial" (base en efectivo para cambio).
Cerrar Caja: Al apagar el switch, el sistema debe mostrar un resumen de lo recaudado en esa sesión y congelar los movimientos hasta la próxima apertura.
"Chairiruta": Parece ser el nombre de la sucursal o la caja específica. El sistema debe soportar múltiples cajas si la clínica crece.
C. Acciones Rápidas (Ingresar / Retirar)
Ingresar (Botón Verde):
Manual: Para ingresos varios (venta de cepillos, abonos sin cita).
Vinculado a Paciente: Al hacer clic, debería permitir buscar un paciente para asociar el pago a su historial.
Retirar (Botón Rojo):
Gastos Operativos: Pago de servicios, compra de insumos urgentes, retiro de efectivo para depósito bancario.
Validación: Si es retiro de efectivo, no debe permitir retirar más de lo que hay en el saldo de "Efectivo".
D. Listado de Movimientos ("Últimos movimientos")
Es la bitácora de auditoría en tiempo real.

Elementos por fila:
Avatar y Nombre: Identifica al paciente (si es un cobro) o al beneficiario/empleado (si es un pago/retiro).
Concepto: Descripción breve ("Implante dental", "Ingreso manual").
Monto: Diferenciado por color (Verde = Ingreso, Rojo = Egreso).
Auditoría: El pie de página "Movimiento registrado por: Dr. Jefferson" confirma que cada transacción guarda el ID del usuario logueado.
3. Arquitectura Técnica Necesaria (Backend)
Para soportar esto, necesitamos implementar lo siguiente en el servidor (Server):

Nuevo Modelo: CashMovement (Movimiento de Caja)
Nuevo Modelo: BoxSession (Sesión de Caja)
Para manejar el switch de "Abrir/Cerrar caja".

startDate, endDate
initialAmount (Base)
finalAmount (Declarado al cierre)
status (OPEN, CLOSED)
4. Integración con Roles y Permisos
Basado en nuestra matriz de roles definida anteriormente:

Admin / Doctor (Dr. Jefferson):

Puede ver el saldo total y ocultarlo.
Puede realizar Ingresos y Retiros.
Puede Abrir y Cerrar la caja.
Puede anular movimientos erróneos (con rastro de auditoría).
Secretaria / Asistente:

Puede registrar Ingresos (cobrar a pacientes).
Restricción: Probablemente NO debería ver el panel de "Ganancias mensuales" totales (información sensible), o solo ver lo recaudado en su turno.
Restricción: No puede realizar "Retiros" sin autorización o tiene un límite de monto.
Restricción: No puede eliminar/anular movimientos.
Resumen de Implementación
La sección de Caja no es solo una calculadora; es un

sistema de auditoría. Cada clic en "Ingresar" debe dejar un rastro de quién, cuándo, cuánto y cómo.
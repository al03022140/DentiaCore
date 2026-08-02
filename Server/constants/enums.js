/**
 * Enums canónicos del proyecto — FUENTE ÚNICA DE VERDAD.
 *
 * Regla (ver docs/normalizacion/01-estandares-tecnicos.md §3):
 *   - Los valores de enum se guardan en BD en INGLÉS y en UPPER_SNAKE_CASE.
 *   - Un concepto = un enum. Los modelos referencian estos objetos; NO redefinen valores.
 *   - El texto en español para el usuario vive en la capa de presentación (frontend),
 *     mapeado desde estas claves. Nunca al revés.
 *
 * IMPORTANTE (Fase 0): este archivo se crea como fuente única, pero TODAVÍA NO
 * está conectado a los modelos ni cambia comportamiento. El cableado a los
 * esquemas y la migración de datos ocurren en las Fases 1 y 4
 * (ver docs/normalizacion/03-estrategia-migracion.md).
 *
 * Cada enum incluye, como comentario, su mapeo desde los valores legacy para
 * facilitar la migración.
 */

'use strict';

const freeze = Object.freeze;

/**
 * Estado de un documento clínico (notas, planes, odontograma, periodontograma, examen).
 * Legacy: ['BORRADOR','OFICIAL','ARCHIVADO'] (es) y ['draft','completed','reviewed','archived'] (en).
 * Mapeo: BORRADOR/draft -> DRAFT · OFICIAL/completed/reviewed -> OFFICIAL · ARCHIVADO/archived -> ARCHIVED.
 */
const DOCUMENT_STATUS = freeze({
  DRAFT: 'DRAFT',
  OFFICIAL: 'OFFICIAL',
  ARCHIVED: 'ARCHIVED',
});

/**
 * Estado de una cita.
 * Legacy (appointment.js): ['Pendiente','Confirmada','EnCurso','Pasada','NoShow','Cancelada'].
 */
const APPOINTMENT_STATUS = freeze({
  PENDING: 'PENDING', // Pendiente
  CONFIRMED: 'CONFIRMED', // Confirmada
  IN_PROGRESS: 'IN_PROGRESS', // EnCurso
  COMPLETED: 'COMPLETED', // Pasada
  NO_SHOW: 'NO_SHOW', // NoShow
  CANCELLED: 'CANCELLED', // Cancelada
});

/**
 * Estado de un examen.
 * Legacy (exam.js): ['Pendiente','Realizado','En revisión','Entregado'].
 */
const EXAM_STATUS = freeze({
  PENDING: 'PENDING', // Pendiente
  COMPLETED: 'COMPLETED', // Realizado
  IN_REVIEW: 'IN_REVIEW', // En revisión
  DELIVERED: 'DELIVERED', // Entregado
});

/**
 * Estado de una receta.
 * Legacy (prescription.js): ['Pendiente','Entregado','Cancelado'].
 */
const PRESCRIPTION_STATUS = freeze({
  PENDING: 'PENDING', // Pendiente
  DELIVERED: 'DELIVERED', // Entregado
  CANCELLED: 'CANCELLED', // Cancelado
});

/**
 * Tipo de movimiento de caja. Legacy (cashMovement.js): ['INCOME','EXPENSE'] (ya canónico).
 */
const CASH_MOVEMENT_TYPE = freeze({
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
});

/**
 * Método de pago. Legacy (cashMovement.js / patientCharge.js): ['CASH','DIGITAL'] (ya canónico).
 */
const PAYMENT_METHOD = freeze({
  CASH: 'CASH',
  DIGITAL: 'DIGITAL',
});

/**
 * Estado de una sesión de caja. Legacy (boxSession.js): ['OPEN','CLOSED','CLOSING'] (ya canónico).
 */
const BOX_SESSION_STATUS = freeze({
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  CLOSING: 'CLOSING',
});

/**
 * Tipo de odontograma.
 * Legacy (odontograma.js): ['initial','clinic'] (minúsculas) -> se canoniza a UPPER_SNAKE.
 */
const ODONTOGRAM_TYPE = freeze({
  INITIAL: 'INITIAL', // initial
  CLINIC: 'CLINIC', // clinic
});

/**
 * Sexo del paciente.
 * Legacy (patient.js): ['Masculino','Femenino','Otro'].
 */
const SEX = freeze({
  MALE: 'MALE', // Masculino
  FEMALE: 'FEMALE', // Femenino
  OTHER: 'OTHER', // Otro
});

/**
 * Método de firma del doctor.
 * Legacy (patient.js doctorFirmaMethod): ['pin','pad', null].
 */
const SIGN_METHOD = freeze({
  PIN: 'PIN', // pin
  PAD: 'PAD', // pad
});

/**
 * Acciones de auditoría (auditLog.js).
 * Legacy: valores en español con guion bajo ('login_exitoso','firma_electronica', ...).
 * Estándar: 'recurso.accion' en inglés (ver 01 §10).
 */
const AUDIT_ACTION = freeze({
  LOGIN_SUCCESS: 'auth.login_success', // login_exitoso
  LOGIN_FAILED: 'auth.login_failed', // login_fallido
  LOGOUT: 'auth.logout',
  NOTE_SIGN: 'note.sign', // firma_electronica
  ADMIN_OPERATION: 'admin.operation', // operacion_superadmin
});

/**
 * Helper: devuelve el array de valores de un enum, listo para Mongoose `enum: [...]`.
 * Uso futuro (Fase 1): `status: { type: String, enum: values(DOCUMENT_STATUS) }`.
 */
const values = (enumObj) => Object.values(enumObj);

module.exports = {
  DOCUMENT_STATUS,
  APPOINTMENT_STATUS,
  EXAM_STATUS,
  PRESCRIPTION_STATUS,
  CASH_MOVEMENT_TYPE,
  PAYMENT_METHOD,
  BOX_SESSION_STATUS,
  ODONTOGRAM_TYPE,
  SEX,
  SIGN_METHOD,
  AUDIT_ACTION,
  values,
};

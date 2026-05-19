const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

/**
 * @openapi
 * components:
 *   schemas:
 *     OdontogramaEntry:
 *       type: object
 *       required:
 *         - tooth
 *         - damage
 *       properties:
 *         tooth:
 *           type: string
 *           description: Identificador de la pieza dental.
 *         damage:
 *           type: string
 *           description: Condición o daño de la pieza dental.
 *         surface:
 *           type: string
 *           description: Superficie afectada (opcional).
 *           default: '0'
 *         note:
 *           type: string
 *           description: Notas adicionales (opcional).
 *           default: ''
 */
const entrySchema = new Schema({
  tooth:   { type: String, required: true }, // TODO: Considerar validación regex/enum para piezas dentales
  damage:  { type: String, required: true },
  surface: { type: String, default: 'O' }, // 'O' por Oclusal como default común
  note:    { type: String, default: '' },
  // Fecha en que se registró/persistió esta entrada. El servidor la estampa con `new Date()`
  // al guardar — los valores enviados por el cliente se ignoran para evitar fechas falsificadas
  // o stale.
  fecha:   { type: Date, default: () => new Date() }
}, { _id: false }); // No necesitan su propio _id si son parte de 'datos' o 'current'

/**
 * @openapi
 * components:
 *   schemas:
 *     OdontogramaHistoryEntry:
 *       type: object
 *       required:
 *         - datos
 *         - imageUrl
 *       properties:
 *         _id:
 *           type: string
 *           description: ID único del snapshot del historial.
 *         datos:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OdontogramaEntry'
 *           description: Conjunto de entradas del odontograma para este snapshot.
 *         imageUrl:
 *           type: string
 *           description: URL de la imagen del odontograma para este snapshot.
 *         savedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha en que se guardó este snapshot.
 */
const historyEntrySchema = new Schema({
  datos:    { type: [entrySchema], required: true },
  // imageUrl es opcional: el inicial guarda PNG del canvas, el clínico no tiene imagen.
  imageUrl: { type: String, default: '' },
  savedAt:  { type: Date, default: () => new Date() },
  // Cita en la que se generó este snapshot (opcional, auditoría / línea de tiempo)
  appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', default: null, index: true },
  savedBy: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  deleteReason: { type: String, default: null }
}); // _id: true es el comportamiento por defecto y es necesario para :snapshotId

/**
 * @openapi
 * components:
 *   schemas:
 *     Odontograma:
 *       type: object
 *       required:
 *         - patientId
 *         - type
 *         - current
 *       properties:
 *         _id:
 *           type: string
 *           description: ID único del odontograma.
 *         patientId:
 *           type: string
 *           description: ID del paciente al que pertenece el odontograma.
 *         type:
 *           type: string
 *           enum: [initial, clinic]
 *           description: Tipo de odontograma (inicial o clínico/de seguimiento).
 *         current:
 *           type: object
 *           description: Estado actual del odontograma.
 *           required:
 *             - imageUrl
 *           properties:
 *             imageUrl:
 *               type: string
 *               description: URL de la imagen actual del odontograma.
 *             datos:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/OdontogramaEntry'
 *               default: []
 *               description: Conjunto de entradas actuales del odontograma.
 *             savedAt:
 *               type: string
 *               format: date-time
 *               description: Fecha en que se guardó el estado actual.
 *         history:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OdontogramaHistoryEntry'
 *           default: []
 *           description: Historial de snapshots del odontograma.
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Fecha de creación del documento.
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha de última actualización del documento.
 */
const odontogramaSchema = new Schema({
  patientId: { type: Types.ObjectId, ref: 'Patient', required: true, index: true },
  // Cita en la que se generó/modificó el odontograma (opcional, auditoría)
  appointmentId: { type: Types.ObjectId, ref: 'Appointment', default: null, index: true },
  type:      { type: String, enum: ['initial', 'clinic'], required: true }, // Coincide con TYPE_INITIAL y TYPE_CLINIC
  current: {
    // imageUrl es opcional: el inicial guarda PNG del canvas, el clínico no tiene imagen.
    imageUrl: { type: String, default: '' },
    datos:    { type: [entrySchema], default: [] }, // Unificado a 'datos'
    savedAt:  { type: Date, default: () => new Date() },
    // Cita en la que se actualizó por última vez (opcional)
    appointmentId: { type: Types.ObjectId, ref: 'Appointment', default: null },
    savedBy: { type: Types.ObjectId, ref: 'Usuario', default: null }
  },
  history: { type: [historyEntrySchema], default: [] },

  // ── Campos de auditoría y estado (roles.MD §4.7, §5) ────────────
  estado: {
    type: String,
    enum: ['BORRADOR', 'OFICIAL', 'ARCHIVADO'],
    default: 'OFICIAL'
  },
  creadoPor: { type: Types.ObjectId, ref: 'Usuario', default: null },
  modificadoPor: { type: Types.ObjectId, ref: 'Usuario', default: null },
  modificadoEn: { type: Date, default: null },
  firmadoPor: { type: Types.ObjectId, ref: 'Usuario', default: null },
  firmadoEn: { type: Date, default: null },
  contentHash: { type: String, default: null },
  firmaDesactualizada: { type: Boolean, default: false },
  integrityHash: { type: String, default: null },
  autorizadoPor: { type: Types.ObjectId, ref: 'Usuario', default: null },
  // Soft-delete (NOM-004 Art. 5.4)
  deletedAt: { type: Date, default: null },
  deletedBy: { type: Types.ObjectId, ref: 'Usuario', default: null },
  deleteReason: { type: String, default: null },
  // Captura extemporánea (roles.MD §9.5)
  capturaExtemporanea: {
    esExtemporanea: { type: Boolean, default: false },
    motivo: { type: String, default: null },
    fechaNota: { type: Date, default: null },
    fechaCaptura: { type: Date, default: null }
  }
}, {
  timestamps: true // Añade createdAt y updatedAt automáticamente
});

// Índice único por paciente y tipo, sólo para documentos NO archivados (soft-deleted).
// Permite archivar un odontograma y crear uno nuevo del mismo tipo sin colisión.
odontogramaSchema.index(
  { patientId: 1, type: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);

// Índices para búsquedas/ordenamientos comunes
odontogramaSchema.index({ 'current.savedAt': -1 });
// No es necesario { 'history.savedAt': -1 } directamente si accedes a través de historyEntrySchema._id y luego ordenas en la app,
// o si la consulta principal se basa en patientId y type.
// El índice en patientId (arriba) ya ayuda.

// Índice para buscar snapshots específicos dentro del historial de un paciente
odontogramaSchema.index({ patientId: 1, 'history._id': 1 });

module.exports = mongoose.model('Odontograma', odontogramaSchema); 
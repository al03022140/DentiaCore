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
  note:    { type: String, default: '' }
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
  imageUrl: { type: String, required: true }, // Cada snapshot de historial debe tener su imagen
  savedAt:  { type: Date, default: () => new Date() }
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
  type:      { type: String, enum: ['initial', 'clinic'], required: true }, // Coincide con TYPE_INITIAL y TYPE_CLINIC
  current: {
    imageUrl: { type: String, required: true }, // La imagen actual es requerida
    datos:    { type: [entrySchema], default: [] }, // Unificado a 'datos'
    savedAt:  { type: Date, default: () => new Date() }
  },
  history: { type: [historyEntrySchema], default: [] }
}, {
  timestamps: true // Añade createdAt y updatedAt automáticamente
});

// Índice único por paciente y tipo para asegurar que solo haya un odontograma 'initial' y uno 'clinic' por paciente
odontogramaSchema.index({ patientId: 1, type: 1 }, { unique: true });

// Índices para búsquedas/ordenamientos comunes
odontogramaSchema.index({ 'current.savedAt': -1 });
// No es necesario { 'history.savedAt': -1 } directamente si accedes a través de historyEntrySchema._id y luego ordenas en la app,
// o si la consulta principal se basa en patientId y type.
// El índice en patientId (arriba) ya ayuda.

// Índice para buscar snapshots específicos dentro del historial de un paciente
odontogramaSchema.index({ patientId: 1, 'history._id': 1 });

module.exports = mongoose.model('Odontograma', odontogramaSchema); 
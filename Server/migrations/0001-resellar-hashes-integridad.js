/**
 * 0001 — Re-sellado de hashes de integridad y cadena de auditoría.
 *
 * CONTEXTO: hasta el fix de `utils/integrity.js` (auditoría backend, hallazgos
 * C1/C2/A-4), la canonicalización ordenaba llaves con `Object.keys()` ANTES de
 * convertir los tipos BSON, reduciendo los `Map` (mediciones del
 * periodontograma) y los `ObjectId` (paciente/doctor) a `{}`. Como consecuencia:
 *   - los `contentHash`/`integrityHash` guardados de TODOS los registros
 *     clínicos firmados se calcularon sobre datos incompletos, y
 *   - las entradas del audit log no estaban encadenadas (sin `seq`/`prevHash`)
 *     y su HMAC se calculó con el formato viejo (6 campos).
 *
 * Tras el fix, recalcular da un valor distinto, así que `audit/verify` marcaría
 * como "alterados" registros que nadie tocó. Esta migración re-sella con la
 * función corregida.
 *
 * ¿Es seguro re-sellar registros ya firmados? Sí: la protección anterior era
 * inexistente (el hash era ciego a las mediciones y al paciente; el HMAC del
 * log no encadenaba ni cubría el diff). No hay garantía criptográfica previa
 * que romper — esta migración ESTABLECE la línea base correcta. A partir de
 * aquí, cualquier alteración sí es detectable.
 *
 * Idempotente: recomputa los mismos valores en cada corrida.
 */
const mongoose = require('mongoose');
const { computeIntegrityHash, computeEntryHash } = require('../utils/integrity');

// Registrar los modelos que la migración necesita (require los auto-registra).
require('../models/patient');
require('../models/exam');
require('../models/prescription');
require('../models/treatment');
require('../models/periodontogram');
require('../models/odontograma');
require('../models/appointment');
require('../models/auditLog');

// resourceType (clave de SIGNABLE_FIELDS) → nombre de modelo Mongoose.
const RESELLADO_MODELOS = [
  { resourceType: 'patient',         model: 'Patient' },
  { resourceType: 'examen',          model: 'Examen' },
  { resourceType: 'receta',          model: 'Receta' },
  { resourceType: 'tratamiento',     model: 'Tratamiento' },
  { resourceType: 'periodontograma', model: 'Periodontogram' },
  { resourceType: 'odontograma',     model: 'Odontograma' },
  { resourceType: 'cita',            model: 'Appointment' },
];

module.exports = {
  id: '0001-resellar-hashes-integridad',

  async up() {
    // 1) Re-sellar hashes de integridad de los registros clínicos.
    //    Leemos con Mongoose (computeIntegrityHash usa doc.toObject()) y
    //    actualizamos SOLO el campo de hash con la API nativa para no disparar
    //    hooks pre('save') ni validaciones sobre datos legacy.
    for (const { resourceType, model } of RESELLADO_MODELOS) {
      let Model;
      try {
        Model = mongoose.model(model);
      } catch {
        continue; // modelo no registrado en esta instalación
      }

      const cursor = Model.find({
        $or: [{ integrityHash: { $ne: null } }, { contentHash: { $ne: null } }],
      }).cursor();

      let actualizados = 0;
      for await (const doc of cursor) {
        const nuevoHash = computeIntegrityHash(doc, resourceType);
        const set = {};
        if (doc.integrityHash != null) set.integrityHash = nuevoHash;
        if (doc.contentHash != null) set.contentHash = nuevoHash;
        if (Object.keys(set).length > 0) {
          await Model.collection.updateOne({ _id: doc._id }, { $set: set });
          actualizados++;
        }
      }
      console.log(`[0001] ${model}: ${actualizados} hash(es) re-sellados`);
    }

    // 2) Re-sellar la cadena del audit log: asignar seq (1..N) y prevHash en
    //    orden cronológico estable (timestamp, luego _id como desempate) y
    //    recomputar entryHash con el formato nuevo. Esto deja una cadena
    //    verificable por AuditLog.verifyChain.
    const AuditLog = mongoose.model('AuditLog');
    const entries = AuditLog.find({}).sort({ timestamp: 1, _id: 1 }).cursor();

    let seq = 0;
    let prevHash = null;
    for await (const e of entries) {
      seq++;
      const entryData = { ...e.toObject(), seq, prevHash };
      const entryHash = computeEntryHash(entryData);
      await AuditLog.collection.updateOne(
        { _id: e._id },
        { $set: { seq, prevHash, entryHash } }
      );
      prevHash = entryHash;
    }
    console.log(`[0001] AuditLog: ${seq} entradas re-selladas y encadenadas`);
  },
};

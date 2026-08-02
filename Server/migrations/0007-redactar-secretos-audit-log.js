/**
 * 0007 — Redactar secretos históricos del audit log y re-sellar la cadena.
 *
 * CONTEXTO (hallazgo CRÍTICO, auditoría seguridad 2026-07-31): hasta el fix de
 * utils/redact.js + AuditLog.registrar, un reseteo de contraseña por admin
 * (PUT /api/users/:id) persistía la contraseña NUEVA en texto plano en
 * `detalles.despues.contraseña`, y el snapshot "antes" arrastraba
 * bcrypt/pinHash/refreshTokenHash. Todo quedó sellado dentro del entryHash
 * HMAC (inalterable por diseño NOM-024).
 *
 * Esta migración: (1) redacta los valores sensibles de `detalles` en las
 * entradas ya guardadas (conservando las llaves — la traza de QUÉ se editó se
 * mantiene), y (2) re-sella la cadena completa con el mismo patrón que 0001,
 * porque tocar `detalles` invalida los sellos existentes.
 *
 * Nota de cumplimiento: el "inalterable" de NOM-024 protege la evidencia
 * clínica contra manipulación — no obliga a conservar un secreto que nunca
 * debió persistirse (LFPDPPP: minimización). El re-sellado deja constancia:
 * esta migración queda registrada en `migrations` con fecha.
 *
 * Idempotente: una segunda corrida no encuentra nada que redactar y el
 * re-sellado recomputa exactamente los mismos valores (orden estable
 * timestamp+_id, HMAC determinista).
 */
const mongoose = require('mongoose');
const { computeEntryHash } = require('../utils/integrity');
const { redactSecrets } = require('../utils/redact');

require('../models/auditLog');

module.exports = {
  id: '0007-redactar-secretos-audit-log',

  async up() {
    const AuditLog = mongoose.model('AuditLog');

    // 1) Redactar secretos en `detalles` (updates nativos: sin hooks/validación).
    const cursor = AuditLog.find({ detalles: { $exists: true, $ne: null } })
      .lean()
      .cursor();

    let redactadas = 0;
    for await (const e of cursor) {
      const limpio = redactSecrets(e.detalles);
      if (JSON.stringify(limpio) !== JSON.stringify(e.detalles)) {
        await AuditLog.collection.updateOne({ _id: e._id }, { $set: { detalles: limpio } });
        redactadas++;
      }
    }
    console.log(`[0007] AuditLog: ${redactadas} entrada(s) con secretos redactados`);

    // 2) Re-sellar la cadena completa (mismo patrón que 0001: limpiar seq
    //    primero para no chocar con el índice único-sparse al renumerar).
    await AuditLog.collection.updateMany({}, { $unset: { seq: '' } });

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
    console.log(`[0007] AuditLog: ${seq} entradas re-selladas y encadenadas`);
  },
};

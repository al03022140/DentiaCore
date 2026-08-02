/**
 * 0008 — Key ring del audit log (R-1): backfill de `keyId`.
 *
 * CONTEXTO: hasta ahora toda la historia dependía de una única
 * AUDIT_HMAC_SECRET — rotarla invalidaba la verificación completa y obligaba a
 * re-sellar la cadena (como hicieron 0001 y 0007). Con el key ring
 * (utils/integrity.js: getAuditKeyRing), cada entrada guarda la huella de la
 * clave que la selló y la verificación elige la clave por esa huella; rotar es
 * editar Server/.env (AUDIT_HMAC_SECRET nueva + la vieja a
 * AUDIT_HMAC_RETIRED_SECRETS) sin tocar la BD.
 *
 * Esta migración marca las entradas existentes (keyId ausente/null) con la
 * huella de la clave ACTIVA — correcto porque todo lo existente está sellado
 * con ella: las entradas nuevas la usan siempre, y en una instalación que
 * estrena migraciones 0001/0007 acaban de re-sellar con ella en esta misma
 * corrida.
 *
 * keyId está FUERA del payload del HMAC (metadato de enrutamiento), así que
 * este backfill NO altera ningún entryHash — no hay re-sellado. Idempotente:
 * la segunda corrida no matchea ningún documento.
 */
const mongoose = require('mongoose');
const { getAuditKeyRing } = require('../utils/integrity');

require('../models/auditLog');

module.exports = {
  id: '0008-keyid-audit-log',

  async up() {
    const AuditLog = mongoose.model('AuditLog');
    const { activeKeyId } = getAuditKeyRing();

    // { keyId: null } matchea también documentos sin el campo.
    const res = await AuditLog.collection.updateMany(
      { keyId: null, entryHash: { $ne: null } },
      { $set: { keyId: activeKeyId } }
    );
    console.log(`[0008] AuditLog: ${res.modifiedCount} entrada(s) marcadas con keyId=${activeKeyId} (0 sellos modificados)`);
  },
};

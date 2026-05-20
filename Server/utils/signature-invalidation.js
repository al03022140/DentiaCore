/**
 * Hook compartido de invalidación de firma.
 *
 * Cuando un documento firmado se modifica en alguno de sus campos firmables
 * (los listados en SIGNABLE_FIELDS para su resourceType), se marca
 * `firmaDesactualizada = true` automáticamente al guardar.
 *
 * Sin esto, la UI mostraría "firma válida" sobre contenido alterado después
 * de la firma → contradice NOM-024-SSA3-2012 (integridad) y NOM-004 Art. 5.10.
 *
 * Sólo aplica a docs TOP-LEVEL mutables (Odontograma, Periodontogram, Examen).
 * Los subdocs de Patient (notas_evolucion, planes_tratamiento) tienen
 * inmutabilidad fuerte en patient.js — el contenido firmado no puede cambiar
 * en absoluto, así que `firmaDesactualizada` no aplica ahí.
 */
const { getSignableFields } = require('./integrity');

function attachSignatureInvalidationHook(schema, resourceType) {
  schema.pre('save', function (next) {
    // Documento nuevo: nada que invalidar.
    if (this.isNew) return next();
    // Documento no firmado: no hay firma que invalidar.
    if (!this.firmadoPor) return next();
    // Ya marcado como desactualizado: no re-procesar.
    if (this.firmaDesactualizada) return next();

    const fields = getSignableFields(resourceType);
    const touched = fields.some((field) => this.isModified(field));

    if (touched) {
      this.firmaDesactualizada = true;
    }
    next();
  });
}

module.exports = { attachSignatureInvalidationHook };

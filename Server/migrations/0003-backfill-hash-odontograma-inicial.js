/**
 * 0003 — Back-fill de contentHash/integrityHash en odontogramas INICIALES
 * OFICIAL existentes.
 *
 * CONTEXTO: el odontograma inicial nacía OFICIAL e inmutable pero sin hash de
 * integridad (contentHash/integrityHash null), así que audit/verify daba
 * siempre ok:false para registros previos al fix. Esta migración recalcula y
 * persiste el hash sobre el contenido actual (que es inmutable: el inicial es
 * de captura única). Es seguro: no había integridad previa que romper — esto
 * ESTABLECE la línea base correcta.
 *
 * Idempotente: solo toca los que aún no tienen contentHash; recomputar daría el
 * mismo valor.
 */
const mongoose = require('mongoose');
const { computeContentHash } = require('../utils/signing');

require('../models/odontograma');

module.exports = {
  id: '0003-backfill-hash-odontograma-inicial',

  async up() {
    const Odontograma = mongoose.model('Odontograma');

    // type 'initial' (TYPE_INITIAL), OFICIAL, no firmado, sin contentHash aún.
    const cursor = Odontograma.find({
      type: 'initial',
      estado: 'OFICIAL',
      $and: [
        { $or: [{ firmadoEn: null }, { firmadoEn: { $exists: false } }] },
        { $or: [{ contentHash: null }, { contentHash: { $exists: false } }] },
      ],
    }).cursor();

    let sellados = 0;
    for await (const doc of cursor) {
      const hash = computeContentHash(doc, 'odontograma');
      await Odontograma.collection.updateOne(
        { _id: doc._id },
        { $set: { contentHash: hash, integrityHash: hash } }
      );
      sellados++;
    }
    console.log(`[0003] odontogramas iniciales OFICIAL sellados: ${sellados}`);
  },
};

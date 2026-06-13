/**
 * 0002 — Limpieza de periodontogramas BORRADOR vacíos (legacy).
 *
 * CONTEXTO: hasta el fix de la auditoría backend, un periodontograma BORRADOR
 * vacío se creaba por dos vías (GET de lectura que auto-creaba, y alta de
 * paciente). Esos docs aparecían como pendientes en el Centro de Firmas sin que
 * nadie los hubiera tocado. Ambas fuentes ya se eliminaron y listDrafts ahora
 * los oculta, pero quedan docs vacíos persistidos en BD de instalaciones
 * previas. Esta migración los BORRA — solo los que son demostrablemente vacíos:
 *   - estadoRegistro = 'BORRADOR'
 *   - current.teeth sin llaves (ninguna medición)
 *   - firmadoEn = null (nunca firmado)
 *   - sin NINGUNA entrada en periodontogram_history (nunca se guardó de verdad)
 * Un periodontograma con historial o con mediciones NO se toca jamás.
 *
 * Idempotente: re-correr no encuentra nada nuevo que borrar.
 */
const mongoose = require('mongoose');

require('../models/periodontogram');
require('../models/periodontogramHistory');

module.exports = {
  id: '0002-limpiar-periodontogramas-vacios',

  async up(db) {
    const periodontogramas = db.collection('periodontograms');
    const history = db.collection('periodontogram_history');

    const candidatos = await periodontogramas.find({
      estadoRegistro: 'BORRADOR',
      $or: [{ firmadoEn: null }, { firmadoEn: { $exists: false } }],
    }).toArray();

    let borrados = 0;
    let conservados = 0;

    for (const doc of candidatos) {
      // current.teeth puede venir como objeto plano (BSON) — contar llaves.
      const teeth = doc.current?.teeth;
      const tieneMediciones = teeth && typeof teeth === 'object' && Object.keys(teeth).length > 0;
      if (tieneMediciones) { conservados++; continue; }

      // ¿Tuvo alguna vez un guardado real? (history es append-only).
      const tieneHistory = await history.countDocuments({ patient: doc.patient }, { limit: 1 });
      if (tieneHistory > 0) { conservados++; continue; }

      await periodontogramas.deleteOne({ _id: doc._id });
      borrados++;
    }

    console.log(`[0002] periodontogramas BORRADOR vacíos borrados: ${borrados}; conservados (con datos/historial): ${conservados}`);
  },
};

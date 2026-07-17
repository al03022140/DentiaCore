/**
 * 0006 — Recalcular estadísticas de las versiones del historial de
 * periodontograma (legacy).
 *
 * CONTEXTO: hasta esta migración, savePeriodontogramData tomaba el snapshot de
 * `current.statistics` para el History ANTES del save — y el recálculo vivía
 * en el pre('save') del modelo. Resultado: cada entrada del historial quedó
 * con los teeth de la versión N y las estadísticas de la versión N-1 (la
 * primera versión, con estadísticas en ceros). El controller ya calcula las
 * stats de los teeth que guarda; esta migración corrige lo persistido.
 *
 * Se recalcula `statistics` desde los `teeth` de CADA entrada con la MISMA
 * función que usa el camino de escritura (Periodontogram.computeStatistics —
 * semántica canónica del cliente, ver dedup de validadores). Escritura vía
 * driver directo: los hooks de inmutabilidad del schema bloquean updates por
 * la API de Mongoose a propósito; esto es una corrección de datos erróneos de
 * origen (mismo precedente que 0001 re-sellado y 0005 entidades). Las
 * entradas del historial no llevan contentHash — no se invalida ninguna firma.
 *
 * Idempotente: el recálculo es determinístico; re-correr no encuentra diffs.
 */

const Periodontogram = require('../models/periodontogram');

const STAT_KEYS = [
  'placaTotal', 'sangradoTotal', 'supuracionTotal', 'totalTeeth',
  'presentTeeth', 'bleedingPercentage', 'plaquePercentage',
  'averageProbingDepth', 'averageGingivalMargin'
];

module.exports = {
  id: '0006-recalcular-estadisticas-historial-periodontograma',

  async up(db) {
    const history = db.collection('periodontogram_history');
    const cursor = history.find({});

    let revisadas = 0;
    let corregidas = 0;

    for await (const doc of cursor) {
      revisadas++;
      const recomputed = Periodontogram.computeStatistics(doc.teeth || {});
      const stored = doc.statistics || {};
      const differs = STAT_KEYS.some((k) => (stored[k] ?? 0) !== (recomputed[k] ?? 0));
      if (!differs) continue;

      await history.updateOne({ _id: doc._id }, { $set: { statistics: recomputed } });
      corregidas++;
    }

    console.log(`[0006] versiones de historial revisadas: ${revisadas}; con estadísticas corregidas: ${corregidas}`);
  },
};

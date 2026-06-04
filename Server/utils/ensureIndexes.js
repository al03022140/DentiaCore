const logger = require('./logger');

/**
 * Construye los índices declarados en el schema de un modelo, UNO POR UNO.
 *
 * ¿Por qué no `Model.syncIndexes()` / `createIndexes()` a secas?
 * En instalaciones de producción `autoIndex` está apagado
 * (`models/patient.js`: `autoIndex: process.env.NODE_ENV !== 'production'`),
 * así que los índices declarados (incl. los ÚNICOS de `paciente_id` y
 * `documento.numero`) NUNCA se construyen solos. En una BD legacy que arrancó
 * en producción desde el día 1, esos índices no existen y la colección pudo
 * acumular DUPLICADOS. Si construyéramos el índice único de golpe, Mongo
 * lanzaría E11000 y —si no se atrapa— tumbaría el arranque del servidor.
 *
 * Esta función es legacy-safe: intenta crear cada índice por separado, de modo
 * que un índice único que choque con datos duplicados preexistentes se salta
 * (con un aviso claro y accionable) SIN impedir que el resto se construya ni
 * tumbar el server. El admin corre `scripts/findPatientDuplicates.js`, limpia
 * los duplicados y reinicia para que el índice único quede enforzado.
 *
 * Es idempotente: crear un índice que ya existe (con las mismas opciones) es
 * un no-op, así que puede correr en cada arranque sin costo más allá del
 * primero.
 *
 * @param {import('mongoose').Model} Model
 * @returns {Promise<{model:string, created:number, skippedDuplicate:Array, failed:Array}>}
 */
async function ensureModelIndexes(Model) {
  const modelName = Model.modelName;
  const result = { model: modelName, created: 0, skippedDuplicate: [], failed: [] };

  // schema.indexes() incluye tanto los índices a nivel de campo (unique:true /
  // index:true) como los declarados con schema.index({...}).
  const specs = Model.schema.indexes();
  const coll = Model.collection;

  for (const [keys, options = {}] of specs) {
    // Clonamos las opciones y quitamos flags deprecados que algunos drivers
    // rechazan. Conservamos unique/sparse/partialFilterExpression/name.
    const { background: _bg, ...opts } = options;
    try {
      await coll.createIndex(keys, opts);
      result.created++;
    } catch (err) {
      const code = err && err.code;
      // 11000: clave duplicada al construir un índice único sobre datos legacy.
      // 85/86: ya existe un índice con el mismo nombre pero distintas opciones.
      const isDuplicate = code === 11000 || /duplicate key/i.test(err?.message || '');
      const isConflict = code === 85 || code === 86 || /same name/i.test(err?.message || '');
      if (isDuplicate) {
        result.skippedDuplicate.push({ keys, keyValue: err.keyValue || null, message: err.message });
      } else if (isConflict) {
        // No es fatal: el índice ya existe (quizá con opciones distintas).
        result.skippedDuplicate.push({ keys, conflict: true, message: err.message });
      } else {
        result.failed.push({ keys, message: err?.message || String(err) });
      }
    }
  }

  return result;
}

/**
 * Asegura los índices de los modelos críticos para la integridad de datos.
 * Pensado para llamarse una vez tras `connectDB()` en el arranque.
 * Nunca lanza: cualquier problema se loggea y el server sigue arrancando.
 *
 * @param {import('mongoose').Model[]} models
 */
async function ensureCriticalIndexes(models) {
  const summaries = [];
  for (const Model of models) {
    try {
      const r = await ensureModelIndexes(Model);
      summaries.push(r);

      if (r.skippedDuplicate.length) {
        for (const s of r.skippedDuplicate) {
          if (s.conflict) continue;
          logger.warn(
            '⚠️  [%s] No se pudo crear un índice ÚNICO por datos duplicados legacy: %j%s',
            r.model,
            s.keys,
            s.keyValue ? ` (valor en conflicto: ${JSON.stringify(s.keyValue)})` : ''
          );
        }
        logger.warn(
          '⚠️  [%s] La unicidad NO está garantizada en BD hasta limpiar duplicados. ' +
          'Corre: node scripts/findPatientDuplicates.js  (luego reinicia el servidor).',
          r.model
        );
      }
      if (r.failed.length) {
        logger.error('❌ [%s] Índices que fallaron al construir: %j', r.model, r.failed);
      }
      logger.info('🔑 [%s] Índices verificados (creados/idempotentes: %d, saltados: %d, fallidos: %d)',
        r.model, r.created, r.skippedDuplicate.length, r.failed.length);
    } catch (err) {
      // Defensa final: jamás dejar que esto tumbe el arranque.
      logger.error('❌ ensureCriticalIndexes falló para %s: %s', Model?.modelName || '?', err?.message || err);
    }
  }
  return summaries;
}

module.exports = { ensureModelIndexes, ensureCriticalIndexes };

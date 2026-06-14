/**
 * 0004 — Backfill de versiones del ODONTOGRAMA CLÍNICO (admisión legacy).
 *
 * CONTEXTO: el odontograma clínico guardaba sus snapshots en un array embebido
 * `history[]` (uno por guardado, fechado con `savedAt`). Ahora las versiones
 * viven en la colección inmutable `odontograma_history` (espejo de
 * `periodontogram_history`), igual que el periodontograma. Esta migración
 * CONVIERTE los snapshots legacy en versiones, AGRUPANDO todos los del mismo día
 * en UNA sola versión acumulada (unión/dedup de hallazgos).
 *
 * Es ADITIVA: inserta filas en `odontograma_history` y NO reescribe el array
 * `history[]` embebido (se conserva como respaldo legacy). Solo toca el doc
 * principal para fijar `current.versionName`, y NUNCA en documentos firmados
 * (guard `firmadoEn: null`) para no invalidar la firma NOM-024.
 *
 * Idempotente: el `versionName` por día es DETERMINÍSTICO (deriva de _id+día),
 * así que re-correr genera los mismos nombres y los salta por el índice único
 * (patient, versionName). Forward-only (sin down(): rollback = restaurar backup).
 *
 * Alcance: solo odontogramas `type:'clinic'` no archivados (`deletedAt: null`).
 */
const crypto = require('crypto');

// Misma clave de identidad de entrada que el dedup del controller
// (isIdenticalToCurrent) y la validación: espacio|diente|daño|superficie|nota.
const entryKey = (e) => `${e.space || ''}|${e.tooth || ''}|${e.damage}|${e.surface}|${e.note || ''}`;

// versionName determinístico con el MISMO formato que generateDefaultVersionName
// del controller (ISO compacto + sufijo de 6 hex), pero derivado de la fecha real
// del día y de (_id + día) para que sea estable entre reruns (idempotencia).
function buildLegacyVersionName(odontogramaId, dayKey, latestDate) {
  const iso = latestDate.toISOString().replace(/[:.-]/g, ''); // ej. 20260613T143012345Z
  const suffix = crypto.createHash('sha1').update(`${odontogramaId}|${dayKey}`).digest('hex').slice(0, 6);
  return `${iso}_${suffix}`;
}

module.exports = {
  id: '0004-backfill-odontograma-clinico-versions',

  async up(db) {
    const odontogramas = db.collection('odontogramas');
    const histColl = db.collection('odontograma_history');

    // Asegurar el índice único antes de insertar (la colección es nueva; esto
    // también garantiza idempotencia ante reruns).
    await histColl.createIndex({ patient: 1, versionName: 1 }, { unique: true });

    const cursor = odontogramas.find({ type: 'clinic', deletedAt: null });

    let docsProcesados = 0;
    let versionesInsertadas = 0;
    let versionesSaltadas = 0;
    let currentActualizados = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      docsProcesados++;

      // Snapshots legacy activos (respetar soft-deletes del embebido).
      let snapshots = (doc.history || []).filter(h => !h.deletedAt);

      // Si no hay history embebido pero `current` tiene datos, sintetizar un
      // único snapshot desde `current` para no perder ese estado.
      if (snapshots.length === 0 && Array.isArray(doc.current?.datos) && doc.current.datos.length > 0) {
        snapshots = [{
          datos: doc.current.datos,
          savedAt: doc.current.savedAt || doc.updatedAt || doc.createdAt,
          appointmentId: doc.current.appointmentId || null
        }];
      }
      if (snapshots.length === 0) continue;

      // Agrupar por DÍA calendario (UTC) de savedAt, uniendo/deduplicando hallazgos.
      const byDay = new Map(); // dayKey -> { latest: Date, datos: Map<key,entry>, appointmentId }
      for (const snap of snapshots) {
        const rawTs = snap.savedAt || (Array.isArray(snap.datos) && snap.datos[0] && snap.datos[0].fecha) || doc.updatedAt || doc.createdAt;
        const ts = new Date(rawTs);
        if (Number.isNaN(ts.getTime())) continue; // fecha irrecuperable → saltar snapshot
        const dayKey = ts.toISOString().slice(0, 10); // 'YYYY-MM-DD'

        let bucket = byDay.get(dayKey);
        if (!bucket) {
          bucket = { latest: ts, datos: new Map(), appointmentId: snap.appointmentId || null };
          byDay.set(dayKey, bucket);
        }
        if (ts > bucket.latest) {
          bucket.latest = ts;
          if (snap.appointmentId) bucket.appointmentId = snap.appointmentId; // cita del último del día
        }
        for (const e of (snap.datos || [])) {
          const k = entryKey(e);
          if (!bucket.datos.has(k)) bucket.datos.set(k, e); // unión/dedup
        }
      }

      // Insertar una versión por día (orden ascendente por fecha).
      const dayKeys = [...byDay.keys()].sort();
      let latestVersionName = null;
      for (const dayKey of dayKeys) {
        const bucket = byDay.get(dayKey);
        const versionName = buildLegacyVersionName(doc._id, dayKey, bucket.latest);
        latestVersionName = versionName; // el último iterado es el día más reciente

        const exists = await histColl.findOne({ patient: doc.patientId, versionName });
        if (exists) { versionesSaltadas++; continue; }

        try {
          await histColl.insertOne({
            patient: doc.patientId,
            odontograma: doc._id,
            appointmentId: bucket.appointmentId || null,
            versionName,
            datos: [...bucket.datos.values()],
            createdBy: null, // legacy: autor desconocido
            // Timestamps FORZADOS a la fecha real del snapshot (no la de
            // migración) para que el orden por createdAt y el label en la UI
            // muestren la fecha correcta.
            createdAt: bucket.latest,
            updatedAt: bucket.latest
          });
          versionesInsertadas++;
        } catch (err) {
          if (err && err.code === 11000) { versionesSaltadas++; continue; } // rerun/carrera
          throw err;
        }
      }

      // Fijar current.versionName al día más reciente — SOLO en docs no firmados.
      // updateOne crudo (sin hooks de Mongoose) → no dispara la invalidación de
      // firma; el guard firmadoEn:null evita tocar documentos firmados.
      if (latestVersionName && !doc.firmadoEn) {
        const r = await odontogramas.updateOne(
          { _id: doc._id, firmadoEn: null },
          { $set: { 'current.versionName': latestVersionName } }
        );
        if (r.modifiedCount > 0) currentActualizados++;
      }
    }

    console.log(`[0004] odontogramas clínicos procesados: ${docsProcesados}; versiones insertadas: ${versionesInsertadas}; saltadas (ya existían): ${versionesSaltadas}; current.versionName fijados: ${currentActualizados}`);
  },
};

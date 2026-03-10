/*
 Script: fixArchivedVersionNames.js
 Objetivo: Renombrar entradas en PeriodontogramHistory con nombres 'Archivado_YYYY-MM-DD' duplicados
          a formato único 'Archivado_YYYY-MM-DD_HH-mm-ss' por paciente, preservando orden cronológico.
 Uso: node scripts/fixArchivedVersionNames.js
 Notas: Ejecuta con el mismo entorno del server (MONGODB_URI, etc.). Hace respaldo por consola.
*/

/* eslint-disable no-console */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const PeriodontogramHistory = require('../models/periodontogramHistory');
const Periodontogram = require('../models/periodontogram');

function pad(n) { return String(n).padStart(2, '0'); }

function makeTimestampFromDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/DentiaCore';
  console.log(`Conectando a MongoDB: ${uri}`);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  try {
    // Buscar todas las entradas Archivado_* (con o sin hora) y agrupar por paciente + versionName
    const all = await PeriodontogramHistory.find({ versionName: /^Archivado_\d{4}-\d{2}-\d{2}(_\d{2}-\d{2}-\d{2})?$/ })
      .select('_id patient versionName createdAt')
      .sort({ patient: 1, createdAt: 1 })
      .lean();

    console.log(`Encontradas ${all.length} entradas Archivado_*`);

    // Agrupar por paciente y by baseName (solo fecha), para detectar duplicados por día
    const groups = new Map();
    for (const doc of all) {
      const m = doc.versionName.match(/^Archivado_(\d{4}-\d{2}-\d{2})(?:_\d{2}-\d{2}-\d{2})?$/);
      if (!m) continue;
      const baseDate = m[1];
      const key = `${doc.patient}_${baseDate}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(doc);
    }

    let updates = 0;
    for (const [key, docs] of groups.entries()) {
      if (docs.length <= 1) continue; // nada que hacer

      // Dejar la primera con timestamp si ya lo tiene; si no, renombrarla con createdAt
      // Para todas, asegurar nombre único con createdAt incremental
      for (const d of docs) {
        const hasTime = /_\d{2}-\d{2}-\d{2}$/.test(d.versionName);
        if (hasTime) continue; // ya único
        const newName = `Archivado_${makeTimestampFromDate(d.createdAt)}`;
        await PeriodontogramHistory.updateOne({ _id: d._id }, { $set: { versionName: newName } });
        updates += 1;
        console.log(`Renombrado ${d._id} => ${newName}`);
      }
    }

    console.log(`Actualizaciones realizadas: ${updates}`);
  } catch (err) {
    console.error('Error en la migración:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Desconectado de MongoDB');
  }
}

run();

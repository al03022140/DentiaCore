#!/usr/bin/env node
/**
 * Detecta pacientes con `documento.numero` o `paciente_id` DUPLICADO.
 *
 * ¿Para qué? En BDs legacy creadas bajo NODE_ENV=production, `autoIndex` está
 * apagado y los índices únicos nunca se construyeron, así que la colección pudo
 * acumular duplicados. Antes de poder enforcar el índice único (ver
 * utils/ensureIndexes.js) hay que limpiar estos duplicados a mano —este script
 * los lista para que el admin decida cuál conservar.
 *
 * Uso:
 *   node scripts/findPatientDuplicates.js
 *
 * Solo LEE: no modifica nada. La resolución (fusionar/dar de baja) es manual
 * porque toca semántica clínica (expedientes NOM-004).
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Patient = require('../models/patient');

async function findDuplicates(field) {
  // Agrupamos por el valor del campo (ignorando null/ausente) y nos quedamos
  // con los grupos de más de uno. Reportamos también los soft-deleted para que
  // el admin entienda por qué un número "ocupado" puede no verse en la UI.
  return Patient.aggregate([
    { $match: { [field]: { $ne: null } } },
    {
      $group: {
        _id: `$${field}`,
        count: { $sum: 1 },
        pacientes: {
          $push: {
            _id: '$_id',
            paciente_id: '$paciente_id',
            nombre: { $concat: ['$primer_nombre', ' ', '$apellido_paterno'] },
            deletedAt: '$deletedAt',
          },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]);
}

(async () => {
  try {
    await connectDB();

    let totalGroups = 0;
    for (const field of ['documento.numero', 'paciente_id']) {
      const dupes = await findDuplicates(field);
      console.log(`\n=== Duplicados por "${field}": ${dupes.length} grupo(s) ===`);
      for (const g of dupes) {
        totalGroups++;
        console.log(`\n  ${field} = ${JSON.stringify(g._id)}  →  ${g.count} pacientes`);
        for (const p of g.pacientes) {
          const baja = p.deletedAt ? '  [DADO DE BAJA]' : '';
          console.log(`    - _id=${p._id}  paciente_id=${p.paciente_id}  ${p.nombre || ''}${baja}`);
        }
      }
      if (!dupes.length) console.log('  ✅ Sin duplicados.');
    }

    if (totalGroups === 0) {
      console.log('\n✅ No hay duplicados: los índices únicos pueden construirse sin problema.');
    } else {
      console.log(
        `\n⚠️  ${totalGroups} grupo(s) de duplicados. Resuélvelos (fusiona o da de baja ` +
        'los repetidos) y reinicia el servidor para que el índice único quede enforzado.'
      );
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error ejecutando findPatientDuplicates:', err?.message || err);
    process.exit(1);
  }
})();

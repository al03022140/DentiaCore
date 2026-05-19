#!/usr/bin/env node
/**
 * Inserta pacientes de demostración en MongoDB (sin API ni JWT).
 *
 * Uso:
 *   node scripts/seed-demo-patients.js
 *   COUNT=20 node scripts/seed-demo-patients.js
 *
 * Requiere MONGODB_URI en Server/.env o en el entorno.
 */
const path = require('path');
const envPath = path.join(__dirname, '../Server/.env');
try {
  require(path.join(__dirname, '../Server/node_modules/dotenv')).config({ path: envPath });
} catch {
  try {
    require('dotenv').config({ path: envPath });
  } catch {
    /* MONGODB_URI puede venir solo del entorno */
  }
}

// Mismo paquete mongoose que el servidor (evita conflictos de conexión/modelo)
const mongoose = require(path.join(__dirname, '../Server/node_modules/mongoose'));
const Patient = require('../Server/models/patient');

const COUNT = parseInt(process.env.COUNT, 10) || 20;

function calcularEdad(fechaNacimiento) {
  const nacimiento = fechaNacimiento instanceof Date ? fechaNacimiento : new Date(fechaNacimiento);
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  if (
    hoy.getMonth() < nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate())
  ) {
    edad--;
  }
  return edad;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const maleNames = ['Carlos', 'Juan', 'Luis', 'Miguel', 'Jorge', 'Andrés', 'Diego', 'Fernando', 'Roberto', 'Raúl'];
const femaleNames = ['María', 'Laura', 'Ana', 'Sofía', 'Lucía', 'Carolina', 'Isabel', 'Patricia', 'Marta', 'Verónica'];
const lastNames = ['González', 'Rodríguez', 'López', 'Martínez', 'Pérez', 'Hernández', 'Gómez', 'Sánchez', 'Ramírez', 'Torres'];
const docTypes = ['INE', 'Pasaporte', 'Licencia', 'Otro'];

function randomDateBetweenYears(minAge, maxAge) {
  const now = new Date();
  const maxYear = now.getFullYear() - minAge;
  const minYear = now.getFullYear() - maxAge;
  const year = randomInt(minYear, maxYear);
  const month = randomInt(0, 11);
  const day = randomInt(1, 28);
  return new Date(year, month, day);
}

const baseStamp = Date.now();

function buildPatient(i) {
  const isMale = Math.random() < 0.5;
  const primer_nombre = isMale
    ? maleNames[randomInt(0, maleNames.length - 1)]
    : femaleNames[randomInt(0, femaleNames.length - 1)];
  const apellido_paterno = lastNames[randomInt(0, lastNames.length - 1)];
  const apellido_materno = lastNames[randomInt(0, lastNames.length - 1)];
  const sexo = isMale ? 'Masculino' : 'Femenino';
  const fecha_nacimiento = randomDateBetweenYears(18, 75);
  const documento_numero = `DEMO-${baseStamp}-${i}-${randomInt(1000, 9999)}`;

  return {
    primer_nombre,
    apellido_paterno,
    apellido_materno,
    sexo,
    fecha_nacimiento,
    documento: {
      tipo: docTypes[randomInt(0, docTypes.length - 1)],
      numero: documento_numero
    },
    email: `demo.p${i}.${baseStamp}@example.com`,
    contacto: {
      telefono: `55${randomInt(10000000, 99999999)}`
    },
    edad: calcularEdad(fecha_nacimiento)
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Falta MONGODB_URI. Configura Server/.env o exporta la variable.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Conectado a MongoDB');

  const created = [];
  for (let i = 1; i <= COUNT; i++) {
    const data = buildPatient(i);
    const doc = await Patient.create(data);
    created.push({
      id: doc._id,
      paciente_id: doc.paciente_id,
      nombre: `${data.primer_nombre} ${data.apellido_paterno}`
    });
  }

  console.log(`\n✅ Creados ${created.length} pacientes de demostración:\n`);
  created.forEach((c, idx) => {
    console.log(`  ${String(idx + 1).padStart(2, ' ')}. #${c.paciente_id} — ${c.nombre}`);
  });

  await mongoose.disconnect();
  console.log('\nDesconectado.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Utility script to remove all patients and clean associated uploads.
 * Intended to be triggered from launcher.py.
 */

const path = require('path');
const fsExtra = require('fs-extra');
const mongoose = require('mongoose');

const projectRoot = __dirname;
const serverDir = path.join(projectRoot, 'Server');

require('dotenv').config({ path: path.join(serverDir, '.env') });
const connectDB = require('./Server/config/db');
const Patient = require('./Server/models/patient');

async function clearUploads() {
  const uploadsDir = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(serverDir, 'uploads');

  if (await fsExtra.pathExists(uploadsDir)) {
    await fsExtra.emptyDir(uploadsDir);
    console.log(`🧹 Carpeta de uploads limpiada: ${uploadsDir}`);
  } else {
    console.log('ℹ️ Carpeta de uploads no encontrada, nada que limpiar.');
  }
}

(async () => {
  try {
    await connectDB();

    const result = await Patient.deleteMany({});
    console.log(`✅ Pacientes eliminados: ${result.deletedCount}`);

    await clearUploads();
    await mongoose.connection.close();

    console.log('🎉 Limpieza completada satisfactoriamente.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al limpiar pacientes:', error);
    process.exit(1);
  }
})();

const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { resolveUploadsPath, ensureUploadsPath } = require('../utils/uploads');

// Constantes
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Errores personalizados para mejor manejo HTTP
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

class FileTooLargeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FileTooLargeError';
    this.status = 413;
  }
}

class UnsupportedMediaTypeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedMediaTypeError';
    this.status = 415;
  }
}

/**
 * Limpia un archivo temporal y lanza un error
 * @param {string} filePath - Ruta del archivo a limpiar
 * @param {Error} error - Error a lanzar
 * @throws {Error} - Error proporcionado
 */
async function cleanupAndThrow(filePath, error) {
  try {
    await fs.remove(filePath);
  } catch (_cleanupErr) {
    // Error limpiando archivo temporal
  }
  throw error;
}

/**
 * Verifica si un archivo tiene la cabecera PNG válida
 * @param {string} filePath - Ruta del archivo a verificar
 * @returns {Promise<boolean>} - true si es un PNG válido
 */
async function verifyPngHeader(filePath) {
  let fd;
  try {
    fd = await fs.open(filePath, 'r');
    const header = Buffer.alloc(8);
    await fs.read(fd, header, 0, 8, 0);
    // Verificando cabecera PNG
    return header.equals(PNG_SIG);
  } finally {
    if (fd !== undefined) {
      await fs.close(fd);
    }
  }
}

/**
 * Valida el formato de las entradas del odontograma
 * @param {Array} entries - Entradas a validar
 * @returns {boolean} - true si el formato es válido
 */
function validateEntries(entries) {
  if (!Array.isArray(entries)) {
    return false;
  }

  // Validar que cada entrada tenga la estructura esperada
  return entries.every(entry => {
    return entry 
      && typeof entry === 'object'
      && 'tooth' in entry
      && ('damage' in entry || 'condition' in entry); // Aceptar tanto 'damage' como 'condition'
  });
}

/**
 * Normaliza una entrada de odontograma a { tooth, damage, surface, note }
 * @param {Object} entry
 * @returns {Object}
 */
function normalizeEntry(entry) {
  return {
    tooth:   entry.tooth   ?? entry.diente   ?? '',
    damage:  entry.damage  ?? entry.tipo     ?? '',
    surface: entry.surface ?? entry.superficie ?? '0',
    note:    entry.note    ?? entry.nota     ?? ''
  };
}

/**
 * Procesa y guarda un odontograma, validando que sea un PNG válido
 * @param {Object} file - Archivo subido por multer
 * @param {Array} entries - Entradas del odontograma
 * @param {string} patientId - ID del paciente
 * @returns {Promise<{imageUrl: string, datos: Array, metadata: Object}>}
 * @throws {ValidationError|FileTooLargeError|UnsupportedMediaTypeError} - Errores de validación
 */
async function processAndSaveOdontograma(file, entries, patientId) {
  try {
    // Validar archivo
    if (!file) {
      throw new ValidationError('No se ha proporcionado ningún archivo');
    }

    // Validar entradas
    if (!validateEntries(entries)) {
      throw new ValidationError('Formato de entradas inválido');
    }

    // Validar tamaño
    if (file.size > MAX_FILE_SIZE) {
      throw new FileTooLargeError(`El archivo supera el tamaño máximo permitido (${MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }

    // Validar tipo MIME y extensión
    if (file.mimetype !== 'image/png' || path.extname(file.originalname).toLowerCase() !== '.png') {
      throw new UnsupportedMediaTypeError('Solo se aceptan imágenes PNG');
    }

    // Verificar cabecera PNG (¡importante usar await!)
    const isPng = await verifyPngHeader(file.path);
    if (!isPng) {
      throw new ValidationError('El archivo no es un PNG válido');
    }

    // Usar el patientId para organizar los archivos por paciente
  const targetDir = resolveUploadsPath('pacientes', patientId, 'odontograma-inicial');
  await ensureUploadsPath('pacientes', patientId, 'odontograma-inicial');

    // Generar nombre único y mover archivo
    const uniqueName = `${uuidv4()}.png`;
    const finalPath = path.join(targetDir, uniqueName);
    await fs.move(file.path, finalPath);

    // Construir URL pública
    const imageUrl = path.posix.join('/uploads', 'pacientes', patientId, 'odontograma-inicial', uniqueName);

    // Preparar metadata
    const metadata = {
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      uploadedAt: new Date().toISOString()
    };

    return {
      imageUrl,
      datos: entries,
      metadata
    };

  } catch (error) {
    // Limpieza única del archivo temporal en caso de error
    if (file && file.path) {
      await cleanupAndThrow(file.path, error);
    } else {
      throw error;
    }
  }
}

// NOTA: Las funciones del periodontograma han sido movidas a Server/utils/periodontograma.js
// Este archivo ahora contiene únicamente funciones específicas del odontograma

module.exports = {
  processAndSaveOdontograma,
  verifyPngHeader,
  validateEntries,
  ValidationError,
  FileTooLargeError,
  UnsupportedMediaTypeError,
  normalizeEntry
};

// FUNCIONES DEL PERIODONTOGRAMA MOVIDAS A:
// - Server/utils/periodontograma.js (backend)
// - Client/src/shared/services/periodontogram-service.js (frontend API)
// - Client/src/features/periodontogram/utils/periodontogram-file-manager.js (frontend file handling)
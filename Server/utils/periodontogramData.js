const fs = require('fs-extra');
const path = require('path');
const { UniversalToothValidator } = require('./UniversalToothValidator');
const { buildArcadasFromTeeth, normalizeFurcaInTeeth } = require('./periodontogramAdaptors');
const { resolveUploadsPath } = require('./uploads');

/**
 * Valida y normaliza datos de periodontograma usando el esquema unificado
 * @param {Object} data - Datos del periodontograma a validar
 * @returns {Object} - Datos normalizados y validados
 */
function validatePeriodontogramData(data = {}) {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Payload inválido: se esperaba objeto JSON');
  }

  // Claves permitidas a nivel raíz según esquema unificado
  const allowedTopKeys = ['teeth', 'statistics', 'versionName', 'patientId', 'timestamp', 'metadata', 'pacienteId', 'version', 'arcadas'];
  const dataKeys = Object.keys(data);
  const extraKeys = dataKeys.filter(key => !allowedTopKeys.includes(key));
  
  if (extraKeys.length > 0) {
    throw new Error(`Claves no permitidas a nivel raíz: ${extraKeys.join(', ')}`);
  }

  // Normalizar estructura de datos
  const normalizedData = {
    teeth: data.teeth || {},
    statistics: data.statistics || {},
    versionName: data.versionName || data.version || 'default',
    patientId: data.patientId || data.pacienteId,
    timestamp: data.timestamp || new Date().toISOString(),
    metadata: data.metadata || {},
    arcadas: (data.arcadas && typeof data.arcadas === 'object') ? data.arcadas : undefined
  };

  if (!normalizedData.teeth || typeof normalizedData.teeth !== 'object') {
    throw new Error('Campo "teeth" requerido y debe ser objeto');
  }
  if (!normalizedData.statistics || typeof normalizedData.statistics !== 'object') {
    throw new Error('Campo "statistics" requerido y debe ser objeto');
  }

  // Usar el validador universal para validar la estructura completa
  try {
    const validationResult = UniversalToothValidator.validatePeriodontogramStructure(normalizedData);
    if (!validationResult.isValid) {
      throw new Error(`Validación fallida: ${validationResult.errors.join(', ')}`);
    }
    // Adoptar dientes normalizados a español canónico si el validador los expone
    if (validationResult.normalizedTeeth && typeof validationResult.normalizedTeeth === 'object') {
      normalizedData.teeth = validationResult.normalizedTeeth;
    }
    normalizedData.teeth = normalizeFurcaInTeeth(normalizedData.teeth);
  } catch (error) {
    throw new Error(`Error en validación de datos: ${error.message}`);
  }

  if (!normalizedData.arcadas) {
    normalizedData.arcadas = buildArcadasFromTeeth(normalizedData.teeth);
  }

  console.log('✅ Datos de periodontograma validados correctamente con esquema unificado');
  return normalizedData;
}

// --- Helper: Parsear nombre de carpeta de versión a timestamp (ms) ---
function parseVersionFolderDate(name) {
  try {
    if (typeof name !== 'string') return NaN;
    // Formato humano: DD-MM-YYYY_HH-mm-ss
    const m1 = name.match(/^(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{2})$/);
    if (m1) {
      const [_, dd, mm, yyyy, HH, MM, SS] = m1;
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(HH), Number(MM), Number(SS));
      return d.getTime();
    }
    // Formato compacto: YYYYMMDDHHmmss (14 dígitos)
    const m2 = name.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (m2) {
      const [_, yyyy, mm, dd, HH, MM, SS] = m2;
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(HH), Number(MM), Number(SS));
      return d.getTime();
    }
    // ISO sin separadores y con extras: tomar solo los primeros 14 dígitos como YYYYMMDDHHmmss
    const digits = name.replace(/\D/g, '');
    if (digits.length >= 14) {
      const yyyy = digits.slice(0, 4);
      const mm = digits.slice(4, 6);
      const dd = digits.slice(6, 8);
      const HH = digits.slice(8, 10);
      const MM = digits.slice(10, 12);
      const SS = digits.slice(12, 14);
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(HH), Number(MM), Number(SS));
      return d.getTime();
    }
    return NaN;
  } catch {
    return NaN;
  }
}

/**
 * Guarda el JSON del periodontograma en disco usando la estructura
 * uploads/pacientes/<patient_id>/periodontograma/versiones/<timestamp>/periodontogram.json
 * @param {String|Number} patientId
 * @param {Object} data { teeth, statistics, versionName }
 * @param {Object} [options]
 * @param {boolean} [options.skipValidation=false] Si true, no vuelve a validar data (ya validada aguas arriba)
 * @returns {Promise<{folder:string,filePath:string}>}
 */
async function savePeriodontogramJson(patientId, data, options = {}) {
  const { skipValidation = false } = options || {};
  if (!skipValidation) {
    validatePeriodontogramData(data);
  }

  const patientDir = resolveUploadsPath('pacientes', String(patientId), 'periodontograma', 'versiones');

  // Generar nombre de carpeta legible: DD-MM-YYYY_HH-mm-ss
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  const HH = String(now.getHours()).padStart(2, '0');
  const MM = String(now.getMinutes()).padStart(2, '0');
  const SS = String(now.getSeconds()).padStart(2, '0');
  const humanFolder = `${dd}-${mm}-${yyyy}_${HH}-${MM}-${SS}`;
  const folder = data.versionName || humanFolder;
  const versionDir = path.join(patientDir, folder);

  await fs.ensureDir(versionDir);
  const filePath = path.join(versionDir, 'periodontogram.json');

  // Alinear nombre interno con el de carpeta si no vino definido
  if (!data.versionName) {
    data.versionName = folder;
  }

  await fs.writeJson(filePath, data, { spaces: 2 });

  return { folder, filePath };
}

/**
 * Lee un periodontograma desde disco.
 * Si versionName es null lee la última versión (por fecha de carpeta).
 * @param {String|Number} patientId 
 * @param {String|null} versionName 
 * @returns {Promise<Object>} JSON parsed
 */
async function readPeriodontogramJson(patientId, versionName = null) {
  const patientDir = resolveUploadsPath('pacientes', String(patientId), 'periodontograma', 'versiones');

  if (!(await fs.pathExists(patientDir))) {
    throw new Error('No existen versiones para este paciente');
  }

  let targetDir;
  if (versionName) {
    targetDir = path.join(patientDir, versionName);
    if (!(await fs.pathExists(targetDir))) {
      throw new Error('Versión solicitada no encontrada');
    }
  } else {
    // Obtener carpeta más reciente usando fecha real parseada del nombre; fallback al tiempo del sistema
    const entries = (await fs.readdir(patientDir)).filter((d) => d !== '.DS_Store');
    if (entries.length === 0) throw new Error('No existen versiones para este paciente');
    const withMeta = await Promise.all(entries.map(async (name) => {
      const full = path.join(patientDir, name);
      const stats = await fs.stat(full);
      if (!stats.isDirectory()) return null;
      const parsedTime = parseVersionFolderDate(name);
      const sysTime = stats.mtimeMs || stats.ctimeMs || 0;
      return { name, parsedTime, sysTime };
    }));
    const filtered = withMeta.filter(Boolean);
    if (filtered.length === 0) throw new Error('No existen versiones para este paciente');
    filtered.sort((a, b) => {
      const aParsed = isFinite(a.parsedTime) ? a.parsedTime : NaN;
      const bParsed = isFinite(b.parsedTime) ? b.parsedTime : NaN;
      if (isFinite(aParsed) && isFinite(bParsed)) return bParsed - aParsed;
      if (isFinite(aParsed) && !isFinite(bParsed)) return -1;
      if (!isFinite(aParsed) && isFinite(bParsed)) return 1;
      return (b.sysTime - a.sysTime);
    });
    targetDir = path.join(patientDir, filtered[0].name);
  }

  const filePath = path.join(targetDir, 'periodontogram.json');
  if (!(await fs.pathExists(filePath))) {
    throw new Error('Archivo periodontogram.json no encontrado en la versión seleccionada');
  }
  return await fs.readJson(filePath);
}

module.exports = {
  validatePeriodontogramData,
  savePeriodontogramJson,
  readPeriodontogramJson
};
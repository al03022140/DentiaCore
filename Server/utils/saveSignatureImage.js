/**
 * Helpers para persistir firmas capturadas con pad gráfico.
 *
 * El cliente envía la firma como dataURL (PNG base64).
 * Aquí la decodificamos, validamos y la escribimos al disco bajo
 * `/uploads/...`, devolviendo la ruta pública servible.
 *
 * NOM-004-SSA3-2012 (firma autógrafa del paciente / firma electrónica del
 * personal) — las firmas se conservan como imagen junto a su `contentHash`
 * para detectar manipulaciones posteriores.
 */
const fsExtra = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { resolveUploadsPath } = require('./uploads');

const MAX_BYTES = 500 * 1024; // 500 KB por firma (PNG comprimido razonable)
const DATAURL_RE = /^data:image\/(png|jpe?g);base64,(.+)$/i;

/**
 * Decodifica una firma base64 y la guarda en disco.
 *
 * @param {string} dataUrl - "data:image/png;base64,..."
 * @param {string[]} segments - Segmentos bajo /uploads. El ÚLTIMO es el nombre
 *   del archivo (sin extensión: se infiere). Ej: ['pacientes', id, 'firmas-notas', 'nota_5_paciente'].
 * @returns {Promise<{publicUrl:string, absPath:string, contentHash:string, bytes:number}>}
 */
async function saveSignatureDataUrl(dataUrl, segments) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('Firma vacía o inválida');
  }
  const match = dataUrl.match(DATAURL_RE);
  if (!match) {
    throw new Error('Formato de firma no soportado (se espera PNG/JPG base64)');
  }
  if (!Array.isArray(segments) || segments.length < 1) {
    throw new Error('Ruta destino inválida');
  }

  const ext = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) {
    throw new Error('Firma vacía después de decodificar');
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error(`La firma excede el tamaño máximo (${Math.round(MAX_BYTES / 1024)}KB)`);
  }

  const dirSegments = segments.slice(0, -1);
  let filename = segments[segments.length - 1];
  if (!/\.(png|jpe?g)$/i.test(filename)) {
    filename = `${filename}.${ext}`;
  }

  const dir = resolveUploadsPath(...dirSegments);
  await fsExtra.ensureDir(dir);
  const absPath = path.join(dir, filename);
  await fsExtra.writeFile(absPath, buffer);

  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const publicUrl = '/uploads/' + [...dirSegments, filename].join('/');

  return { publicUrl, absPath, contentHash, bytes: buffer.length };
}

/**
 * Copia la firma del doctor (guardada en `/uploads/firmas/<filename>`) a un
 * destino específico como SNAPSHOT INMUTABLE.
 *
 * Necesario porque cuando el doctor cambia su firma, el upload borra el
 * archivo anterior. Sin esta copia, las notas históricas firmadas con PIN
 * apuntarían a un archivo inexistente → 404 al mostrar la firma.
 *
 * @param {string} sourceFilenameOrPath - `user.firmaDigitalUrl` (filename
 *   plano o ruta relativa, lo normalizamos con path.basename)
 * @param {string[]} destSegments - Segmentos bajo /uploads incluyendo el
 *   nombre destino (sin extensión, se infiere del source).
 * @returns {Promise<{publicUrl, absPath, bytes}>}
 */
async function copyFirmaToSnapshot(sourceFilenameOrPath, destSegments) {
  if (!sourceFilenameOrPath) throw new Error('Filename de firma vacío');
  if (!Array.isArray(destSegments) || destSegments.length < 1) {
    throw new Error('Ruta destino inválida');
  }
  const baseName = path.basename(sourceFilenameOrPath);
  const sourcePath = resolveUploadsPath('firmas', baseName);

  if (!await fsExtra.pathExists(sourcePath)) {
    throw new Error(`Archivo de firma no encontrado: ${baseName}`);
  }

  const sourceExt = path.extname(baseName).toLowerCase() || '.png';
  const dirSegments = destSegments.slice(0, -1);
  let filename = destSegments[destSegments.length - 1];
  if (!/\.(png|jpe?g)$/i.test(filename)) {
    filename = `${filename}${sourceExt}`;
  }

  const dir = resolveUploadsPath(...dirSegments);
  await fsExtra.ensureDir(dir);
  const absPath = path.join(dir, filename);
  await fsExtra.copyFile(sourcePath, absPath);

  // Hash del PNG copiado para detectar tampering posterior. La firma
  // sigue siendo una imagen opaca — esto no es PKI, sólo defensa-en-
  // profundidad sobre la integridad del archivo (un script de auditoría
  // periódica puede comparar el hash actual del PNG con el almacenado).
  const buffer = await fsExtra.readFile(absPath);
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const publicUrl = '/uploads/' + [...dirSegments, filename].join('/');
  return { publicUrl, absPath, bytes: buffer.length, contentHash };
}

/**
 * Verifica que el PNG en disco no haya sido alterado vs el hash almacenado.
 * Devuelve { ok: bool, expected, actual } o lanza si el archivo no existe.
 *
 * @param {string} absPath - Ruta absoluta del archivo PNG.
 * @param {string} expectedHash - Hash SHA-256 hex guardado al momento del firmado.
 */
async function verifySignatureImageHash(absPath, expectedHash) {
  if (!absPath || !expectedHash) {
    return { ok: false, expected: expectedHash, actual: null, reason: 'missing_inputs' };
  }
  if (!await fsExtra.pathExists(absPath)) {
    return { ok: false, expected: expectedHash, actual: null, reason: 'file_not_found' };
  }
  const buffer = await fsExtra.readFile(absPath);
  const actual = crypto.createHash('sha256').update(buffer).digest('hex');
  return { ok: actual === expectedHash, expected: expectedHash, actual };
}

module.exports = { saveSignatureDataUrl, copyFirmaToSnapshot, verifySignatureImageHash, MAX_BYTES };

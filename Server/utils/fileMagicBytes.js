/**
 * Detección de tipo real de archivo por magic bytes.
 *
 * Multer confía en el `Content-Type` del cliente — un atacante puede subir
 * un `.exe` renombrado a `.pdf` con `Content-Type: application/pdf`. Esta
 * utilidad lee los primeros bytes del archivo y verifica que coincidan
 * con la firma esperada del MIME declarado, bloqueando ese vector.
 *
 * Se eligió implementación local sin dependencias (en vez de `file-type`)
 * para evitar agregar una dep ESM-only que complicaría la build CJS.
 * Cubre los tipos que el sistema acepta hoy: PDF, JPEG, PNG, GIF, WEBP.
 */
const fs = require('fs');

// Lee los primeros N bytes del archivo (lo justo para sniff de magic bytes).
async function readHead(filePath, bytes = 16) {
  const fd = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fd.read(buf, 0, bytes, 0);
    return buf.slice(0, bytesRead);
  } finally {
    await fd.close();
  }
}

// Match con offset. Si bytes está como string usa hex.
function startsWith(head, signature) {
  if (head.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (head[i] !== signature[i]) return false;
  }
  return true;
}

// MIME → array de magic byte signatures (Buffer). Un archivo es válido si
// matchea CUALQUIERA de las firmas asociadas a su MIME declarado.
const MIME_SIGNATURES = {
  'application/pdf': [Buffer.from('%PDF-')],
  'image/jpeg':      [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/jpg':       [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png':       [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
  'image/gif':       [Buffer.from('GIF87a'), Buffer.from('GIF89a')],
  // WEBP: RIFF....WEBP (offset 8). Validamos RIFF + WEBP por separado.
  'image/webp':      [Buffer.from('RIFF')]
};

/**
 * Sniffea el archivo y devuelve true si las primeras bytes coinciden con
 * el MIME declarado, false en caso contrario. Devuelve también `actual`
 * con un guess del tipo real (útil para logging).
 */
async function validateMimeByMagicBytes(filePath, declaredMime) {
  const signatures = MIME_SIGNATURES[declaredMime];
  if (!signatures) {
    // MIME desconocido o no soportado en este sniff → rechazar.
    return { ok: false, declared: declaredMime, actual: 'unknown' };
  }

  const head = await readHead(filePath, 16);

  // WEBP necesita verificación adicional del bloque 'WEBP' en offset 8.
  if (declaredMime === 'image/webp') {
    if (!startsWith(head, signatures[0])) {
      return { ok: false, declared: declaredMime, actual: 'not-riff' };
    }
    const webpMarker = head.slice(8, 12).toString('ascii');
    return { ok: webpMarker === 'WEBP', declared: declaredMime, actual: webpMarker };
  }

  const matched = signatures.some(sig => startsWith(head, sig));
  return { ok: matched, declared: declaredMime, actual: matched ? declaredMime : 'mismatch' };
}

module.exports = { validateMimeByMagicBytes };

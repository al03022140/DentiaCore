const fs = require('fs');
const fsExtra = require('fs-extra');
const logger = require('./logger');

/**
 * Verificación de contenido real de archivos subidos (magic bytes).
 *
 * El `fileFilter` de multer solo mira el `Content-Type` que DECLARA el cliente
 * en el multipart — trivialmente falsificable. Aquí se lee la firma binaria
 * del archivo ya escrito en disco y se compara contra lo que el mimetype
 * declarado promete. Defensa-en-profundidad para un expediente clínico:
 * impide guardar un ejecutable/HTML disfrazado de "radiografia.png".
 *
 * No re-codifica la imagen (para eso haría falta sharp); valida encabezados:
 *   JPEG: FF D8 FF · PNG: 89 50 4E 47 0D 0A 1A 0A · GIF: "GIF87a"/"GIF89a"
 *   WEBP: "RIFF"...."WEBP" · PDF: "%PDF-"
 */

const readHead = (filePath, bytes = 16) => {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n);
  } catch (_err) {
    return null;
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (_e) { /* noop */ }
    }
  }
};

const isJpeg = (b) => b && b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isPng = (b) => b && b.length >= 8
  && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
  && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
const isGif = (b) => b && b.length >= 6
  && b.subarray(0, 6).toString('latin1').match(/^GIF8[79]a$/) !== null;
const isWebp = (b) => b && b.length >= 12
  && b.subarray(0, 4).toString('latin1') === 'RIFF'
  && b.subarray(8, 12).toString('latin1') === 'WEBP';
const isPdf = (b) => b && b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-';

// mimetype declarado -> verificador de contenido
const VERIFIERS = {
  'image/jpeg': isJpeg,
  'image/jpg': isJpeg,
  'image/png': isPng,
  'image/gif': isGif,
  'image/webp': isWebp,
  'application/pdf': isPdf
};

/**
 * ¿El contenido del archivo corresponde al mimetype declarado?
 * Mimetypes fuera del mapa → false (si no sabemos verificarlo, no pasa;
 * los fileFilter de las rutas ya restringen a este mismo conjunto).
 */
function matchesDeclaredMime(filePath, declaredMime) {
  const verify = VERIFIERS[(declaredMime || '').toLowerCase()];
  if (!verify) return false;
  return Boolean(verify(readHead(filePath)));
}

/** Compatibilidad con el uso original (foto de perfil JPG/PNG). */
function isJpegOrPng(filePath) {
  const head = readHead(filePath);
  return Boolean(isJpeg(head) || isPng(head));
}

/**
 * Middleware post-multer: valida la firma binaria de `req.file` contra su
 * mimetype declarado. Sin archivo → pasa (la foto/adjunto puede ser opcional;
 * la obligatoriedad la decide el controller). Falla → borra el archivo recién
 * escrito (aún no es dato clínico: nunca se registró en BD) y responde 415.
 */
function verifyUploadSignature(req, res, next) {
  if (!req.file || !req.file.path) return next();
  if (matchesDeclaredMime(req.file.path, req.file.mimetype)) return next();

  fsExtra.remove(req.file.path).catch(() => {});
  logger.warn(
    `Upload rechazado por firma binaria: "${req.file.originalname}" declaraba ${req.file.mimetype} (user ${req.user?.id || 'n/a'})`
  );
  return res.status(415).json({
    message: 'El contenido del archivo no corresponde a su tipo declarado.'
  });
}

module.exports = { matchesDeclaredMime, isJpegOrPng, verifyUploadSignature };

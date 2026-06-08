const fs = require('fs');

/**
 * Verifica que un archivo sea REALMENTE un JPEG o PNG leyendo sus primeros
 * bytes (magic numbers), en vez de confiar en el `Content-Type` que declara el
 * cliente en el multipart (que es trivialmente falsificable).
 *
 *   JPEG: FF D8 FF
 *   PNG : 89 50 4E 47 0D 0A 1A 0A
 *
 * Defensa-en-profundidad sobre el `fileFilter` de multer (que solo mira el
 * mimetype declarado). No re-codifica la imagen; para eso haría falta sharp.
 *
 * @param {string} filePath ruta absoluta del archivo subido
 * @returns {boolean} true si la firma corresponde a JPEG o PNG
 */
function isJpegOrPng(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    const bytesRead = fs.readSync(fd, buf, 0, 8, 0);
    if (bytesRead < 4) return false;

    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng =
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;

    return isJpeg || isPng;
  } catch (_err) {
    return false;
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (_e) { /* noop */ }
    }
  }
}

module.exports = { isJpegOrPng };

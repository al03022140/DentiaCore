// Utilidades para trabajar con dataURLs (`data:<mime>;base64,...`).

/**
 * Convierte un dataURL en Blob SIN usar fetch().
 *
 * ¿Por qué no `fetch(dataUrl).then(r => r.blob())`? Un fetch() sobre una URL
 * `data:` es una petición de red sujeta al CSP `connect-src`. El `<meta>` CSP de
 * `index.html` permite `data:` en `img-src` (para mostrar `<img src="data:...">`)
 * pero NO en `connect-src`, así que `fetch('data:...')` queda bloqueado por el
 * navegador con **"Failed to fetch"** y la imagen nunca llega a subirse. El
 * navegador aplica además la intersección con el CSP del server (helmet), por lo
 * que reforzar solo el header no bastaría. Decodificar el base64 a mano no toca
 * la red: es inmune al CSP y funciona igual en dev (Vite) y en producción.
 *
 * @param {string} dataUrl - p.ej. "data:image/png;base64,iVBORw0KG..."
 * @returns {Blob}
 */
export const dataUrlToBlob = (dataUrl) => {
  if (typeof dataUrl !== 'string') throw new Error('dataURL inválido');
  const comma = dataUrl.indexOf(',');
  if (comma === -1) throw new Error('dataURL inválido');
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  // base64 → binario; si no es base64, el cuerpo viene URL-encoded.
  const binary = /;base64/i.test(header) ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

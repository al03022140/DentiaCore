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
 * Normaliza una entrada de odontograma a { tooth, damage, surface, note }
 * @param {Object} entry
 * @returns {Object}
 */
function normalizeEntry(entry) {
  const out = {
    tooth:   entry.tooth   ?? entry.diente   ?? '',
    damage:  entry.damage  ?? entry.tipo     ?? '',
    surface: entry.surface ?? entry.superficie ?? '0',
    note:    entry.note    ?? entry.nota     ?? ''
  };
  // Daños inter-dentales (diastema, prótesis fija, ortodoncia, transposición):
  // el engine los identifica por `space` (ID de 4 dígitos = dientes FDI
  // adyacentes, p.ej. "1817") en lugar de `tooth`. Sin propagarlo aquí se
  // perdían en cada guardado.
  const space = String(entry.space ?? entry.espacio ?? '').trim();
  if (space) out.space = space;
  // Exponer `fecha` cuando exista en el documento persistido. El cliente la usa para
  // mostrar la fecha real de cada fila (no la de "hoy"). El servidor es quien la fija
  // al guardar; aquí sólo la propagamos al frontend.
  const fecha = entry.fecha ?? entry.date;
  if (fecha) {
    out.fecha = fecha instanceof Date ? fecha.toISOString() : String(fecha);
  }
  return out;
}

module.exports = {
  ValidationError,
  FileTooLargeError,
  UnsupportedMediaTypeError,
  normalizeEntry
};

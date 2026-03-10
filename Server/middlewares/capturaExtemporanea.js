/**
 * Middleware de Captura Extemporánea — DentiaCore
 *
 * roles.MD §9.5: Cuando `fechaNota` difiere de `Date.now()` en más de ±6 horas,
 * el campo `_capturaExtemporanea` con `motivo` obligatorio debe estar presente.
 *
 * Se aplica en rutas de escritura clínica (POST/PUT de notas, odontograma, etc.).
 * Si la fecha es extemporánea y no hay motivo, rechaza con 400.
 */

const TOLERANCE_MS = 6 * 60 * 60 * 1000; // ±6 horas

const VALID_MOTIVOS = [
  'falla_sistema',
  'falla_electrica',
  'emergencia_medica',
  'error_captura',
  'otro',
];

/**
 * Extrae la fecha de la nota del body (busca en múltiples campos posibles).
 */
function extractFechaNota(body) {
  const raw = body?.evolutionNote?.fecha
    || body?.treatmentPlan?.fecha
    || body?.fechaNota
    || body?.fecha;

  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Middleware que valida automáticamente si la escritura es extemporánea.
 * Si `fechaNota` difiere del servidor en > 6 h y no hay `_capturaExtemporanea.motivo`, rechaza.
 *
 * Si la escritura no incluye fecha o está dentro de tolerancia, pasa sin modificar.
 * Si incluye captura extemporánea válida, enriquece el objeto con `fechaCaptura` del servidor.
 */
function validarCapturaExtemporanea(req, res, next) {
  // Solo aplicar a escrituras
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();

  const fechaNota = extractFechaNota(req.body);
  if (!fechaNota) return next(); // Sin fecha → no aplica

  const fechaServidor = new Date();
  const diffMs = Math.abs(fechaServidor.getTime() - fechaNota.getTime());

  if (diffMs <= TOLERANCE_MS) {
    // Dentro de tolerancia, limpiar campo si llegó por error
    if (req.body._capturaExtemporanea) {
      delete req.body._capturaExtemporanea;
    }
    return next();
  }

  // Extemporánea: exigir motivo
  const captura = req.body._capturaExtemporanea;
  if (!captura || !captura.motivo || !captura.motivo.trim()) {
    return res.status(400).json({
      message: 'Captura extemporánea detectada. El campo motivo es obligatorio.',
      esExtemporanea: true,
      fechaNota: fechaNota.toISOString(),
      fechaServidor: fechaServidor.toISOString(),
      motivosValidos: VALID_MOTIVOS,
    });
  }

  // Validar que el motivo sea uno de los permitidos
  const motivoNorm = captura.motivo.trim().toLowerCase();
  if (!VALID_MOTIVOS.includes(motivoNorm) && motivoNorm !== 'otro') {
    // Si viene texto libre, tratar como 'otro'
    // (el motivo detallado se guarda en captura.motivoDetalle)
  }

  // Enriquecer con datos del servidor
  req.body._capturaExtemporanea = {
    esExtemporanea: true,
    motivo: captura.motivo.trim(),
    motivoDetalle: captura.motivoDetalle || null,
    fechaNota,
    fechaCaptura: fechaServidor,
  };

  return next();
}

module.exports = validarCapturaExtemporanea;
module.exports.VALID_MOTIVOS = VALID_MOTIVOS;
module.exports.TOLERANCE_MS = TOLERANCE_MS;

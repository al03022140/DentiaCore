/**
 * Middleware de Captura Extemporánea (unificado) — DentiaCore
 *
 * roles.MD §9.5 + NOM-004-SSA3-2012: toda escritura clínica cuya fecha difiera
 * más de ±6 h del reloj del servidor es CAPTURA EXTEMPORÁNEA y exige `motivo`.
 * El registro tardío queda documentado en el audit trail.
 *
 * Montado GLOBAL en config/routes.js → cubre notas, planes, odontograma,
 * exámenes, etc. Fusiona los antiguos `validarCapturaExtemporanea` (global) y
 * `backdatedEntry` (per-route de exámenes): unión de campos de fecha, unión de
 * orígenes de motivo, regla que acepta ambos contratos previos, y auditoría.
 */
const auditLogger = require('./auditLogger');

const TOLERANCE_MS = 6 * 60 * 60 * 1000; // ±6 horas

const VALID_MOTIVOS = [
  'falla_sistema',
  'falla_electrica',
  'emergencia_medica',
  'error_captura',
  'otro',
];

// Unión de los campos de fecha que miraban ambos middlewares previos.
function extractFechaNota(body) {
  const raw = body?.evolutionNote?.fecha
    || body?.treatmentPlan?.fecha
    || body?.fechaNota
    || body?.fechaConsulta
    || body?.fechaProcedimiento
    || body?.fecha
    || body?.date;

  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Motivo desde el objeto anidado (path global/cliente) o desde un campo plano
// (path exámenes). Devuelve el texto recortado o ''.
function extractMotivo(body) {
  const fromObj = body?._capturaExtemporanea?.motivo;
  const raw = (typeof fromObj === 'string' && fromObj)
    || body?.capturaExtemporaneaMotivo
    || body?.motivoExtemporanea
    || body?.motivo_extemporanea
    || '';
  return typeof raw === 'string' ? raw.trim() : '';
}

// Acepta un código conocido (enum corto, p.ej. 'otro') O texto libre ≥10 chars.
// Preserva ambos contratos previos sin debilitar ninguno: más estricto que el
// antiguo global (cualquier string no vacío) y compatible con el enum.
function motivoEsValido(motivo) {
  return !!motivo && (VALID_MOTIVOS.includes(motivo.toLowerCase()) || motivo.length >= 10);
}

function validarCapturaExtemporanea(req, res, next) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  if (!req.body || typeof req.body !== 'object') return next();

  const fechaNota = extractFechaNota(req.body);
  if (!fechaNota) return next(); // Sin fecha → no aplica

  const fechaServidor = new Date();
  const diffMs = Math.abs(fechaServidor.getTime() - fechaNota.getTime());

  if (diffMs <= TOLERANCE_MS) {
    // Dentro de tolerancia: limpiar la bandera si llegó por error.
    if (req.body._capturaExtemporanea) delete req.body._capturaExtemporanea;
    return next();
  }

  // Extemporánea: exigir motivo válido.
  const motivo = extractMotivo(req.body);
  if (!motivoEsValido(motivo)) {
    return res.status(400).json({
      error: 'Captura extemporánea detectada',
      message: 'La fecha difiere más de 6 horas del momento actual. Se requiere un '
        + 'motivo de captura extemporánea (un motivo conocido o texto de al menos 10 caracteres).',
      esExtemporanea: true,
      fechaNota: fechaNota.toISOString(),
      fechaServidor: fechaServidor.toISOString(),
      diferenciaHoras: Math.round(diffMs / (60 * 60 * 1000) * 10) / 10,
      motivosValidos: VALID_MOTIVOS,
      campoRequerido: 'capturaExtemporaneaMotivo',
    });
  }

  // Enriquecer el body para que el controller persista la marca.
  req.body._capturaExtemporanea = {
    esExtemporanea: true,
    motivo,
    motivoDetalle: req.body?._capturaExtemporanea?.motivoDetalle || null,
    fechaNota,
    fechaCaptura: fechaServidor,
    diferenciaMs: diffMs,
  };

  // Auditoría NOM-004 del registro tardío (best-effort, no bloquea la escritura).
  if (req.user) {
    auditLogger.registrarManual(req, 'captura_extemporanea', {
      resourceType: null, // el controller lo completa
      patientId: req.body.patientId || req.body.paciente || req.params?.patientId || null,
      fechaNota,
      fechaServidor,
      motivo,
      detalles: { diferenciaHoras: Math.round(diffMs / (60 * 60 * 1000) * 10) / 10 },
    }).catch(err => console.error('[CapturaExtemporanea] Error al registrar auditoría:', err.message));
  }

  return next();
}

module.exports = validarCapturaExtemporanea;
module.exports.VALID_MOTIVOS = VALID_MOTIVOS;
module.exports.TOLERANCE_MS = TOLERANCE_MS;

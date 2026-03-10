/**
 * Middleware de Captura Extemporánea — DentiaCore
 *
 * roles.MD §9.5: Si la fecha de la nota difiere >6 horas del momento
 * de captura en el servidor, se considera CAPTURA EXTEMPORÁNEA.
 * En ese caso, se requiere motivo obligatorio y se activa la bandera
 * capturaExtemporanea en el registro.
 *
 * NOM-004-SSA3-2012 requiere que todo registro tardío quede
 * debidamente documentado.
 */
const auditLogger = require('./auditLogger');

// Umbral en milisegundos: 6 horas
const UMBRAL_EXTEMPORANEA_MS = 6 * 60 * 60 * 1000;

/**
 * Campos de fecha que pueden indicar captura extemporánea.
 * El middleware busca cualquiera de estos en req.body.
 */
const CAMPOS_FECHA = [
  'fechaNota',
  'fechaConsulta',
  'fechaProcedimiento',
  'fecha',
  'date',
];

/**
 * Middleware factory para detectar y marcar capturas extemporáneas.
 *
 * @param {object} [opciones]
 * @param {string[]} [opciones.camposFecha] - Nombres alternativos del campo fecha
 * @param {number}   [opciones.umbralMs]    - Umbral personalizado en ms
 * @param {boolean}  [opciones.obligatorio] - Si true, rechaza sin motivo (default: true)
 * @returns {Function} middleware Express
 */
function backdatedEntry(opciones = {}) {
  const {
    camposFecha = CAMPOS_FECHA,
    umbralMs = UMBRAL_EXTEMPORANEA_MS,
    obligatorio = true,
  } = opciones;

  return (req, res, next) => {
    // Solo aplica a escrituras con body
    if (!req.body || typeof req.body !== 'object') return next();

    // Buscar el primer campo de fecha presente en el body
    let fechaNota = null;
    let campoUsado = null;

    for (const campo of camposFecha) {
      if (req.body[campo]) {
        const parsed = new Date(req.body[campo]);
        if (!isNaN(parsed.getTime())) {
          fechaNota = parsed;
          campoUsado = campo;
          break;
        }
      }
    }

    // Si no hay fecha en el body, no aplica
    if (!fechaNota) return next();

    const ahora = new Date();
    const diferenciaMs = Math.abs(ahora.getTime() - fechaNota.getTime());

    // Si la diferencia es menor al umbral, no es extemporánea
    if (diferenciaMs <= umbralMs) return next();

    // ── Es captura extemporánea ─────────────────────────────────
    const motivo = req.body.capturaExtemporaneaMotivo
      || req.body.motivoExtemporanea
      || req.body.motivo_extemporanea;

    // Validar que se proporcionó motivo
    if (obligatorio && (!motivo || motivo.trim().length < 10)) {
      return res.status(400).json({
        error: 'Captura extemporánea detectada',
        message: 'La fecha de la nota difiere más de 6 horas del momento actual. '
          + 'Se requiere un motivo de captura extemporánea (mínimo 10 caracteres).',
        campo: campoUsado,
        fechaNota: fechaNota.toISOString(),
        fechaServidor: ahora.toISOString(),
        diferenciaHoras: Math.round(diferenciaMs / (60 * 60 * 1000) * 10) / 10,
        campoRequerido: 'capturaExtemporaneaMotivo',
      });
    }

    // Adjuntar datos de captura extemporánea al body para que el controller los guarde
    req.body._capturaExtemporanea = {
      esExtemporanea: true,
      fechaNota: fechaNota,
      fechaCaptura: ahora,
      motivo: (motivo || '').trim(),
      diferenciaMs,
    };

    // Registrar en auditoría
    if (req.user) {
      auditLogger.registrarManual(req, 'captura_extemporanea', {
        resourceType: null, // El controller llenará esto
        patientId: req.body.patientId || req.body.paciente || req.params?.patientId || null,
        fechaNota,
        fechaServidor: ahora,
        motivo: (motivo || '').trim(),
        detalles: {
          campoFecha: campoUsado,
          diferenciaHoras: Math.round(diferenciaMs / (60 * 60 * 1000) * 10) / 10,
        },
      }).catch(err => console.error('[BackdatedEntry] Error al registrar auditoría:', err.message));
    }

    next();
  };
}

// Exportar instancia por defecto y factory
module.exports = backdatedEntry;
module.exports.UMBRAL_EXTEMPORANEA_MS = UMBRAL_EXTEMPORANEA_MS;

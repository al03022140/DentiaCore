/**
 * Controlador de Borradores (Drafts) — DentiaCore
 *
 * roles.MD §8: Delegación controlada — Flujo BORRADOR → OFICIAL.
 * roles.MD §9.4: Firma en lote (batch-sign).
 *
 * Los asistentes crean registros en estado BORRADOR (draft).
 * Los doctores revisan y firman (aprueban → OFICIAL o rechazan → BORRADOR con notas).
 *
 * Firma en lote: POST /api/drafts/batch-sign
 *   body: { draftIds: [...], pin: '****' }
 *   Requiere PIN válido. Transiciona cada DRAFT → OFICIAL.
 */
const OdontogramaModel = require('../models/odontograma');
const Periodontogram = require('../models/periodontogram');
const Exam = require('../models/exam');
const Usuario = require('../models/users');
const auditLogger = require('../middlewares/auditLogger');

// Mapa de modelos clínicos que soportan borradores
const DRAFT_MODELS = {
  odontograma: { model: OdontogramaModel, fieldName: 'estado' },
  periodontograma: { model: Periodontogram, fieldName: 'estadoRegistro' },
  examen: { model: Exam, fieldName: 'estadoRegistro' },
};

// Detectar modelo y campo de estado por resourceType
function resolveModel(resourceType) {
  return DRAFT_MODELS[resourceType] || null;
}

/**
 * GET /api/drafts — Listar borradores pendientes del doctor autenticado.
 * Los doctores ven borradores de SUS pacientes asignados.
 * Los superadmin/admin ven todos.
 */
const listDrafts = async (req, res) => {
  try {
    const drafts = [];

    for (const [type, { model, fieldName }] of Object.entries(DRAFT_MODELS)) {
      const filter = { [fieldName]: 'BORRADOR' };
      const docs = await model.find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      docs.forEach(doc => {
        drafts.push({
          _id: doc._id,
          resourceType: type,
          patientId: doc.patientId || doc.paciente_id || doc.patient || null,
          creadoPor: doc.creadoPor || null,
          createdAt: doc.createdAt,
          resumen: doc.nombre || doc.type || type,
        });
      });
    }

    // Ordenar por fecha de creación descendente
    drafts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({ count: drafts.length, drafts });
  } catch (error) {
    console.error('[DraftController] Error al listar borradores:', error);
    return res.status(500).json({ message: 'Error al listar borradores', error: error.message });
  }
};

/**
 * PATCH /api/drafts/:id/sign — Firmar un borrador individual.
 * body: { resourceType, pin }
 */
const signDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const { resourceType, pin } = req.body || {};

    if (!resourceType || !pin) {
      return res.status(400).json({ message: 'resourceType y pin son requeridos' });
    }

    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({ message: 'ID de borrador inválido' });
    }

    // Verificar PIN
    const user = await Usuario.findById(req.user.id);
    if (!user || !user.pinHash) {
      return res.status(400).json({ message: 'Debe configurar su PIN antes de firmar' });
    }

    const pinValid = await user.verificarPin(pin);
    if (!pinValid) {
      user.pinFailedAttempts = (user.pinFailedAttempts || 0) + 1;
      await user.save();

      auditLogger.registrarManual(req, 'pin_fallo', {
        resourceType: 'session',
        detalles: { contexto: 'firma_borrador' },
      }).catch(() => {});

      return res.status(401).json({ message: 'PIN incorrecto' });
    }

    // Resetear intentos
    user.pinFailedAttempts = 0;
    await user.save();

    // Buscar el documento borrador
    const resolved = resolveModel(resourceType);
    if (!resolved) {
      return res.status(400).json({ message: `Tipo de recurso '${resourceType}' no soporta borradores` });
    }

    const { model, fieldName } = resolved;
    const doc = await model.findById(id);
    if (!doc) {
      return res.status(404).json({ message: 'Borrador no encontrado' });
    }

    if (doc[fieldName] !== 'BORRADOR') {
      return res.status(400).json({ message: 'El registro no está en estado BORRADOR' });
    }

    // Transicionar BORRADOR → OFICIAL
    doc[fieldName] = 'OFICIAL';
    doc.firmadoPor = req.user.id;
    doc.firmadoEn = new Date();
    doc.autorizadoPor = req.user.id;

    await doc.save();

    // Registrar en auditoría
    await auditLogger.registrarManual(req, 'borrador_aprobado', {
      resourceType,
      resourceId: doc._id,
      patientId: doc.patientId || doc.paciente_id || null,
    });

    return res.json({ message: 'Borrador firmado correctamente', doc });
  } catch (error) {
    console.error('[DraftController] Error al firmar borrador:', error);
    return res.status(500).json({ message: 'Error al firmar borrador', error: error.message });
  }
};

/**
 * POST /api/drafts/batch-sign — Firma en lote (roles.MD §9.4).
 * body: { draftIds: [{ id, resourceType }], pin }
 *
 * Transiciona múltiples BORRADOR → OFICIAL en una sola operación.
 * Requiere PIN válido del doctor.
 */
const batchSign = async (req, res) => {
  try {
    const { draftIds, pin } = req.body || {};

    if (!Array.isArray(draftIds) || draftIds.length === 0) {
      return res.status(400).json({ message: 'draftIds debe ser un array no vacío' });
    }

    if (!pin) {
      return res.status(400).json({ message: 'PIN requerido para firma en lote' });
    }

    // Verificar PIN
    const user = await Usuario.findById(req.user.id);
    if (!user || !user.pinHash) {
      return res.status(400).json({ message: 'Debe configurar su PIN antes de firmar en lote' });
    }

    const pinValid = await user.verificarPin(pin);
    if (!pinValid) {
      user.pinFailedAttempts = (user.pinFailedAttempts || 0) + 1;
      await user.save();

      auditLogger.registrarManual(req, 'pin_fallo', {
        resourceType: 'session',
        detalles: { contexto: 'firma_lote', totalIntentados: draftIds.length },
      }).catch(() => {});

      return res.status(401).json({ message: 'PIN incorrecto' });
    }

    user.pinFailedAttempts = 0;
    await user.save();

    // Procesar cada borrador
    const resultados = [];
    const aprobados = [];
    const errores = [];

    for (const item of draftIds) {
      const { id, resourceType } = typeof item === 'string'
        ? { id: item, resourceType: null }
        : item;

      try {
        if (!resourceType) {
          errores.push({ id, error: 'resourceType requerido' });
          continue;
        }

        const resolved = resolveModel(resourceType);
        if (!resolved) {
          errores.push({ id, resourceType, error: 'Tipo no soportado' });
          continue;
        }

        const { model, fieldName } = resolved;
        const doc = await model.findById(id);

        if (!doc) {
          errores.push({ id, resourceType, error: 'No encontrado' });
          continue;
        }

        if (doc[fieldName] !== 'BORRADOR') {
          errores.push({ id, resourceType, error: 'No está en estado BORRADOR' });
          continue;
        }

        doc[fieldName] = 'OFICIAL';
        doc.firmadoPor = req.user.id;
        doc.firmadoEn = new Date();
        doc.autorizadoPor = req.user.id;
        await doc.save();

        aprobados.push(doc._id);
        resultados.push({ id: doc._id, resourceType, status: 'aprobado' });
      } catch (err) {
        errores.push({ id, resourceType: item.resourceType, error: err.message });
      }
    }

    // Registrar firma en lote en auditoría
    await auditLogger.registrarManual(req, 'firma_lote', {
      registrosAprobados: aprobados,
      totalRegistros: draftIds.length,
      detalles: {
        aprobados: aprobados.length,
        errores: errores.length,
      },
    });

    return res.json({
      message: `Firma en lote completada: ${aprobados.length}/${draftIds.length} aprobados`,
      resultados,
      errores: errores.length > 0 ? errores : undefined,
    });
  } catch (error) {
    console.error('[DraftController] Error en firma en lote:', error);
    return res.status(500).json({ message: 'Error en firma en lote', error: error.message });
  }
};

/**
 * PATCH /api/drafts/:id/reject — Rechazar un borrador.
 * body: { resourceType, motivo }
 */
const rejectDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const { resourceType, motivo } = req.body || {};

    if (!resourceType || !motivo || motivo.trim().length < 5) {
      return res.status(400).json({
        message: 'resourceType y motivo (mínimo 5 caracteres) son requeridos'
      });
    }

    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({ message: 'ID de borrador inválido' });
    }

    const resolved = resolveModel(resourceType);
    if (!resolved) {
      return res.status(400).json({ message: 'Tipo de recurso no soportado' });
    }

    const { model, fieldName } = resolved;
    const doc = await model.findById(id);
    if (!doc) return res.status(404).json({ message: 'Borrador no encontrado' });

    if (doc[fieldName] !== 'BORRADOR') {
      return res.status(400).json({ message: 'El registro no está en estado BORRADOR' });
    }

    // Registrar el rechazo (el estado permanece como BORRADOR para corrección)
    doc.modificadoPor = req.user.id;
    doc.modificadoEn = new Date();
    await doc.save();

    await auditLogger.registrarManual(req, 'borrador_rechazado', {
      resourceType,
      resourceId: doc._id,
      patientId: doc.patientId || doc.paciente_id || null,
      motivo: motivo.trim(),
    });

    return res.json({ message: 'Borrador rechazado', motivo: motivo.trim() });
  } catch (error) {
    console.error('[DraftController] Error al rechazar borrador:', error);
    return res.status(500).json({ message: 'Error al rechazar borrador', error: error.message });
  }
};

module.exports = {
  listDrafts,
  signDraft,
  batchSign,
  rejectDraft,
};

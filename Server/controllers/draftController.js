/**
 * Controlador de Borradores (Drafts) — DentiaCore
 *
 * roles.MD §8: Delegación controlada — Flujo BORRADOR → OFICIAL.
 * roles.MD §9.4: Firma en lote (batch-sign).
 *
 * Los asistentes crean registros en estado BORRADOR (draft).
 * Los doctores revisan y firman (aprueban → OFICIAL o rechazan → motivo
 * persistido en el doc).
 *
 * Firma en lote: POST /api/drafts/batch-sign
 *   body: { draftIds: [...], pin: '****' }
 *   Requiere PIN válido. Transiciona cada DRAFT → OFICIAL.
 */
const OdontogramaModel = require('../models/odontograma');
const Periodontogram = require('../models/periodontogram');
const Exam = require('../models/exam');
const Patient = require('../models/patient');
const Usuario = require('../models/users');
const auditLogger = require('../middlewares/auditLogger');
const { normalizeRole, isAdminRole, hasPermission, getEffectivePermissions } = require('../utils/permissions');
const { computeContentHash } = require('../utils/signing');

// Roles autorizados a firmar drafts (NOM-013). Admin/superadmin/doctor_admin
// pueden firmar como capacidad administrativa. Asistente NO firma.
const SIGNING_ROLES = new Set(['doctor', 'doctor_admin', 'administrador', 'superadmin', 'admin']);

// Mapa de modelos clínicos top-level que soportan borradores
const DRAFT_MODELS = {
  odontograma:     { model: OdontogramaModel, fieldName: 'estado',          resourceTypeForHash: 'odontograma' },
  periodontograma: { model: Periodontogram,   fieldName: 'estadoRegistro',  resourceTypeForHash: 'periodontograma' },
  examen:          { model: Exam,             fieldName: 'estadoRegistro',  resourceTypeForHash: 'examen' },
};

// Marca para el resourceType de notas de evolución (subdoc de Patient).
const NOTE_RESOURCE = 'nota_evolucion';

// Detectar modelo y campo de estado por resourceType
function resolveModel(resourceType) {
  return DRAFT_MODELS[resourceType] || null;
}

// Verifica que el usuario pueda firmar (rol + permission).
function canSign(user) {
  const userPerms = getEffectivePermissions(user);
  const hasPerm = hasPermission(userPerms, ['draft.approve', 'drafts.batch_sign']);
  const role = normalizeRole(user?.role);
  return hasPerm && SIGNING_ROLES.has(role);
}

// ── Helpers para notas de evolución (subdoc en Patient) ──────────
async function listNoteDrafts({ isAdmin, userId, isApprover }) {
  // Filtro de paciente: traemos todos los pacientes que tienen al menos
  // una nota BORRADOR no eliminada. Luego filtramos las notas dentro.
  const patients = await Patient.find({
    deletedAt: null,
    'notas_evolucion.estadoRegistro': 'BORRADOR'
  }).select('_id primer_nombre apellido_paterno apellido_materno notas_evolucion').lean();

  const out = [];
  for (const p of patients) {
    for (const n of (p.notas_evolucion || [])) {
      if (n.estadoRegistro !== 'BORRADOR') continue;
      if (n.deletedAt) continue;
      // Si NO es admin ni approver, sólo ve sus propias notas.
      if (!isAdmin && !isApprover && userId && String(n.creadoPor) !== String(userId)) continue;
      out.push({
        _id: n._id,
        resourceType: NOTE_RESOURCE,
        patientId: p._id,
        appointmentId: n.appointmentId || null,
        creadoPor: n.creadoPor || null,
        createdAt: n.fecha || null,
        resumen: `Nota #${n.numero_procedimiento} — ${(n.procedimiento || n.observaciones || '').slice(0, 80)}`,
        rechazoMotivo: n.rechazoMotivo || null,
        rechazadoEn: n.rechazadoEn || null,
      });
    }
  }
  return out;
}

// Localiza una nota subdoc por su _id. Devuelve { patient, note } o null.
async function findNoteSubdoc(noteId) {
  const patient = await Patient.findOne({ 'notas_evolucion._id': noteId, deletedAt: null });
  if (!patient) return null;
  const note = patient.notas_evolucion.id(noteId);
  if (!note || note.deletedAt) return null;
  return { patient, note };
}

/**
 * GET /api/drafts — Listar borradores pendientes.
 *
 * Visibilidad:
 *   - Admin (administrador / superadmin / doctor_admin): ve TODOS los drafts.
 *   - Usuario con permiso `draft.approve` o `drafts.batch_sign` (típicamente
 *     doctor): ve TODOS los drafts pendientes — éste es el flujo del
 *     asistente→doctor handoff. Antes el filtro `creadoPor:doctorId` ocultaba
 *     los drafts creados por asistentes (BUG-C2).
 *   - Resto: sólo los drafts que el propio usuario creó.
 */
const listDrafts = async (req, res) => {
  try {
    const drafts = [];
    const role = normalizeRole(req.user?.role);
    const isAdmin = isAdminRole(role);
    const userId = req.user?.id || null;
    const userPerms = getEffectivePermissions(req.user);
    const isApprover = hasPermission(userPerms, ['draft.approve', 'drafts.batch_sign']);

    // Top-level models (odontograma, periodontograma, examen)
    for (const [type, { model, fieldName }] of Object.entries(DRAFT_MODELS)) {
      const filter = { [fieldName]: 'BORRADOR' };
      const schemaPaths = model.schema?.paths || {};
      if (schemaPaths.deletedAt) filter.deletedAt = null;

      // Sin admin ni permiso de aprobador → sólo lo propio.
      if (!isAdmin && !isApprover && userId) {
        filter.creadoPor = userId;
      }

      const docs = await model.find(filter)
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();

      docs.forEach(doc => {
        drafts.push({
          _id: doc._id,
          resourceType: type,
          patientId: doc.patientId || doc.paciente_id || doc.patient || null,
          appointmentId: doc.appointmentId || null,
          creadoPor: doc.creadoPor || null,
          createdAt: doc.createdAt,
          resumen: doc.nombre || doc.type || type,
          rechazoMotivo: doc.rechazoMotivo || null,
          rechazadoEn: doc.rechazadoEn || null,
        });
      });
    }

    // Notas de evolución (subdocs en Patient) — BUG-C1: antes faltaba este
    // listado, los doctores no podían ver notas BORRADOR de sus asistentes.
    const noteDrafts = await listNoteDrafts({ isAdmin, userId, isApprover });
    drafts.push(...noteDrafts);

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

    // Verificar rol del firmante — defensa en profundidad sobre permisos
    // (BUG-M1). Asistente no debe poder firmar aunque tenga el permission.
    if (!canSign(req.user)) {
      return res.status(403).json({ message: 'No tiene permiso para firmar borradores' });
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

    // ── Notas de evolución (subdoc) ────────────────────────────
    if (resourceType === NOTE_RESOURCE) {
      const found = await findNoteSubdoc(id);
      if (!found) return res.status(404).json({ message: 'Borrador no encontrado' });
      const { patient, note } = found;
      if (note.estadoRegistro !== 'BORRADOR') {
        return res.status(400).json({ message: 'El registro no está en estado BORRADOR' });
      }

      note.estadoRegistro = 'OFICIAL';
      note.firmadoPor = req.user.id;
      note.firmadoEn = new Date();
      note.firmaDesactualizada = false;
      // Limpiar marca de rechazo si la había.
      note.rechazadoEn = null;
      note.rechazadoPor = null;
      note.rechazoMotivo = null;
      await patient.save();

      await auditLogger.registrarManual(req, 'borrador_aprobado', {
        resourceType: NOTE_RESOURCE,
        resourceId: note._id,
        patientId: patient._id,
      });

      return res.json({ message: 'Borrador firmado correctamente', noteId: note._id });
    }

    // ── Modelos top-level ──────────────────────────────────────
    const resolved = resolveModel(resourceType);
    if (!resolved) {
      return res.status(400).json({ message: `Tipo de recurso '${resourceType}' no soporta borradores` });
    }

    const { model, fieldName, resourceTypeForHash } = resolved;
    const doc = await model.findById(id);
    if (!doc) {
      return res.status(404).json({ message: 'Borrador no encontrado' });
    }

    if (doc[fieldName] !== 'BORRADOR') {
      return res.status(400).json({ message: 'El registro no está en estado BORRADOR' });
    }

    // Transicionar BORRADOR → OFICIAL + snapshot del contentHash (BUG-M2:
    // antes no se recomputaba, dejando el doc OFICIAL sin hash actualizado).
    doc[fieldName] = 'OFICIAL';
    doc.firmadoPor = req.user.id;
    doc.firmadoEn = new Date();
    doc.autorizadoPor = req.user.id;
    try {
      doc.contentHash = computeContentHash(doc, resourceTypeForHash);
      if (doc.schema?.path('firmaDesactualizada')) doc.firmaDesactualizada = false;
    } catch (hashErr) {
      console.warn('[signDraft] No se pudo calcular contentHash:', hashErr.message);
    }
    // Limpia campos de rechazo previo si los hubiera.
    if (doc.schema?.path('rechazoMotivo')) {
      doc.rechazoMotivo = null;
      doc.rechazadoEn = null;
      doc.rechazadoPor = null;
    }

    await doc.save();

    await auditLogger.registrarManual(req, 'borrador_aprobado', {
      resourceType,
      resourceId: doc._id,
      patientId: doc.patientId || doc.paciente_id || null,
      detalles: { contentHash: doc.contentHash || null },
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

    // BUG-M1: validar rol del firmante.
    if (!canSign(req.user)) {
      return res.status(403).json({ message: 'No tiene permiso para firmar borradores' });
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

        // Notas de evolución (subdoc)
        if (resourceType === NOTE_RESOURCE) {
          const found = await findNoteSubdoc(id);
          if (!found) {
            errores.push({ id, resourceType, error: 'No encontrado' });
            continue;
          }
          const { patient, note } = found;
          if (note.estadoRegistro !== 'BORRADOR') {
            errores.push({ id, resourceType, error: 'No está en estado BORRADOR' });
            continue;
          }
          note.estadoRegistro = 'OFICIAL';
          note.firmadoPor = req.user.id;
          note.firmadoEn = new Date();
          note.firmaDesactualizada = false;
          note.rechazadoEn = null;
          note.rechazadoPor = null;
          note.rechazoMotivo = null;
          await patient.save();
          aprobados.push(note._id);
          resultados.push({ id: note._id, resourceType, status: 'aprobado' });
          continue;
        }

        const resolved = resolveModel(resourceType);
        if (!resolved) {
          errores.push({ id, resourceType, error: 'Tipo no soportado' });
          continue;
        }

        const { model, fieldName, resourceTypeForHash } = resolved;
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
        try {
          doc.contentHash = computeContentHash(doc, resourceTypeForHash);
          if (doc.schema?.path('firmaDesactualizada')) doc.firmaDesactualizada = false;
        } catch (hashErr) {
          console.warn('[batchSign] No se pudo calcular contentHash:', hashErr.message);
        }
        if (doc.schema?.path('rechazoMotivo')) {
          doc.rechazoMotivo = null;
          doc.rechazadoEn = null;
          doc.rechazadoPor = null;
        }
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

    const motivoTrim = motivo.trim();
    const now = new Date();

    // ── Notas de evolución (subdoc) ────────────────────────────
    if (resourceType === NOTE_RESOURCE) {
      const found = await findNoteSubdoc(id);
      if (!found) return res.status(404).json({ message: 'Borrador no encontrado' });
      const { patient, note } = found;
      if (note.estadoRegistro !== 'BORRADOR') {
        return res.status(400).json({ message: 'El registro no está en estado BORRADOR' });
      }
      note.rechazadoEn = now;
      note.rechazadoPor = req.user.id;
      note.rechazoMotivo = motivoTrim;
      note.modificadoPor = req.user.id;
      note.modificadoEn = now;
      await patient.save();

      await auditLogger.registrarManual(req, 'borrador_rechazado', {
        resourceType: NOTE_RESOURCE,
        resourceId: note._id,
        patientId: patient._id,
        motivo: motivoTrim,
      });

      return res.json({ message: 'Borrador rechazado', motivo: motivoTrim });
    }

    // ── Modelos top-level ──────────────────────────────────────
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

    // BUG-A6: persistir el motivo en el doc (antes sólo en AuditLog) — el
    // creador del borrador no tenía cómo verlo.
    if (doc.schema?.path('rechazoMotivo')) {
      doc.rechazadoEn = now;
      doc.rechazadoPor = req.user.id;
      doc.rechazoMotivo = motivoTrim;
    }
    doc.modificadoPor = req.user.id;
    doc.modificadoEn = now;
    await doc.save();

    await auditLogger.registrarManual(req, 'borrador_rechazado', {
      resourceType,
      resourceId: doc._id,
      patientId: doc.patientId || doc.paciente_id || null,
      motivo: motivoTrim,
    });

    return res.json({ message: 'Borrador rechazado', motivo: motivoTrim });
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

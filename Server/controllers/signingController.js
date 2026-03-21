/**
 * Controlador de Firma Electrónica — DentiaCore
 *
 * POST /api/sign/:resourceType/:resourceId
 *
 * Flujo:
 * 1. Verifica que el usuario tenga rol clínico (doctor o superadmin)
 * 2. Verifica el PIN del usuario (doble factor de autenticidad)
 * 3. Calcula el contentHash del documento al momento de la firma
 * 4. Actualiza firmadoPor, firmadoEn, contentHash en el documento
 * 5. Registra evento firma_electronica en AuditLog
 *
 * NOM-004-SSA3-2012 Art. 5.10 / NOM-024-SSA3-2012
 */
const mongoose = require('mongoose');
const Usuario = require('../models/users');
const auditLogger = require('../middlewares/auditLogger');
const { computeContentHash, getModelName } = require('../utils/signing');

/**
 * POST /api/sign/:resourceType/:resourceId
 * Body: { pin: string }
 */
const signRecord = async (req, res, next) => {
  try {
    const { resourceType, resourceId } = req.params;
    const { pin } = req.body;

    // ── Validaciones básicas ──────────────────────────────────
    if (!pin || typeof pin !== 'string') {
      return res.status(400).json({ error: 'PIN es requerido' });
    }

    if (!mongoose.Types.ObjectId.isValid(resourceId)) {
      return res.status(400).json({ error: 'resourceId inválido' });
    }

    const modelName = getModelName(resourceType);
    if (!modelName) {
      return res.status(400).json({ error: `Tipo de recurso "${resourceType}" no soportado para firma` });
    }

    const Model = mongoose.models[modelName];
    if (!Model) {
      return res.status(500).json({ error: `Modelo ${modelName} no disponible` });
    }

    // ── Verificar PIN del usuario ─────────────────────────────
    const usuario = await Usuario.findById(req.user.id);
    if (!usuario) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    if (!usuario.pinHash) {
      return res.status(400).json({ error: 'No tiene PIN configurado. Configure su PIN antes de firmar.' });
    }

    const pinValido = await usuario.verificarPin(pin);
    if (!pinValido) {
      // Registrar intento fallido
      await auditLogger.registrarManual(req, 'pin_fallo', {
        resourceType,
        resourceId,
        detalles: { contexto: 'firma_electronica' },
      });

      return res.status(401).json({ error: 'PIN incorrecto' });
    }

    // ── Buscar y firmar el documento ──────────────────────────
    const doc = await Model.findById(resourceId);
    if (!doc) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    // Verificar que no esté eliminado (soft-delete)
    if (doc.deletedAt) {
      return res.status(400).json({ error: 'No se puede firmar un documento eliminado' });
    }

    // Calcular hash del contenido al momento de la firma
    const contentHash = computeContentHash(doc, resourceType);

    // Actualizar campos de firma
    doc.firmadoPor = req.user.id;
    doc.firmadoEn = new Date();
    doc.contentHash = contentHash;
    doc.firmaDesactualizada = false;

    await doc.save();

    // ── Registrar en audit log ────────────────────────────────
    await auditLogger.registrarManual(req, 'firma_electronica', {
      resourceType,
      resourceId: doc._id,
      patientId: doc.paciente_id || doc.patient || doc.patientId || null,
      detalles: {
        contentHash,
        firmaDigitalUrl: usuario.firmaDigitalUrl || null,
      },
    });

    return res.json({
      message: 'Documento firmado exitosamente',
      firmadoPor: req.user.id,
      firmadoEn: doc.firmadoEn,
      contentHash,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/sign/:resourceType/:resourceId/status
 * Devuelve el estado de firma de un documento.
 */
const getSignatureStatus = async (req, res, next) => {
  try {
    const { resourceType, resourceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(resourceId)) {
      return res.status(400).json({ error: 'resourceId inválido' });
    }

    const modelName = getModelName(resourceType);
    if (!modelName) {
      return res.status(400).json({ error: `Tipo de recurso "${resourceType}" no soportado` });
    }

    const Model = mongoose.models[modelName];
    if (!Model) {
      return res.status(500).json({ error: `Modelo ${modelName} no disponible` });
    }

    const doc = await Model.findById(resourceId)
      .select('firmadoPor firmadoEn contentHash firmaDesactualizada')
      .populate('firmadoPor', 'nombre email cedulaProfesional firmaDigitalUrl')
      .lean();

    if (!doc) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    return res.json({
      signed: !!doc.firmadoPor,
      firmadoPor: doc.firmadoPor || null,
      firmadoEn: doc.firmadoEn || null,
      contentHash: doc.contentHash || null,
      firmaDesactualizada: doc.firmaDesactualizada || false,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { signRecord, getSignatureStatus };

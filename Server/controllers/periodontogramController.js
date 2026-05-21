const Patient = require('../models/patient');
const Periodontogram = require('../models/periodontogram');
const PeriodontogramHistory = require('../models/periodontogramHistory');
const mongoose = require('mongoose');
const { resolvePatientAppointmentId } = require('../utils/appointmentValidation');
const { isAdminRole } = require('../utils/permissions');
const PeriodontogramValidationMiddleware = require('../middlewares/periodontogramValidation');
const { validatePeriodontogramData } = require('../schemas/unified-periodontogram-schema');
const { UniversalToothValidator } = require('../utils/UniversalToothValidator');
const {
  adaptTeethFromClientPayload,
  normalizeFurcaInTeeth,
  buildArcadasFromTeeth
} = require('../utils/periodontogramAdaptors');

// Helper local: detectar claves legacy no canónicas en cualquier nivel del payload
// Se evita duplicación: no existe helper similar en utils ni middleware de este controlador
const FORBIDDEN_LEGACY_KEYS = new Set([
  'placa',
  'sangrado',
  'supuracion',
  'anchuraEncia',
  'margenGingival',
  'profundidadSondaje',
  'vestibular',
  'palatino',
  'lingual',
  'lingualPalatino'
]);
function collectForbiddenKeys(obj, path = '', acc = []) {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      collectForbiddenKeys(obj[i], `${path}[${i}]`, acc);
    }
    return acc;
  }
  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      if (FORBIDDEN_LEGACY_KEYS.has(key)) acc.push(currentPath);
      collectForbiddenKeys(obj[key], currentPath, acc);
    }
  }
  return acc;
}

function mapTeethToPlain(teeth) {
  if (!teeth) return {};
  if (teeth instanceof Map) {
    return Object.fromEntries(teeth);
  }
  if (typeof teeth.toObject === 'function') {
    return teeth.toObject();
  }
  return teeth;
}

function statisticsToPlain(statistics) {
  if (!statistics) return {};
  if (typeof statistics.toObject === 'function') {
    return statistics.toObject();
  }
  return { ...statistics };
}

// Usar middlewares centralizados
const validatePatientId = PeriodontogramValidationMiddleware.validatePatientId();
const validatePatientIdAsId = PeriodontogramValidationMiddleware.validatePatientIdAsId();
const checkValidationErrors = PeriodontogramValidationMiddleware.checkValidationErrors();
// REMOVIDO: validateToothUpdate y validateFullPeriodontogramUpdate - no se procesan datos de dientes individuales



/**
 * Helper function: Verificar y crear periodontograma si no existe
 * @param {string} patientId - ID del paciente
 * @param {string} userId - ID del usuario (opcional)
 * @returns {Object} - Periodontograma existente o recién creado
 */
const ensurePeriodontogramExists = async (patientId, userId = null) => {
  try {
    // Buscar periodontograma existente
    let periodontogram = await Periodontogram.findOne({ patient: patientId });
    
    if (!periodontogram) {
      console.log('🦷 Periodontograma no encontrado, creando uno nuevo para paciente:', patientId);
      
      // Verificar que el paciente existe
      const patient = await Patient.findById(patientId);
      if (!patient) {
        throw new Error('Paciente no encontrado');
      }

      // Crear periodontograma inicial
      periodontogram = await Periodontogram.createInitial(patientId, userId);
      console.log('✅ Periodontograma inicial creado exitosamente con ID:', periodontogram._id);
    }
    
    return periodontogram;
  } catch (error) {
    console.error('❌ Error en ensurePeriodontogramExists:', error.message);
    throw error;
  }
};

/**
 * Obtener el periodontograma de un paciente.
 * Se espera que en la URL se reciba el id del paciente.
 */
exports.getPeriodontogram = [
  validatePatientIdAsId,
  checkValidationErrors,
  async (req, res) => {
    try {
      // Rechazar cualquier intento de enviar datos legacy por query
      const legacyInQuery = collectForbiddenKeys(req.query || {});
      if (legacyInQuery.length > 0) {
        return res.status(400).json({ success: false, message: `Parámetros de consulta no permitidos: ${legacyInQuery.join(', ')}` });
      }
      const { id } = req.params;
      const userId = req.user?.id || null;
      
      // Asegurar que existe un periodontograma, crearlo si no existe
      let periodontogram;
      try {
        periodontogram = await ensurePeriodontogramExists(id, userId);
      } catch (ensureError) {
        console.error('❌ Error al asegurar periodontograma:', ensureError.message);
        return res.status(404).json({
          success: false,
          message: ensureError.message === 'Paciente no encontrado' ? 'Paciente no encontrado' : 'Error al crear periodontograma'
        });
      }
      
      // Obtener periodontograma con consulta optimizada
      const optimizedPeriodontogram = await Periodontogram.findById(periodontogram._id)
        .select('-history') // Excluir historial para mejorar rendimiento
        .populate('patient', 'primer_nombre primer_apellido email')
        .lean()
        .maxTimeMS(15000) // Timeout de 15 segundos para esta consulta específica
        .exec();
      
      if (!optimizedPeriodontogram) {
        console.log('⚠️ Error inesperado: Periodontograma no encontrado después de creación');
        return res.status(500).json({
          success: false,
          message: 'Error interno del servidor'
        });
      }
       
       // Datos ya optimizados con .lean() y sin historial
       const sanitizedData = optimizedPeriodontogram;
       
       res.status(200).json({
         success: true,
         data: sanitizedData
       });
      
    } catch (error) {
      // Manejar timeout específicamente
      if (error.name === 'MongooseError' && error.message.includes('buffering timed out')) {

        return res.status(408).json({
          success: false,
          message: 'La consulta tardó demasiado tiempo. Por favor, intente nuevamente.'
        });
      }
      

      
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor al obtener el periodontograma'
      });
    }
  }
];





/**
 * Crear el periodontograma inicial para un paciente.
 * Se espera que en req.body llegue el estado inicial.
 */
exports.createInitialPeriodontogram = async (req, res) => {
    console.log('🔍 DEBUG createInitialPeriodontogram:');
    console.log('  - req.params:', req.params);
    console.log('  - req.params.id:', req.params.id);
    console.log('  - req.body:', req.body);
    console.log('  - req.url:', req.url);
    console.log('  - req.originalUrl:', req.originalUrl);
    
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      

      
      // Rechazar claves legacy en body (aunque no se procesen dientes aquí)
      const legacyInBody = collectForbiddenKeys(req.body || {});
      if (legacyInBody.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Formato canónico requerido. Se detectaron claves legacy no permitidas: ${legacyInBody.join(', ')}`
        });
      }
      // Verificar que el paciente existe
      const patient = await Patient.findById(id);
      if (!patient) {

        return res.status(404).json({
          success: false,
          message: 'Paciente no encontrado'
        });
      }
      
      // Verificar que no existe ya un periodontograma
      const existingPeriodontogram = await Periodontogram.findOne({ patient: id });
      if (existingPeriodontogram) {

        return res.status(409).json({
          success: false,
          message: 'Ya existe un periodontograma para este paciente'
        });
      }
      
      // Crear nuevo periodontograma usando el método estático del modelo
      // Asegurar que userId sea null si no es un ObjectId válido
      const validUserId = userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null;
      const newPeriodontogram = await Periodontogram.createInitial(id, validUserId);

      // Valida pertenencia al paciente — descarta cita ajena en silencio.
      const reqAppointmentId = await resolvePatientAppointmentId(req.body?.appointmentId, id);
      await PeriodontogramHistory.create({
        patient: newPeriodontogram.patient,
        periodontogram: newPeriodontogram._id,
        versionName: newPeriodontogram.current.versionName,
        teeth: mapTeethToPlain(newPeriodontogram.current.teeth),
        statistics: statisticsToPlain(newPeriodontogram.current.statistics),
        appointmentId: reqAppointmentId,
        createdBy: validUserId
      });
      if (reqAppointmentId) {
        newPeriodontogram.appointmentId = reqAppointmentId;
        await newPeriodontogram.save();
      }
      

      
      res.status(201).json({
        success: true,
        message: 'Periodontograma inicial creado exitosamente',
        data: {
          id: newPeriodontogram._id,
          patient: newPeriodontogram.patient,
          status: newPeriodontogram.status,
          createdAt: newPeriodontogram.createdAt
        }
      });
      
    } catch (_error) {
      
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor al crear el periodontograma'
      });
    }
  };



/**
 * Actualizar el periodontograma completo (todos los datos).
 */
exports.updateFullPeriodontogram = [
  validatePatientIdAsId,
  checkValidationErrors,
  async (req, res) => {
    console.log('🔍 DEBUG updateFullPeriodontogram:');
    console.log('  - req.params:', req.params);
    console.log('  - req.body keys:', Object.keys(req.body));
    console.log('  - teeth count:', req.body.teeth ? Object.keys(req.body.teeth).length : 0);
    
    try {
      const { id } = req.params;
      const { date, teeth } = req.body;
      const userId = req.user?.id || null;

      // Rechazar claves legacy si vienen en este endpoint (aunque no se procesen dientes aquí)
      const legacyInUpdate = collectForbiddenKeys(req.body);
      if (legacyInUpdate.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Formato canónico requerido. Claves legacy no permitidas en update: ${legacyInUpdate.join(', ')}`
        });
      }

      // Si llegan datos de dientes, informar que se debe usar el endpoint específico
      if (teeth && typeof teeth === 'object' && Object.keys(teeth).length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Para actualizar datos de dientes, use PUT /api/patients/:id/periodontogram/data'
        });
      }
      
      console.log('  - patientId from params:', id);
      console.log('  - userId:', userId);
      
      // Buscar periodontograma
      console.log('  - Buscando periodontograma...');
      let periodontogram = await Periodontogram.findOne({ patient: id });
      console.log('  - Periodontograma encontrado:', !!periodontogram);

      // NOM-024: la inmutabilidad aplica sólo a registros REALMENTE firmados
      // (`firmadoEn != null`). Antes el guard usaba `estadoRegistro === 'OFICIAL'`
      // pero el default del schema era OFICIAL → cualquier doc creado vía
      // `createInitial` nacía bloqueado sin haberse firmado nunca.
      if (periodontogram && periodontogram.firmadoEn) {
        return res.status(403).json({
          success: false,
          message: 'No se puede modificar un periodontograma firmado. Use addendum para correcciones.'
        });
      }

      // Borrador: solo el creador o un admin pueden modificar
      if (periodontogram && !isAdminRole(req.user?.role)) {
        if (periodontogram.creadoPor && periodontogram.creadoPor.toString() !== req.user?.id) {
          return res.status(403).json({
            success: false,
            message: 'Solo el creador o un administrador pueden modificar este borrador'
          });
        }
      }

      if (!periodontogram) {
        console.log('  - Creando nuevo periodontograma...');
        try {
          // Verificar que el paciente existe antes de crear el periodontograma
          const patient = await Patient.findById(id);
          if (!patient) {
            console.log('  - Paciente no encontrado:', id);
            return res.status(404).json({
              success: false,
              message: 'Paciente no encontrado'
            });
          }
          
          // Si no existe, crear uno nuevo
          periodontogram = await Periodontogram.createInitial(id, userId);
          console.log('  - Nuevo periodontograma creado exitosamente');
        } catch (createError) {
          console.error('  - Error creando periodontograma:', createError.message);
          throw new Error(`Error al crear periodontograma inicial: ${createError.message}`);
        }
      }
      
      // Actualizar datos básicos
      console.log('  - Actualizando metadatos...');
      if (date && periodontogram.initial?.metadata) {
        periodontogram.initial.metadata.lastModified = new Date(date);
        periodontogram.initial.metadata.modifiedBy = userId;
        periodontogram.markModified('initial.metadata');
      }
      
      // Procesamiento de datos de dientes individuales ELIMINADO - solo imágenes y estadísticas
      
      // Guardar cambios
      console.log('  - Guardando cambios...');
      await periodontogram.save();
      console.log('  - Cambios guardados exitosamente');
      

      
      res.status(200).json({
        success: true,
        message: 'Periodontograma actualizado exitosamente',
        data: {
          periodontogramId: periodontogram._id,
          statistics: statisticsToPlain(periodontogram.current.statistics)
        }
      });
      
    } catch (error) {
      console.error('❌ Error en updateFullPeriodontogram:');
      console.error('  - Error message:', error.message);
      console.error('  - Error stack:', error.stack);
      console.error('  - Error name:', error.name);
      
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor al actualizar el periodontograma'
      });
    }
  }
];

/**
 * Obtener historial de cambios del periodontograma
 */
exports.getPeriodontogramHistory = [
  validatePatientIdAsId,
  checkValidationErrors,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10, ...restQuery } = req.query;
      // Rechazar claves legacy por query adicionales a paginación
      const legacyInQuery = collectForbiddenKeys(restQuery || {});
      if (legacyInQuery.length > 0) {
        return res.status(400).json({ success: false, message: `Parámetros de consulta no permitidos: ${legacyInQuery.join(', ')}` });
      }
      
      const periodontogram = await Periodontogram.findOne({ patient: id }).lean();

      if (!periodontogram) {
        return res.status(404).json({
          success: false,
          message: 'Periodontograma no encontrado'
        });
      }

      const sanitizedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
      const sanitizedPage = Math.max(parseInt(page, 10) || 1, 1);
      const skip = (sanitizedPage - 1) * sanitizedLimit;

      const [historyEntries, totalEntries] = await Promise.all([
        PeriodontogramHistory.find({ patient: id })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(sanitizedLimit)
          .populate('createdBy', 'nombre email')
          .lean(),
        PeriodontogramHistory.countDocuments({ patient: id })
      ]);

      res.status(200).json({
        success: true,
        data: {
          history: historyEntries,
          pagination: {
            currentPage: sanitizedPage,
            totalPages: Math.ceil(totalEntries / sanitizedLimit),
            totalEntries,
            hasNext: skip + sanitizedLimit < totalEntries,
            hasPrev: skip > 0
          }
        }
      });
      
    } catch (_error) {

      
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }
];

/**
 * Eliminar periodontograma (soft delete)
 */
exports.deletePeriodontogram = [
  validatePatientIdAsId,
  checkValidationErrors,
  async (req, res) => {
    try {
      // Rechazar claves legacy si vienen en query/body
      const legacyInQuery = collectForbiddenKeys(req.query || {});
      if (legacyInQuery.length > 0) {
        return res.status(400).json({ success: false, message: `Parámetros de consulta no permitidos: ${legacyInQuery.join(', ')}` });
      }
      const legacyInBody = collectForbiddenKeys(req.body || {});
      if (legacyInBody.length > 0) {
        return res.status(400).json({ success: false, message: `Formato canónico requerido. Se detectaron claves legacy no permitidas: ${legacyInBody.join(', ')}` });
      }
      const { id } = req.params;
      const userId = req.user?.id;
      

      
      const periodontogram = await Periodontogram.findOne({ patient: id });
      if (!periodontogram) {
        return res.status(404).json({
          success: false,
          message: 'Periodontograma no encontrado'
        });
      }

      // NOM-024: sólo los registros realmente firmados son inmutables.
      if (periodontogram.firmadoEn) {
        return res.status(403).json({
          success: false,
          message: 'No se puede eliminar un periodontograma firmado'
        });
      }

      // Borrador: solo el creador o un admin pueden eliminar
      if (!isAdminRole(req.user?.role)) {
        if (periodontogram.creadoPor && periodontogram.creadoPor.toString() !== userId) {
          return res.status(403).json({
            success: false,
            message: 'Solo el creador o un administrador pueden eliminar este borrador'
          });
        }
      }
      
      // Soft delete - cambiar estado a archived
      periodontogram.status = 'archived';
      await periodontogram.save();

      // Generar un nombre único con milisegundos y verificar colisión por paciente
      const pad = (n) => String(n).padStart(2, '0');
      const buildName = (d, suffix = '') => {
        return `Archivado_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}${suffix}`;
      };
      let attempt = 0;
      let archiveVersionName;
      while (true) {
        const now = new Date();
        // incluir ms solo para variar si hay colisión (como sufijo)
        const suffix = attempt === 0 ? '' : `-${now.getMilliseconds()}`;
        const cand = buildName(now, suffix);
        const exists = await PeriodontogramHistory.exists({ patient: id, versionName: cand });
        if (!exists) { archiveVersionName = cand; break; }
        attempt += 1;
        if (attempt > 5) { // fallback
          archiveVersionName = `${cand}-${Math.random().toString(36).slice(2, 6)}`;
          break;
        }
      }
      const archiveStats = statisticsToPlain(periodontogram.current.statistics);
      const archiveTeeth = mapTeethToPlain(periodontogram.current.teeth);
      const validUserId = userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null;

      await PeriodontogramHistory.create({
        patient: periodontogram.patient,
        periodontogram: periodontogram._id,
        versionName: archiveVersionName,
        teeth: archiveTeeth,
        statistics: archiveStats,
        createdBy: validUserId
      });
      

      
      res.status(200).json({
        success: true,
        message: 'Periodontograma archivado exitosamente'
      });
      
    } catch (_error) {

      
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }
];

// Configuración de multer eliminada - solo manejo de datos JSON








// Exportar middlewares de validación para uso en rutas
exports.getPeriodontogramSchemas = [
  validatePatientIdAsId,
  checkValidationErrors,
  (req, res) => {
    try {
      // Rechazar cualquier intento de enviar datos legacy por query
      const legacyInQuery = collectForbiddenKeys(req.query || {});
      if (legacyInQuery.length > 0) {
        return res.status(400).json({ success: false, message: `Parámetros de consulta no permitidos: ${legacyInQuery.join(', ')}` });
      }
      const schemas = UniversalToothValidator.getJsonSchemas();
      return res.status(200).json({ success: true, data: schemas });
    } catch (error) {
      console.error('Error obteniendo JSON Schemas del periodontograma:', error);
      return res.status(500).json({ success: false, message: 'Error interno del servidor al obtener los JSON Schemas' });
    }
  }
];








/**
 * Guardar periodontograma de forma atómica (ambas imágenes en una transacción)
 */


/**
 * PUT /api/patients/:id/periodontogram/data
 * Guarda el JSON completo de un periodontograma (teeth + statistics).
 */
// Genera un versionName por defecto inequívoco. El formato previo
// (`toISOString().replace(/[:.-]/g, '')`) repetía resolución de segundo y
// chocaba con el índice único en (patient, versionName) bajo doble-click o
// reintentos. Ahora incluye ms + sufijo random de 6 hex chars.
const generateDefaultVersionName = () => {
  const iso = new Date().toISOString().replace(/[:.-]/g, ''); // ej. 20260520T143012345Z
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${iso}_${suffix}`;
};

exports.savePeriodontogramData = [
  validatePatientIdAsId,
  checkValidationErrors,
  async (req, res) => {
    const session = await mongoose.startSession();
    try {
      const patientId = req.params.id;
      const userId = req.user?.id || null;
      const payload = req.body;

      // ✅ Adaptar del payload del Front (inglés/bloques) a estructura unificada (caras con mediciones)
      const adaptedTeeth = adaptTeethFromClientPayload(payload.teeth || {});
      // ✅ Normalizar furca (soporta furca1/furca2 planos)
      const normalizedTeethInput = normalizeFurcaInTeeth(adaptedTeeth);

      // ✅ ESQUEMA UNIFICADO - Validar datos sin transformaciones
      console.log('📋 Validando datos con esquema unificado:', payload);

      const validatedData = validatePeriodontogramData({
        pacienteId: patientId,
        teeth: normalizedTeethInput,
        statistics: payload.statistics || {},
        version: payload.versionName || payload.version || generateDefaultVersionName()
      });

      console.log('✅ Datos validados correctamente:', validatedData);

      const periodontogram = await ensurePeriodontogramExists(patientId, userId);

      // NOM-024: la inmutabilidad aplica sólo a registros REALMENTE firmados
      // (`firmadoEn != null`), no al campo `estadoRegistro` que antes podía
      // auto-marcarse OFICIAL por el default del schema.
      if (periodontogram.firmadoEn) {
        return res.status(403).json({
          success: false,
          message: 'No se puede modificar un periodontograma firmado. Use addendum para correcciones.'
        });
      }

      // Borrador: solo el creador o un admin pueden modificar
      if (!isAdminRole(req.user?.role)) {
        if (periodontogram.creadoPor && periodontogram.creadoPor.toString() !== userId) {
          return res.status(403).json({
            success: false,
            message: 'Solo el creador o un administrador pueden modificar este borrador'
          });
        }
      }

      // Concurrencia optimista: si el cliente envió expectedUpdatedAt y el
      // doc fue tocado por otro usuario/pestaña → 409 para que recargue.
      const expectedUpdatedAt = req.body?.expectedUpdatedAt;
      if (expectedUpdatedAt) {
        const currentTs = new Date(periodontogram.updatedAt).getTime();
        const expectedTs = new Date(expectedUpdatedAt).getTime();
        if (Number.isNaN(expectedTs) || currentTs !== expectedTs) {
          return res.status(409).json({
            success: false,
            code: 'PERIODONTOGRAMA_STALE',
            message: 'El periodontograma fue modificado por otro usuario. Recarga para ver los cambios antes de guardar.',
            currentUpdatedAt: periodontogram.updatedAt
          });
        }
      }

      // NO auto-OFICIAL: cada save deja el doc en BORRADOR. El tránsito a
      // OFICIAL ocurre SÓLO al firmar con PIN vía POST /api/sign/
      // periodontograma/:id (signingController), que es quien setea
      // firmadoEn/firmadoPor/contentHash. Cualquier doc legacy con
      // estadoRegistro:'OFICIAL' pero sin firmadoEn (default OFICIAL del
      // schema antes del fix) se "auto-limpia" aquí.
      periodontogram.estadoRegistro = 'BORRADOR';
      periodontogram.creadoPor = periodontogram.creadoPor || (userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null);
      periodontogram.modificadoPor = userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null;
      periodontogram.modificadoEn = new Date();
      if (req.body._capturaExtemporanea) {
        periodontogram.capturaExtemporanea = req.body._capturaExtemporanea;
      }

      const normalizedTeeth = normalizeFurcaInTeeth(validatedData.teeth || {});
      const versionNameFromPayload = typeof payload.versionName === 'string' ? payload.versionName.trim() : payload.versionName;
      const versionName = versionNameFromPayload || validatedData.version || generateDefaultVersionName();
      const createdAt = validatedData.fechaCreacion ? new Date(validatedData.fechaCreacion) : new Date();
      const updatedAt = validatedData.fechaModificacion ? new Date(validatedData.fechaModificacion) : new Date();
      const validUserId = userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null;

      periodontogram.current.teeth = new Map(Object.entries(normalizedTeeth));
      periodontogram.markModified('current.teeth');
      periodontogram.current.versionName = versionName;
      periodontogram.current.needsStatisticsRecalc = true;
      periodontogram.current.createdAt = periodontogram.current.createdAt || createdAt;

      if (periodontogram.initial?.metadata) {
        periodontogram.initial.metadata.modifiedBy = validUserId;
        periodontogram.initial.metadata.lastModified = updatedAt;
        periodontogram.markModified('initial.metadata');
      }

      const plainTeethPreSave = mapTeethToPlain(periodontogram.current.teeth);
      const plainStatisticsPreSave = statisticsToPlain(periodontogram.current.statistics);

      // Valida pertenencia al paciente — descarta cita ajena en silencio.
      const saveAppointmentId = await resolvePatientAppointmentId(req.body?.appointmentId, patientId);
      if (saveAppointmentId) {
        periodontogram.appointmentId = saveAppointmentId;
      }

      // Transacción: History.create + periodontogram.save deben ser
      // atómicos. Antes el History se persistía aunque el main fallara,
      // dejando registros huérfanos apuntando a `current` desactualizado.
      try {
        await session.withTransaction(async () => {
          await PeriodontogramHistory.create([{
            patient: periodontogram.patient,
            periodontogram: periodontogram._id,
            versionName,
            teeth: plainTeethPreSave,
            statistics: plainStatisticsPreSave,
            appointmentId: saveAppointmentId,
            createdBy: validUserId
          }], { session });
          await periodontogram.save({ session });
        });
      } catch (txError) {
        if (txError.code === 11000) {
          return res.status(409).json({
            success: false,
            message: `Ya existe una versión con el nombre '${versionName}'. Use un nombre diferente.`
          });
        }
        throw txError;
      }

      const plainTeeth = mapTeethToPlain(periodontogram.current.teeth);
      const plainStatistics = statisticsToPlain(periodontogram.current.statistics);

      res.status(201).json({
        success: true,
        message: 'Periodontograma guardado con esquema unificado',
        version: versionName,
        versionName: versionName,
        statistics: plainStatistics,
        arcadas: buildArcadasFromTeeth(normalizedTeeth),
        // updatedAt actualizado — el cliente debe reenviarlo como
        // expectedUpdatedAt en el siguiente save para el control 409.
        updatedAt: periodontogram.updatedAt,
        estadoRegistro: periodontogram.estadoRegistro
      });
    } catch (error) {
      console.error('❌ savePeriodontogramData:', error.message);
      const statusCode = error.name === 'ValidationError' ? 400 : 500;
      res.status(statusCode).json({ success: false, message: statusCode === 500 ? 'Error interno del servidor' : error.message });
    } finally {
      session.endSession();
    }
  }
];

/**
 * GET /api/patients/:id/periodontogram/data
 * Devuelve la versión solicitada o la última.
 * Si query ?listVersions=true devuelve listado de carpetas.
 */
exports.getPeriodontogramData = [
  validatePatientIdAsId,
  checkValidationErrors,
  async (req, res) => {
    try {
      const patientId = req.params.id;
      const { version, listVersions, ...rest } = req.query;

      // Rechazar cualquier intento de enviar datos legacy por query (no aplica a body, pero prevenimos mal uso)
      const legacyInQuery = collectForbiddenKeys(rest);
      if (legacyInQuery.length > 0) {
        return res.status(400).json({ success: false, message: `Parámetros de consulta no permitidos: ${legacyInQuery.join(', ')}` });
      }
      const periodontogram = await ensurePeriodontogramExists(patientId, req.user?.id);

      if (listVersions === 'true') {
        const versions = await PeriodontogramHistory.find({ patient: patientId })
          .sort({ createdAt: -1 })
          .select('versionName createdAt updatedAt')
          .lean();

        // Dedupe por versionName preservando orden descendente
        const seen = new Set();
        const pruned = [];
        for (const v of versions) {
          const name = (v.versionName || '').trim();
          if (!name || seen.has(name)) continue;
          seen.add(name);
          pruned.push({ versionName: name, createdAt: v.createdAt, updatedAt: v.updatedAt });
        }

        return res.json({ success: true, versions: pruned });
      }

      let source = 'current';
      let baseTeeth = mapTeethToPlain(periodontogram.current.teeth);
      let baseStatistics = statisticsToPlain(periodontogram.current.statistics);
      let versionName = periodontogram.current.versionName;
      let createdAt = periodontogram.current.createdAt || periodontogram.createdAt;
      let updatedAt = periodontogram.current.updatedAt || periodontogram.updatedAt;

      if (version) {
        // En caso excepcional de versiones duplicadas con mismo nombre, tomar la más reciente
        const historyEntry = await PeriodontogramHistory.findOne({ patient: patientId, versionName: version })
          .sort({ createdAt: -1 })
          .lean();
        if (!historyEntry) {
          return res.status(404).json({ success: false, message: 'Versión solicitada no encontrada' });
        }
        source = 'history';
        baseTeeth = historyEntry.teeth || {};
        baseStatistics = historyEntry.statistics || {};
        versionName = historyEntry.versionName;
        createdAt = historyEntry.createdAt;
        updatedAt = historyEntry.updatedAt;
      }

      const normalizedTeeth = normalizeFurcaInTeeth(baseTeeth || {});
      const arcadas = buildArcadasFromTeeth(normalizedTeeth);

      return res.json({
        success: true,
        data: {
          patientId,
          versionName,
          source,
          teeth: normalizedTeeth,
          statistics: baseStatistics,
          arcadas,
          metadata: {
            createdAt,
            updatedAt
          }
        }
      });
    } catch (error) {
      console.error('❌ getPeriodontogramData:', error.message);
      const statusCode = error.name === 'ValidationError' ? 400 : 500;
      return res.status(statusCode).json({ success: false, message: statusCode === 500 ? 'Error interno del servidor' : error.message });
    }
  }
];

// Exportar middlewares de validación para uso en rutas
module.exports.validatePatientId = validatePatientId;
module.exports.checkValidationErrors = checkValidationErrors;

// Exportar función auxiliar
module.exports.ensurePeriodontogramExists = ensurePeriodontogramExists;

/**
 * GET /api/patients/:id/periodontogram/statistics
 * GET /api/patients/:id/periodontogram/statistics/:version
 * Devuelve las estadísticas actuales o de una versión específica.
 */
exports.getPeriodontogramStatistics = [
  validatePatientIdAsId,
  checkValidationErrors,
  async (req, res) => {
    try {
      const patientId = req.params.id;
      const versionParam = req.params.version;

      const periodontogram = await ensurePeriodontogramExists(patientId, req.user?.id);

      if (versionParam) {
        const historyEntry = await PeriodontogramHistory.findOne({ patient: patientId, versionName: versionParam })
          .sort({ createdAt: -1 })
          .lean();
        if (!historyEntry) {
          return res.status(404).json({ success: false, message: 'Versión solicitada no encontrada' });
        }
        return res.json({
          success: true,
          data: {
            patientId,
            versionName: historyEntry.versionName,
            statistics: historyEntry.statistics || {},
            source: 'history'
          }
        });
      }

      return res.json({
        success: true,
        data: {
          patientId,
          versionName: periodontogram.current.versionName,
          statistics: (periodontogram.current.statistics || {}),
          source: 'current'
        }
      });
    } catch (error) {
      console.error('❌ getPeriodontogramStatistics:', error.message);
      const statusCode = error.name === 'ValidationError' ? 400 : 500;
      return res.status(statusCode).json({ success: false, message: statusCode === 500 ? 'Error interno del servidor' : error.message });
    }
  }
];

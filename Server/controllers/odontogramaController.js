const {
  ValidationError,
  FileTooLargeError,
  UnsupportedMediaTypeError,
  normalizeEntry
} = require('../helpers/odontograma');
const mongoose = require('mongoose');
const OdontogramaModel = require('../models/odontograma');
const { hasPermission, getEffectivePermissions, isAdminRole } = require('../utils/permissions');
const { resolvePatientAppointmentId } = require('../utils/appointmentValidation');

// Logging gated por NODE_ENV: los console.log informativos filtraban
// patientId y otros datos a stdout en producción. console.error y
// console.warn se mantienen siempre activos.
const debugLog = process.env.NODE_ENV !== 'production' ? console.log.bind(console) : () => {};

// ——— Constantes de tipo de odontograma ————————————————————————————————————————————————
const TYPE_INITIAL = 'initial';
const TYPE_CLINIC = 'clinic';

// ——— Controladores ——————————————————————————————————————————————————————————————
const verificarOdontogramaInicial = async (req, res, next) => {
  try {
    debugLog('🔍 [verificarOdontogramaInicial] Buscando odontograma para paciente:', req.patient?.id || req.patient?._id);
    
    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      debugLog('❌ [verificarOdontogramaInicial] PatientId inválido');
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }
    
    debugLog('🔍 [verificarOdontogramaInicial] Buscando en BD con patientId:', patientId, 'type:', TYPE_INITIAL);
    const doc = await OdontogramaModel.findOne({
      patientId: patientId,
      type: TYPE_INITIAL,
      deletedAt: null
    });

    debugLog('📋 [verificarOdontogramaInicial] Documento encontrado:', {
      docExists: !!doc,
      currentExists: !!doc?.current,
      currentDatos: doc?.current?.datos,
      historyLength: doc?.history?.length
    });

    const history = (doc?.history || []).filter(v => !v.deletedAt).map(v => ({
      id: v._id,
      imageUrl: v.imageUrl,
      fecha: v.savedAt.toISOString(),
      datos: (v.datos || []).map(normalizeEntry)
    }));

    if (!doc || !doc.current) {
      debugLog('📭 [verificarOdontogramaInicial] Sin datos actuales, devolviendo vacío');
      return res.json({
        exists: false,
        imageUrl: null,
        datos: [],
        history,
        updatedAt: null
      });
    }

    // updatedAt se devuelve para que el cliente lo pase como expectedUpdatedAt
    // al guardar; es la base del control de concurrencia 409.
    const responseData = {
      exists: true,
      imageUrl: doc.current.imageUrl,
      datos: (doc.current.datos || []).map(normalizeEntry),
      history,
      updatedAt: doc.updatedAt
    };
    
    debugLog('📤 [verificarOdontogramaInicial] Respuesta enviada:', {
      exists: responseData.exists,
      imageUrl: responseData.imageUrl,
      datosCount: responseData.datos.length,
      historyCount: responseData.history.length
    });

    res.json(responseData);
  } catch (error) {
    console.error('💥 [verificarOdontogramaInicial] Error:', error);
    next(error);
  }
};

/** Comprobación ligera para el motor (canvas): solo indica si ya existe snapshot inicial */
const hasInitialOdontogram = async (req, res, next) => {
  try {
    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }
    const doc = await OdontogramaModel.findOne({ patientId, type: TYPE_INITIAL, deletedAt: null }).lean();
    const hasSaved = !!(doc && doc.current);
    res.json({ hasSaved });
  } catch (error) {
    next(error);
  }
};

const guardarOdontogramaInicial = async (req, res, next) => {
  try {
    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }

    // `validarEntradasOdontograma` ya validó y normalizó req.validatedEntries.

    // Regla principal: el odontograma inicial sólo se puede guardar UNA vez.
    // Si ya hay un doc activo con `current`, sólo el creador (en BORRADOR) o un admin
    // pueden re-guardar. Cualquier otro caso → 409 Conflict.
    const existingDoc = await OdontogramaModel.findOne({
      patientId: patientId,
      type: TYPE_INITIAL,
      deletedAt: null
    });

    if (existingDoc && existingDoc.current) {
      const userIsAdmin = isAdminRole(req.user?.role);
      const userIsCreator = existingDoc.creadoPor && existingDoc.creadoPor.toString() === req.user?.id;

      if (existingDoc.estado === 'OFICIAL') {
        // NOM-024: registros firmados son inmutables.
        return res.status(409).json({
          success: false,
          error: {
            code: 'ALREADY_SAVED',
            message: 'El odontograma inicial ya fue guardado y es inmutable. Para corregirlo, archívalo y crea uno nuevo.'
          }
        });
      }

      if (existingDoc.estado === 'BORRADOR' && !userIsAdmin && !userIsCreator) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Sólo el creador o un administrador pueden modificar este borrador.' }
        });
      }

      // Concurrencia optimista: si el cliente envió expectedUpdatedAt y el
      // documento fue modificado por otro usuario/pestaña, abortar para que
      // refresque antes de pisar cambios.
      const expectedUpdatedAt = req.body?.expectedUpdatedAt;
      if (expectedUpdatedAt) {
        const currentTs = new Date(existingDoc.updatedAt).getTime();
        const expectedTs = new Date(expectedUpdatedAt).getTime();
        if (Number.isNaN(expectedTs) || currentTs !== expectedTs) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'ODONTOGRAMA_STALE',
              message: 'El odontograma fue modificado por otro usuario. Recarga para ver los cambios antes de guardar.',
              currentUpdatedAt: existingDoc.updatedAt
            }
          });
        }
      }
    }

    // Estampar `fecha` por entrada con el momento del guardado.
    // El cliente no controla la fecha — el servidor es la única fuente de verdad.
    const savedAt = new Date();
    const datos = req.validatedEntries.map(e => ({
      tooth: e.tooth,
      damage: e.damage,
      surface: e.surface,
      note: e.note,
      fecha: savedAt
    }));

    // Validar que appointmentId, si vino, pertenece al paciente. Si no
    // pertenece (intento de vinculación cruzada) lo ignoramos y guardamos
    // sin appointmentId — preferimos perder la asociación a corromper el
    // historial cruzando pacientes.
    const appointmentId = await resolvePatientAppointmentId(req.body?.appointmentId, patientId);
    const snapshot = {
      imageUrl: '',
      datos,
      savedAt,
      appointmentId,
      savedBy: req.user?.id || null
    };

    // Asistente con sólo `odontogram.write.draft` → guarda como BORRADOR.
    const userPerms = getEffectivePermissions(req.user);
    let estadoRegistro = 'OFICIAL';
    if (!hasPermission(userPerms, ['odontogram.create']) && hasPermission(userPerms, ['odontogram.write.draft'])) {
      estadoRegistro = 'BORRADOR';
    }

    const auditFields = {
      estado: estadoRegistro,
      creadoPor: existingDoc?.creadoPor || req.user?.id || null,
      modificadoPor: req.user?.id || null,
      modificadoEn: new Date()
    };
    if (req.body._capturaExtemporanea) {
      auditFields.capturaExtemporanea = req.body._capturaExtemporanea;
    }

    const odontograma = await OdontogramaModel.findOneAndUpdate(
      { patientId: patientId, type: TYPE_INITIAL, deletedAt: null },
      { $set: { current: snapshot, ...auditFields }, $push: { history: snapshot } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({
      exists: true,
      datos: (odontograma.current.datos || []).map(normalizeEntry),
      history: odontograma.history.map(v => ({
        id: v._id,
        fecha: v.savedAt.toISOString(),
        datos: (v.datos || []).map(normalizeEntry)
      })),
      updatedAt: odontograma.updatedAt
    });
  } catch (err) {
    console.error('[guardarOdontogramaInicial] Error:', err.message);
    next(err);
  }
};

const obtenerHistorialInicial = async (req, res, next) => {
  try {
    debugLog('📜 [obtenerHistorialInicial] Iniciando para paciente:', req.patient?.id || req.patient?._id);
    
    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      debugLog('❌ [obtenerHistorialInicial] PatientId inválido');
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }
    
    debugLog('🔍 [obtenerHistorialInicial] Buscando historial con patientId:', patientId, 'type:', TYPE_INITIAL);
    const doc = await OdontogramaModel.findOne({
      patientId: patientId,
      type: TYPE_INITIAL,
      deletedAt: null
    }).select('history');

    debugLog('📋 [obtenerHistorialInicial] Documento encontrado:', {
      docExists: !!doc,
      historyExists: !!doc?.history,
      historyLength: doc?.history?.length
    });

    const activeHistory = (doc?.history || []).filter(v => !v.deletedAt);
    if (!doc || activeHistory.length === 0) {
      debugLog('📭 [obtenerHistorialInicial] Sin historial, devolviendo vacío');
      return res.json({ exists: false, history: [] });
    }

    const history = activeHistory.map(v => ({
      id: v._id,
      imageUrl: v.imageUrl,
      fecha: v.savedAt.toISOString(),
      datos: (v.datos || []).map(normalizeEntry)
    }));

    debugLog('📤 [obtenerHistorialInicial] Enviando historial con', history.length, 'entradas');
    res.json({
      exists: true,
      history
    });
  } catch (error) {
    console.error('💥 [obtenerHistorialInicial] Error:', error);
    next(error);
  }
};

const obtenerSnapshotPorId = async (req, res, next) => {
  try {
    const { snapshotId } = req.params;
    
    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }
    
    const odontograma = await OdontogramaModel.findOne({
      patientId: patientId,
      type: TYPE_INITIAL,
      deletedAt: null,
      'history._id': snapshotId
    }, { 'history.$': 1 });

    if (!odontograma || !odontograma.history || odontograma.history.length === 0) {
      return res.status(404).json({
        exists: false,
        message: 'Snapshot no encontrado'
      });
    }

    const snapshot = odontograma.history[0];

    res.json({
      exists: true,
      id: snapshot._id,
      imageUrl: snapshot.imageUrl,
      datos: (snapshot.datos || []).map(normalizeEntry),
      fecha: snapshot.savedAt.toISOString()
    });
  } catch (error) {
    next(error);
  }
};

const agregarHistorialInicial = async (req, res, next) => {
  try {
    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }

    const odontograma = await OdontogramaModel.findOne({ patientId: patientId, type: TYPE_INITIAL, deletedAt: null });
    if (!odontograma || !odontograma.current) {
      return res.status(404).json({
        exists: false,
        message: 'Odontograma inicial no encontrado para agregar al historial.'
      });
    }

    // NOM-024: Los registros OFICIAL son inmutables — solo se permiten addenda
    if (odontograma.estado === 'OFICIAL') {
      return res.status(403).json({
        success: false,
        error: { code: 'IMMUTABLE_RECORD', message: 'No se puede modificar un odontograma en estado OFICIAL. Use addendum para correcciones.' }
      });
    }

    // BORRADOR: solo el creador o un admin pueden modificar
    if (odontograma.estado === 'BORRADOR' && !isAdminRole(req.user?.role)) {
      if (odontograma.creadoPor && odontograma.creadoPor.toString() !== req.user?.id) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Solo el creador o un administrador pueden modificar este borrador' }
        });
      }
    }

    const savedAt = new Date();
    const entries = req.validatedEntries.map(normalizeEntry).map(e => ({
      tooth: e.tooth,
      damage: e.damage,
      surface: e.surface,
      note: e.note,
      fecha: savedAt
    }));
    const snapshotAppointmentId = await resolvePatientAppointmentId(req.body?.appointmentId, patientId);
    const snapshot = {
      imageUrl: odontograma.current.imageUrl,
      datos: entries,
      savedAt,
      appointmentId: snapshotAppointmentId,
      savedBy: req.user?.id || null
    };

    const updated = await OdontogramaModel.findOneAndUpdate(
      { patientId: patientId, type: TYPE_INITIAL, deletedAt: null },
      {
        $push: { history: snapshot },
        $set: { modificadoPor: req.user?.id || null, modificadoEn: new Date() }
      },
      { new: true }
    );

    res.status(201).json({
      exists: true,
      imageUrl: updated.current?.imageUrl || null,
      datos: (updated.current?.datos || []).map(normalizeEntry),
      history: updated.history.map(v => ({
        id: v._id,
        imageUrl: v.imageUrl,
        fecha: v.savedAt.toISOString(),
        datos: (v.datos || []).map(normalizeEntry)
      }))
    });
  } catch (error) {
    next(error);
  }
};

// NOTA: el odontograma inicial es de captura única e inmutable por paciente.
// No existe función de delete/archivado — la regla de negocio es "una sola vez,
// no se modifica, no se borra". Si alguna vez se necesita una excepción
// administrativa, la corrección debe hacerse a nivel BD por un superadmin,
// no por un endpoint expuesto.

// ——— Clínico —————————————————————————————————————————————————————————————————
const verificarOdontogramaClinico = async (req, res, next) => {
  try {
    debugLog('🔍 [verificarOdontogramaClinico] Buscando odontograma para paciente:', req.patient?.id || req.patient?._id);
    
    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      debugLog('❌ [verificarOdontogramaClinico] PatientId inválido');
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }
    
    debugLog('🔍 [verificarOdontogramaClinico] Buscando en BD con patientId:', patientId, 'type:', TYPE_CLINIC);
    const doc = await OdontogramaModel.findOne({
      patientId: patientId,
      type: TYPE_CLINIC,
      deletedAt: null
    });
    
    debugLog('📋 [verificarOdontogramaClinico] Documento encontrado:', {
      docExists: !!doc,
      currentExists: !!doc?.current,
      currentDatos: doc?.current?.datos,
      historyLength: doc?.history?.length
    });

    const datos = doc?.current?.datos?.map(normalizeEntry) || [];
    const history = (doc?.history || []).filter(h => !h.deletedAt).map(h => ({
      id: h._id,
      fecha: h.savedAt.toISOString(),
      datos: (h.datos || []).map(normalizeEntry)
    }));

    // updatedAt se devuelve para que el cliente lo pase como expectedUpdatedAt
    // al guardar; es la base del control de concurrencia 409.
    const responseData = {
      exists: !!doc && !!doc.current,
      datos,
      history,
      updatedAt: doc ? doc.updatedAt : null,
    };
    
    debugLog('📤 [verificarOdontogramaClinico] Respuesta enviada:', {
      exists: responseData.exists,
      datosCount: responseData.datos.length,
      historyCount: responseData.history.length
    });

    res.json(responseData);
  } catch (error) {
    console.error('💥 [verificarOdontogramaClinico] Error:', error);
    next(error);
  }
};

const obtenerHistorialClinico = async (req, res, next) => {
  try {
    debugLog('📜 [obtenerHistorialClinico] Iniciando para paciente:', req.patient?.id || req.patient?._id);
    
    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      debugLog('❌ [obtenerHistorialClinico] PatientId inválido');
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }
    
    debugLog('🔍 [obtenerHistorialClinico] Buscando historial con patientId:', patientId, 'type:', TYPE_CLINIC);
    const doc = await OdontogramaModel.findOne({
      patientId: patientId,
      type: TYPE_CLINIC,
      deletedAt: null
    }).select('history');

    debugLog('📋 [obtenerHistorialClinico] Documento encontrado:', {
      docExists: !!doc,
      historyExists: !!doc?.history,
      historyLength: doc?.history?.length
    });

    const activeHistory = (doc?.history || []).filter(h => !h.deletedAt);
    if (!doc || activeHistory.length === 0) {
      debugLog('📭 [obtenerHistorialClinico] Sin historial, devolviendo vacío');
      return res.json({ exists: false, history: [] });
    }

    const history = activeHistory.map(h => ({
      id: h._id,
      fecha: h.savedAt.toISOString(),
      datos: (h.datos || []).map(normalizeEntry)
    }));

    debugLog('📤 [obtenerHistorialClinico] Enviando historial con', history.length, 'entradas');
    res.json({
      exists: true,
      history
    });
  } catch (error) {
    console.error('💥 [obtenerHistorialClinico] Error:', error);
    next(error);
  }
};

const saveClinicalHistoryEntries = async (req, res, next) => {
    try {
        // El servidor fija la `fecha` por entrada con el momento del guardado.
        // Ignoramos cualquier `fecha` que el cliente haya enviado para que la fecha
        // mostrada al recargar siempre refleje cuándo se guardó realmente.
        const savedAt = new Date();
        const entries = req.validatedEntries.map(entry => {
            const normalized = normalizeEntry(entry);
            return {
                tooth: normalized.tooth,
                damage: normalized.damage,
                surface: normalized.surface,
                note: normalized.note,
                fecha: savedAt
            };
        });

        const patientId = req.patient?.id || req.patient?._id;
        if (!patientId) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
            });
        }

        // Valida appointmentId vs paciente — descartado silenciosamente
        // si referencia una cita de otro paciente (anti cross-linking).
        const clinicAppointmentId = await resolvePatientAppointmentId(req.body?.appointmentId, patientId);
        const snapshot = {
            datos: entries,
            imageUrl: '',
            savedAt,
            appointmentId: clinicAppointmentId,
            savedBy: req.user?.id || null
        };

    // NOM-024: la inmutabilidad aplica a registros REALMENTE firmados
    // (firmadoEn != null), no al campo `estado` que antes se auto-marcaba
    // OFICIAL en cada save. El odontograma clínico es longitudinal: el
    // doctor sigue agregando hallazgos durante la consulta y cada save
    // queda en `history[]`. Solo al firmar con PIN vía signingController
    // se cierra el registro.
    const existingClinic = await OdontogramaModel.findOne({ patientId: patientId, type: TYPE_CLINIC, deletedAt: null });
    if (existingClinic && existingClinic.firmadoEn) {
      return res.status(403).json({
        success: false,
        error: { code: 'IMMUTABLE_RECORD', message: 'No se puede modificar un odontograma clínico firmado. Use addendum para correcciones.' }
      });
    }

    // BORRADOR: solo el creador o un admin pueden modificar
    if (existingClinic && !isAdminRole(req.user?.role)) {
      if (existingClinic.creadoPor && existingClinic.creadoPor.toString() !== req.user?.id) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Solo el creador o un administrador pueden modificar este borrador clínico' }
        });
      }
    }

    // Concurrencia optimista: si el cliente envió expectedUpdatedAt y el
    // documento fue modificado por otro usuario/pestaña, abortar para que
    // refresque antes de pisar cambios.
    if (existingClinic) {
      const expectedUpdatedAt = req.body?.expectedUpdatedAt;
      if (expectedUpdatedAt) {
        const currentTs = new Date(existingClinic.updatedAt).getTime();
        const expectedTs = new Date(expectedUpdatedAt).getTime();
        if (Number.isNaN(expectedTs) || currentTs !== expectedTs) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'ODONTOGRAMA_STALE',
              message: 'El odontograma clínico fue modificado por otro usuario. Recarga para ver los cambios antes de guardar.',
              currentUpdatedAt: existingClinic.updatedAt
            }
          });
        }
      }
    }

    // NO auto-OFICIAL: cada save mantiene/inicializa como BORRADOR. El
    // tránsito a OFICIAL ocurre SÓLO al firmar con PIN vía POST /api/sign/
    // (signingController), que es quien setea firmadoEn/firmadoPor/contentHash.
    // Antes el controller marcaba OFICIAL en cada save aunque no hubiera
    // firma real → disparaba 403 IMMUTABLE_RECORD al segundo guardado.
    const auditUpdate = {
      estado: 'BORRADOR',
      modificadoPor: req.user?.id || null,
      modificadoEn: new Date()
    };
    if (req.body._capturaExtemporanea) {
      auditUpdate.capturaExtemporanea = req.body._capturaExtemporanea;
    }

    // Dedupe del history: si el snapshot nuevo es idéntico al `current`
    // existente (mismo set de entries), NO se agrega otra entrada al
    // history. Antes cada click "Guardar" sin cambios reales sumaba un
    // snapshot duplicado al historial (bloat).
    const isIdenticalToCurrent = (existing, nextEntries) => {
      const prev = (existing?.current?.datos || []).map(e => `${e.tooth}|${e.damage}|${e.surface}|${e.note || ''}`).sort();
      const next = nextEntries.map(e => `${e.tooth}|${e.damage}|${e.surface}|${e.note || ''}`).sort();
      if (prev.length !== next.length) return false;
      return prev.every((v, i) => v === next[i]);
    };
    const shouldPushHistory = !existingClinic || !isIdenticalToCurrent(existingClinic, entries);
    const updateOps = {
      $set: { current: snapshot, ...auditUpdate },
      $setOnInsert: { creadoPor: req.user?.id || null }
    };
    if (shouldPushHistory) {
      updateOps.$push = { history: snapshot };
    }
    const doc = await OdontogramaModel.findOneAndUpdate(
      { patientId: patientId, type: TYPE_CLINIC, deletedAt: null },
      updateOps,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    
    // debugLog('💾 [saveClinicalHistoryEntries] Documento guardado en BD:', {
    //   docId: doc._id,
    //   currentDatos: doc.current?.datos,
    //   historyLength: doc.history?.length
    // });

    const responseData = {
      exists: true,
      datos: (doc.current.datos || []).map(normalizeEntry),
      history: (doc.history || []).filter(h => !h.deletedAt).map(h => ({
        id: h._id,
        fecha: h.savedAt.toISOString(),
        datos: (h.datos || []).map(normalizeEntry)
      })),
      updatedAt: doc.updatedAt
    };
    
    // debugLog('📤 [saveClinicalHistoryEntries] Respuesta enviada:', {
    //   exists: responseData.exists,
    //   datosCount: responseData.datos.length,
    //   historyCount: responseData.history.length
    // });

    res.status(201).json(responseData);
  } catch (error) {
    next(error);
  }
};

const deleteClinicalHistoryEntry = async (req, res, next) => {
  try {
    const { entryId } = req.params;
    
    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }
    
    const result = await OdontogramaModel.updateOne(
      {
        patientId: patientId,
        type: TYPE_CLINIC,
        deletedAt: null,
        'history._id': entryId,
        'history.deletedAt': null
      },
      { $set: { 
        'history.$.deletedAt': new Date(),
        'history.$.deletedBy': req.user?.id || null,
        'history.$.deleteReason': req.body?.motivo || 'Eliminado por usuario'
      } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'DOCUMENT_NOT_FOUND', message: 'Documento de odontograma clínico no encontrado' }
      });
    }

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'ENTRY_NOT_FOUND', message: 'Entrada del historial no encontrada' }
      });
    }

    res.json({
      success: true,
      message: 'Entrada del historial eliminada correctamente'
    });
  } catch (error) {
    next(error);
  }
};

const deleteClinicalOdontogramState = async (req, res, next) => {
  try {
    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }
    
    // Soft-delete (NOM-004 Art. 5.4)
    const doc = await OdontogramaModel.findOne({
      patientId: patientId,
      type: TYPE_CLINIC
    });

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: { code: 'DOCUMENT_NOT_FOUND', message: 'Estado del odontograma clínico no encontrado' }
      });
    }

    // NOM-024: los registros realmente firmados no se pueden eliminar.
    // Antes el guard usaba `estado === 'OFICIAL'` pero ese campo se
    // auto-marcaba en cada save sin firma real (ver saveClinicalHistoryEntries).
    if (doc.firmadoEn) {
      return res.status(403).json({
        success: false,
        error: { code: 'IMMUTABLE_RECORD', message: 'No se puede eliminar un odontograma clínico firmado' }
      });
    }

    // BORRADOR: solo el creador o un admin pueden eliminar
    if (!isAdminRole(req.user?.role)) {
      if (doc.creadoPor && doc.creadoPor.toString() !== req.user?.id) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Solo el creador o un administrador pueden eliminar este borrador clínico' }
        });
      }
    }

    doc.estado = 'ARCHIVADO';
    doc.deletedAt = new Date();
    doc.deletedBy = req.user?.id || null;
    doc.deleteReason = req.body?.motivo || 'Eliminado por usuario';
    await doc.save();

    res.json({
      success: true,
      message: 'Estado del odontograma clínico archivado correctamente'
    });
  } catch (error) {
    next(error);
  }
};

// ——— Middlewares y Error Handler ——————————————————————————————————————————————————————
const validarEntradasOdontograma = (req, res, next) => {
  // debugLog('[DEBUG] validarEntradasOdontograma - Inicio:', {
  //   hasBody: !!req.body,
  //   bodyType: typeof req.body,
  //   bodyKeys: req.body ? Object.keys(req.body) : null,
  //   hasEntries: req.body && 'entries' in req.body,
  //   entriesType: req.body ? typeof req.body.entries : null,
  //   entriesValue: req.body ? req.body.entries : null
  // });

  if (!req.body || typeof req.body !== 'object' || !('entries' in req.body)) {
    // debugLog('[ERROR] No se encontró entries en el body');
    return res.status(400).json({
      success: false,
      error: { code: 'NO_ENTRIES_KEY', message: "El body debe tener la clave 'entries'" }
    });
  }
  const raw = req.body.entries;
  let entries;

  // debugLog('[DEBUG] Raw entries:', { type: typeof raw, value: raw });

  try {
    entries = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // debugLog('[DEBUG] Parsed entries:', { type: typeof entries, isArray: Array.isArray(entries), length: entries?.length, value: entries });
  } catch (_parseError) {
    // debugLog('[ERROR] Error parseando entries:', parseError.message);
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'entries debe ser JSON válido' }
    });
  }

  // Aceptar array vacío: representa una captura "sin hallazgos" — estado
  // clínico legítimo. Antes el cliente inyectaba un entry-fantasma "Sano"
  // que el engine no reconocía al recargar.
  if (!Array.isArray(entries)) {
    return res.status(400).json({
      success: false,
      error: { code: 'NO_ENTRIES', message: "entries debe ser un array (puede ser vacío)." }
    });
  }

  // Mapear usando la función normalizada del helper
  const mappedEntries = entries.map((e) => {
    // debugLog(`[DEBUG] Procesando entry #${index}:`, e);
    const normalized = normalizeEntry(e);
    // Mantener compatibilidad con campos adicionales del controlador
    const mapped = {
      ...normalized,
      diagnostic: e.diagnostic || '',
      // Normalizar 'condition' como alias de 'damage'
      damage: e.condition !== undefined ? e.condition : normalized.damage
    };
    // debugLog(`[DEBUG] Entry #${index} mapeada:`, mapped);
    return mapped;
  });

  // Filtrar duplicados basándose en tooth, damage y surface
  const uniqueEntries = [];
  const seenEntries = new Set();
  
  for (const entry of mappedEntries) {
    // Crear una clave única basada en tooth, damage y surface
    const entryKey = `${entry.tooth}-${entry.damage}-${entry.surface}`;
    
    if (!seenEntries.has(entryKey)) {
      seenEntries.add(entryKey);
      uniqueEntries.push(entry);
    } else {
      console.warn(`[DUPLICATE FILTER] Entrada duplicada detectada y filtrada:`, {
        tooth: entry.tooth,
        damage: entry.damage,
        surface: entry.surface
      });
    }
  }
  
  req.validatedEntries = uniqueEntries;

  // debugLog('[DEBUG] Todas las entries validadas:', req.validatedEntries);

  for (let i = 0; i < req.validatedEntries.length; i++) {
    const item = req.validatedEntries[i];
    // debugLog(`[DEBUG] Validando entry #${i}:`, {
    //   tooth: item.tooth,
    //   damage: item.damage,
    //   hasTooth: !!item.tooth,
    //   hasDamage: item.damage !== '',
    //   damageType: typeof item.damage
    // });
    if (!item.tooth || item.damage === '') {
      // debugLog(`[ERROR] Entry #${i} inválida:`, item);
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ENTRY',
          message: `Entry #${i} debe tener 'tooth' y 'damage' (o 'condition')`,
          invalidEntry: item
        }
      });
    }
  }
  next();
};

// eslint-disable-next-line no-unused-vars
const manejarError = (err, req, res, next) => {
  console.error('[ODONTOGRAMA_ERROR]', {
    name: err.name,
    message: err.message,
    code: err.code,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  });

  if (req.file && req.file.path) {
    fsExtra.remove(req.file.path).catch(cleanupErr => {
      console.error('[ERROR] Falla al limpiar archivo temporal tras error:', cleanupErr);
    });
  }

  if (err instanceof ValidationError) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: err.message }
    });
  }
  if (err instanceof FileTooLargeError) {
    return res.status(413).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: err.message }
    });
  }
  if (err instanceof UnsupportedMediaTypeError) {
    return res.status(415).json({
      success: false,
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: err.message }
    });
  }

  // Reconocimiento adicional por nombre/código cuando los errores provienen de middlewares distintos
  if (err && (err.name === 'FileTooLargeError' || err.code === 'LIMIT_FILE_SIZE')) {
    return res.status(413).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: err.message || 'Archivo demasiado grande' }
    });
  }
  if (err && err.name === 'UnsupportedMediaTypeError') {
    return res.status(415).json({
      success: false,
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: err.message || 'Tipo de archivo no soportado' }
    });
  }

  // Manejo de errores nativos de Multer por si llegan hasta aquí
  if (err && err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: 'Archivo demasiado grande' }
      });
    }
    return res.status(400).json({
      success: false,
      error: { code: 'MULTER_ERROR', message: err.message }
    });
  }

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Error interno del servidor en odontograma'
    }
  });
};

// ——— Exports ——————————————————————————————————————————————————————————————————————————
module.exports = {
  TYPE_INITIAL,
  TYPE_CLINIC,
  verificarOdontogramaInicial,
  hasInitialOdontogram,
  validarEntradasOdontograma,
  guardarOdontogramaInicial,
  obtenerHistorialInicial,
  obtenerSnapshotPorId,
  agregarHistorialInicial,
  verificarOdontogramaClinico,
  obtenerHistorialClinico,
  saveClinicalHistoryEntries,
  deleteClinicalHistoryEntry,
  deleteClinicalOdontogramState,
  manejarError
};

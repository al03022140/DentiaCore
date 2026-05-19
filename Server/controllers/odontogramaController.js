const {
  ValidationError,
  FileTooLargeError,
  UnsupportedMediaTypeError,
  normalizeEntry
} = require('../helpers/odontograma');
const mongoose = require('mongoose');
const OdontogramaModel = require('../models/odontograma');
const { hasPermission, getEffectivePermissions, isAdminRole } = require('../utils/permissions');

// ——— Constantes de tipo de odontograma ————————————————————————————————————————————————
const TYPE_INITIAL = 'initial';
const TYPE_CLINIC = 'clinic';

// ——— Controladores ——————————————————————————————————————————————————————————————
const verificarOdontogramaInicial = async (req, res, next) => {
  try {
    console.log('🔍 [verificarOdontogramaInicial] Buscando odontograma para paciente:', req.patient?.id || req.patient?._id);
    
    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      console.log('❌ [verificarOdontogramaInicial] PatientId inválido');
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }
    
    console.log('🔍 [verificarOdontogramaInicial] Buscando en BD con patientId:', patientId, 'type:', TYPE_INITIAL);
    const doc = await OdontogramaModel.findOne({
      patientId: patientId,
      type: TYPE_INITIAL,
      deletedAt: null
    });

    console.log('📋 [verificarOdontogramaInicial] Documento encontrado:', {
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
      console.log('📭 [verificarOdontogramaInicial] Sin datos actuales, devolviendo vacío');
      return res.json({ 
        exists: false, 
        imageUrl: null, 
        datos: [], 
        history 
      });
    }

    const responseData = {
      exists: true,
      imageUrl: doc.current.imageUrl,
      datos: (doc.current.datos || []).map(normalizeEntry),
      history
    };
    
    console.log('📤 [verificarOdontogramaInicial] Respuesta enviada:', {
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

    const appointmentId = mongoose.Types.ObjectId.isValid(req.body?.appointmentId)
      ? req.body.appointmentId
      : null;
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
      }))
    });
  } catch (err) {
    console.error('[guardarOdontogramaInicial] Error:', err.message);
    next(err);
  }
};

const obtenerHistorialInicial = async (req, res, next) => {
  try {
    console.log('📜 [obtenerHistorialInicial] Iniciando para paciente:', req.patient?.id || req.patient?._id);
    
    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      console.log('❌ [obtenerHistorialInicial] PatientId inválido');
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }
    
    console.log('🔍 [obtenerHistorialInicial] Buscando historial con patientId:', patientId, 'type:', TYPE_INITIAL);
    const doc = await OdontogramaModel.findOne({
      patientId: patientId,
      type: TYPE_INITIAL,
      deletedAt: null
    }).select('history');

    console.log('📋 [obtenerHistorialInicial] Documento encontrado:', {
      docExists: !!doc,
      historyExists: !!doc?.history,
      historyLength: doc?.history?.length
    });

    const activeHistory = (doc?.history || []).filter(v => !v.deletedAt);
    if (!doc || activeHistory.length === 0) {
      console.log('📭 [obtenerHistorialInicial] Sin historial, devolviendo vacío');
      return res.json({ exists: false, history: [] });
    }

    const history = activeHistory.map(v => ({
      id: v._id,
      imageUrl: v.imageUrl,
      fecha: v.savedAt.toISOString(),
      datos: (v.datos || []).map(normalizeEntry)
    }));

    console.log('📤 [obtenerHistorialInicial] Enviando historial con', history.length, 'entradas');
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
    const snapshotAppointmentId = mongoose.Types.ObjectId.isValid(req.body?.appointmentId)
      ? req.body.appointmentId
      : null;
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
    console.log('🔍 [verificarOdontogramaClinico] Buscando odontograma para paciente:', req.patient?.id || req.patient?._id);
    
    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      console.log('❌ [verificarOdontogramaClinico] PatientId inválido');
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }
    
    console.log('🔍 [verificarOdontogramaClinico] Buscando en BD con patientId:', patientId, 'type:', TYPE_CLINIC);
    const doc = await OdontogramaModel.findOne({
      patientId: patientId,
      type: TYPE_CLINIC,
      deletedAt: null
    });
    
    console.log('📋 [verificarOdontogramaClinico] Documento encontrado:', {
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
    
    const responseData = {
      exists: !!doc && !!doc.current,
      datos,
      history,
    };
    
    console.log('📤 [verificarOdontogramaClinico] Respuesta enviada:', {
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
    console.log('📜 [obtenerHistorialClinico] Iniciando para paciente:', req.patient?.id || req.patient?._id);
    
    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      console.log('❌ [obtenerHistorialClinico] PatientId inválido');
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }
    
    console.log('🔍 [obtenerHistorialClinico] Buscando historial con patientId:', patientId, 'type:', TYPE_CLINIC);
    const doc = await OdontogramaModel.findOne({
      patientId: patientId,
      type: TYPE_CLINIC,
      deletedAt: null
    }).select('history');

    console.log('📋 [obtenerHistorialClinico] Documento encontrado:', {
      docExists: !!doc,
      historyExists: !!doc?.history,
      historyLength: doc?.history?.length
    });

    const activeHistory = (doc?.history || []).filter(h => !h.deletedAt);
    if (!doc || activeHistory.length === 0) {
      console.log('📭 [obtenerHistorialClinico] Sin historial, devolviendo vacío');
      return res.json({ exists: false, history: [] });
    }

    const history = activeHistory.map(h => ({
      id: h._id,
      fecha: h.savedAt.toISOString(),
      datos: (h.datos || []).map(normalizeEntry)
    }));

    console.log('📤 [obtenerHistorialClinico] Enviando historial con', history.length, 'entradas');
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

        const clinicAppointmentId = mongoose.Types.ObjectId.isValid(req.body?.appointmentId)
            ? req.body.appointmentId
            : null;
        const snapshot = {
            datos: entries,
            imageUrl: '',
            savedAt,
            appointmentId: clinicAppointmentId,
            savedBy: req.user?.id || null
        };

        const patientId = req.patient?.id || req.patient?._id;
        if (!patientId) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
            });
        }

    // NOM-024: Los registros firmados son inmutables — solo se permiten addenda
    const existingClinic = await OdontogramaModel.findOne({ patientId: patientId, type: TYPE_CLINIC, deletedAt: null });
    if (existingClinic && existingClinic.estado === 'OFICIAL') {
      return res.status(403).json({
        success: false,
        error: { code: 'IMMUTABLE_RECORD', message: 'No se puede modificar un odontograma clínico en estado OFICIAL. Use addendum para correcciones.' }
      });
    }

    // BORRADOR: solo el creador o un admin pueden modificar
    if (existingClinic && existingClinic.estado === 'BORRADOR' && !isAdminRole(req.user?.role)) {
      if (existingClinic.creadoPor && existingClinic.creadoPor.toString() !== req.user?.id) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Solo el creador o un administrador pueden modificar este borrador clínico' }
        });
      }
    }

    // Determinar estadoRegistro según permisos (asistente → BORRADOR)
    const userPerms = getEffectivePermissions(req.user);
    let estadoRegistro = 'OFICIAL';
    if (!hasPermission(userPerms, ['odontogram.create']) && hasPermission(userPerms, ['odontogram.write.draft'])) {
      estadoRegistro = 'BORRADOR';
    }

    const auditUpdate = {
      estado: estadoRegistro,
      modificadoPor: req.user?.id || null,
      modificadoEn: new Date()
    };
    if (req.body._capturaExtemporanea) {
      auditUpdate.capturaExtemporanea = req.body._capturaExtemporanea;
    }

    const doc = await OdontogramaModel.findOneAndUpdate(
      { patientId: patientId, type: TYPE_CLINIC, deletedAt: null },
      {
        $set: { current: snapshot, ...auditUpdate },
        $push: { history: snapshot },
        $setOnInsert: { creadoPor: req.user?.id || null }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    
    // console.log('💾 [saveClinicalHistoryEntries] Documento guardado en BD:', {
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
      }))
    };
    
    // console.log('📤 [saveClinicalHistoryEntries] Respuesta enviada:', {
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

    // NOM-024: Los registros OFICIAL no se pueden eliminar
    if (doc.estado === 'OFICIAL') {
      return res.status(403).json({
        success: false,
        error: { code: 'IMMUTABLE_RECORD', message: 'No se puede eliminar un odontograma clínico en estado OFICIAL' }
      });
    }

    // BORRADOR: solo el creador o un admin pueden eliminar
    if (doc.estado === 'BORRADOR' && !isAdminRole(req.user?.role)) {
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
  // console.log('[DEBUG] validarEntradasOdontograma - Inicio:', {
  //   hasBody: !!req.body,
  //   bodyType: typeof req.body,
  //   bodyKeys: req.body ? Object.keys(req.body) : null,
  //   hasEntries: req.body && 'entries' in req.body,
  //   entriesType: req.body ? typeof req.body.entries : null,
  //   entriesValue: req.body ? req.body.entries : null
  // });

  if (!req.body || typeof req.body !== 'object' || !('entries' in req.body)) {
    // console.log('[ERROR] No se encontró entries en el body');
    return res.status(400).json({
      success: false,
      error: { code: 'NO_ENTRIES_KEY', message: "El body debe tener la clave 'entries'" }
    });
  }
  const raw = req.body.entries;
  let entries;

  // console.log('[DEBUG] Raw entries:', { type: typeof raw, value: raw });

  try {
    entries = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // console.log('[DEBUG] Parsed entries:', { type: typeof entries, isArray: Array.isArray(entries), length: entries?.length, value: entries });
  } catch (_parseError) {
    // console.log('[ERROR] Error parseando entries:', parseError.message);
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'entries debe ser JSON válido' }
    });
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    // console.log('[ERROR] Entries inválidas:', { isArray: Array.isArray(entries), length: entries?.length });
    return res.status(400).json({
      success: false,
      error: { code: 'NO_ENTRIES', message: 'Debes enviar un array de entries no vacío' }
    });
  }

  // Mapear usando la función normalizada del helper
  const mappedEntries = entries.map((e) => {
    // console.log(`[DEBUG] Procesando entry #${index}:`, e);
    const normalized = normalizeEntry(e);
    // Mantener compatibilidad con campos adicionales del controlador
    const mapped = {
      ...normalized,
      diagnostic: e.diagnostic || '',
      // Normalizar 'condition' como alias de 'damage'
      damage: e.condition !== undefined ? e.condition : normalized.damage
    };
    // console.log(`[DEBUG] Entry #${index} mapeada:`, mapped);
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

  // console.log('[DEBUG] Todas las entries validadas:', req.validatedEntries);

  for (let i = 0; i < req.validatedEntries.length; i++) {
    const item = req.validatedEntries[i];
    // console.log(`[DEBUG] Validando entry #${i}:`, {
    //   tooth: item.tooth,
    //   damage: item.damage,
    //   hasTooth: !!item.tooth,
    //   hasDamage: item.damage !== '',
    //   damageType: typeof item.damage
    // });
    if (!item.tooth || item.damage === '') {
      // console.log(`[ERROR] Entry #${i} inválida:`, item);
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

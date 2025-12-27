const Patient   = require('../models/patient');
const fs        = require('fs');
const path      = require('path');
const util      = require('util');
const multer    = require('multer');
const {
  processAndSaveOdontograma,
  ValidationError,
  FileTooLargeError,
  UnsupportedMediaTypeError,
  normalizeEntry
} = require('../helpers/odontograma');
const OdontogramaModel = require('../models/odontograma');
const fsExtra = require('fs-extra');

const unlinkAsync = util.promisify(fs.unlink);

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
      type: TYPE_INITIAL 
    });

    console.log('📋 [verificarOdontogramaInicial] Documento encontrado:', {
      docExists: !!doc,
      currentExists: !!doc?.current,
      currentDatos: doc?.current?.datos,
      historyLength: doc?.history?.length
    });

    const history = doc?.history?.map(v => ({
      id: v._id,
      imageUrl: v.imageUrl,
      fecha: v.savedAt.toISOString(),
      datos: (v.datos || []).map(normalizeEntry)
    })) || [];

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

const guardarOdontogramaInicial = async (req, res, next) => {
  console.log('[DEBUG] guardarOdontogramaInicial - Inicio:', {
    hasFile: !!req.file,
    bodyKeys: Object.keys(req.body),
    patientId: req.patient?.id,
    fileInfo: req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : null
  });

  // Validar archivo
  if (!req.file) {
    console.log('[ERROR] No se recibió archivo');
    console.log('[ERROR] req.body:', req.body);
    console.log('[ERROR] req.headers:', req.headers);
    return res.status(400).json({
      success: false,
      error: { code: 'NO_FILE', message: 'Debes enviar un archivo de imagen' }
    });
  }

  // Validar y procesar entries
  let raw = req.body.entries;
  let entries;

  console.log('[DEBUG] Procesando entries:', {
    rawType: typeof raw,
    rawValue: raw,
    rawLength: raw?.length
  });

  try {
    entries = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // console.log('[DEBUG] Entries parseadas:', { entries, isArray: Array.isArray(entries), length: entries?.length });
  } catch (parseError) {
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
  const mappedEntries = entries.map((e, index) => {
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

  try {
    // console.log('[DEBUG] Llamando processAndSaveOdontograma con:', {
    //   fileExists: !!req.file,
    //   entriesCount: req.validatedEntries?.length,
    //   patientId: req.patient.id
    // });

    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }
    
    const { imageUrl, datos } = await processAndSaveOdontograma(
      req.file,
      req.validatedEntries,
      patientId
    );

    // console.log('[DEBUG] processAndSaveOdontograma exitoso:', { imageUrl, datosCount: datos?.length });

    const snapshot = { imageUrl, datos, savedAt: new Date() };
    const odontograma = await OdontogramaModel.findOneAndUpdate(
      { patientId: patientId, type: TYPE_INITIAL },
      { $set: { current: snapshot }, $push: { history: snapshot } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({
      exists: true,
      imageUrl: odontograma.current.imageUrl,
      datos: (odontograma.current.datos || []).map(normalizeEntry),
      history: odontograma.history.map(v => ({
        id: v._id,
        imageUrl: v.imageUrl,
        fecha: v.savedAt.toISOString(),
        datos: (v.datos || []).map(normalizeEntry)
      }))
    });
  } catch (err) {
    console.log('[ERROR] Error en guardarOdontogramaInicial:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
      status: err.status
    });
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
      type: TYPE_INITIAL 
    }).select('history');

    console.log('📋 [obtenerHistorialInicial] Documento encontrado:', {
      docExists: !!doc,
      historyExists: !!doc?.history,
      historyLength: doc?.history?.length
    });

    if (!doc || !doc.history || doc.history.length === 0) {
      console.log('📭 [obtenerHistorialInicial] Sin historial, devolviendo vacío');
      return res.json({ exists: false, history: [] });
    }

    const history = doc.history.map(v => ({
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
    
    const odontograma = await OdontogramaModel.findOne({ patientId: patientId, type: TYPE_INITIAL });
    if (!odontograma || !odontograma.current) {
      return res.status(404).json({
        exists: false,
        message: 'Odontograma inicial no encontrado para agregar al historial.'
      });
    }

    const entries = req.validatedEntries.map(normalizeEntry);
    const snapshot = {
      imageUrl: odontograma.current.imageUrl,
      datos: entries,
      savedAt: new Date()
    };

    const updated = await OdontogramaModel.findOneAndUpdate(
      { patientId: patientId, type: TYPE_INITIAL },
      { $push: { history: snapshot } },
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

const deleteInitialOdontogram = async (req, res, next) => {
  try {
    const patientId = req.patient?.id || req.patient?._id;
    if (!patientId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
      });
    }
    
    const result = await OdontogramaModel.deleteOne({ patientId: patientId, type: TYPE_INITIAL });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Odontograma inicial no encontrado para eliminar.'
      });
    }

    res.json({ 
      success: true,
      message: 'Odontograma inicial eliminado correctamente' 
    });
  } catch (e) { 
    next(e); 
  }
};

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
      type: TYPE_CLINIC 
    });
    
    console.log('📋 [verificarOdontogramaClinico] Documento encontrado:', {
      docExists: !!doc,
      currentExists: !!doc?.current,
      currentDatos: doc?.current?.datos,
      historyLength: doc?.history?.length
    });

    const datos = doc?.current?.datos?.map(normalizeEntry) || [];
    const history = doc?.history?.map(h => ({
      id: h._id,
      fecha: h.savedAt.toISOString(),
      datos: (h.datos || []).map(normalizeEntry)
    })) || [];
    
    const responseData = {
      exists: doc !== null && doc.current !== null,
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
      type: TYPE_CLINIC 
    }).select('history');

    console.log('📋 [obtenerHistorialClinico] Documento encontrado:', {
      docExists: !!doc,
      historyExists: !!doc?.history,
      historyLength: doc?.history?.length
    });

    if (!doc || !doc.history || doc.history.length === 0) {
      console.log('📭 [obtenerHistorialClinico] Sin historial, devolviendo vacío');
      return res.json({ exists: false, history: [] });
    }

    const history = doc.history.map(h => ({
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
        const entries = req.validatedEntries.map(entry => {
            const normalized = normalizeEntry(entry);
            // Preservar fecha existente o usar fecha actual para nuevos daños
            return {
                ...normalized,
                fecha: entry.fecha || normalized.fecha || new Date().toISOString()
            };
        });
        
        const snapshot = {
            datos: entries,
            imageUrl: '',
            savedAt: new Date() // Esta es la fecha de guardado del snapshot, no del daño individual
        };
        
        const patientId = req.patient?.id || req.patient?._id;
        if (!patientId) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_PATIENT_ID', message: 'ID de paciente no válido' }
            });
        }
        
    const doc = await OdontogramaModel.findOneAndUpdate(
      { patientId: patientId, type: TYPE_CLINIC },
      { 
        $set: { current: snapshot },
        $push: { history: snapshot }
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
      history: doc.history.map(h => ({
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
      },
      { $pull: { history: { _id: entryId } } }
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
    
    const result = await OdontogramaModel.deleteOne({
      patientId: patientId,
      type: TYPE_CLINIC
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'DOCUMENT_NOT_FOUND', message: 'Estado del odontograma clínico no encontrado' }
      });
    }

    res.json({
      success: true,
      message: 'Estado del odontograma clínico eliminado correctamente'
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
  let raw = req.body.entries;
  let entries;

  // console.log('[DEBUG] Raw entries:', { type: typeof raw, value: raw });

  try {
    entries = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // console.log('[DEBUG] Parsed entries:', { type: typeof entries, isArray: Array.isArray(entries), length: entries?.length, value: entries });
  } catch (parseError) {
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
  const mappedEntries = entries.map((e, index) => {
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
  validarEntradasOdontograma,
  guardarOdontogramaInicial,
  obtenerHistorialInicial,
  obtenerSnapshotPorId,
  agregarHistorialInicial,
  deleteInitialOdontogram,
  verificarOdontogramaClinico,
  obtenerHistorialClinico,
  saveClinicalHistoryEntries,
  deleteClinicalHistoryEntry,
  deleteClinicalOdontogramState,
  manejarError
};

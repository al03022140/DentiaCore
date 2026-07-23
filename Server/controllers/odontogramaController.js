const {
  ValidationError,
  FileTooLargeError,
  UnsupportedMediaTypeError,
  normalizeEntry
} = require('../helpers/odontograma');
const mongoose = require('mongoose');
const fsExtra = require('fs-extra');
const OdontogramaModel = require('../models/odontograma');
const OdontogramaHistory = require('../models/odontogramaHistory');
const { hasPermission, getEffectivePermissions, isAdminRole } = require('../utils/permissions');
const { resolvePatientAppointmentId } = require('../utils/appointmentValidation');
const { computeIntegrityHash } = require('../utils/integrity');
const config = require('../config/env');

// Logging gated por NODE_ENV: los console.log informativos filtraban
// patientId y otros datos a stdout en producción. console.error y
// console.warn se mantienen siempre activos.
const debugLog = !config.isProd ? console.log.bind(console) : () => {};

// ——— Constantes de tipo de odontograma ————————————————————————————————————————————————
const TYPE_INITIAL = 'initial';
const TYPE_CLINIC = 'clinic';

// FDI: permanentes 11-48, deciduos 51-85 (idéntico al validator del modelo
// odontograma). Se usa en validarEntradasOdontograma para rechazar números de
// diente inválidos con 400 ANTES de persistir, en vez de un 500 por
// ValidationError de Mongoose al activar runValidators (P4).
const FDI_TOOTH_REGEX = /^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/;

// Espacios inter-dentales del engine: dos números FDI válidos concatenados
// (p.ej. "1817" = espacio entre 18 y 17). Identifican daños como diastema,
// prótesis fija, ortodoncia fija o transposición. Validación de FORMATO, no de
// adyacencia (ver nota extensa en models/odontograma.js): el engine es el único
// productor y emite un conjunto cerrado de IDs.
const FDI_SPACE_REGEX = /^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5]){2}$/;

// Cotas de tamaño (paridad con el hardening de otros módulos: notas 2000,
// versionName 200 como el periodontograma). El engine emite códigos numéricos
// cortos para damage y superficies tipo 'M'/'18_M'; los máximos son holgados
// para datos legítimos pero cierran el payload sin límite.
const MAX_ENTRIES = 1000;
const MAX_NOTE_LENGTH = 2000;
const MAX_DAMAGE_LENGTH = 100;
const MAX_SURFACE_LENGTH = 20;
const MAX_VERSION_NAME_LENGTH = 200;

// Genera un versionName por defecto inequívoco para una versión del odontograma
// clínico. Mismo formato que el periodontograma (periodontogramController.js):
// ISO compacto + sufijo random de 6 hex chars. El sufijo evita colisiones con
// el índice único (patient, versionName) bajo doble-click o reintentos.
const generateDefaultVersionName = () => {
  const iso = new Date().toISOString().replace(/[:.-]/g, ''); // ej. 20260613T143012345Z
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${iso}_${suffix}`;
};

// Construye la lista de versiones del odontograma clínico para la respuesta de
// la API. Lee de la colección inmutable `odontograma_history` (orden cronológico
// descendente); si está vacía para el paciente (datos legacy aún sin migrar por
// 0004), cae al array `history[]` embebido del documento. Forma homogénea:
// { id, versionName, fecha, datos }.
const buildClinicalHistoryList = async (patientId, doc) => {
  const versions = await OdontogramaHistory.find({ patient: patientId })
    .sort({ createdAt: -1 })
    .lean();
  if (versions.length > 0) {
    return versions.map(v => ({
      id: v._id,
      versionName: v.versionName,
      fecha: v.createdAt,
      datos: (v.datos || []).map(normalizeEntry)
    }));
  }
  return (doc?.history || [])
    .filter(h => !h.deletedAt)
    .map(h => ({
      id: h._id,
      versionName: h.versionName || null,
      fecha: h.savedAt ? h.savedAt.toISOString() : null,
      datos: (h.datos || []).map(normalizeEntry)
    }));
};

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
      fecha: v.savedAt ? v.savedAt.toISOString() : null,
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

// NOTA: se eliminó `hasInitialOdontogram` (GET /has-initial-odontogram). Su
// único consumidor era el fetch interno del engine (checkInitialOdontogramStatus),
// que alimentaba el guard del botón "Guardar" del engine — botón que las
// secciones React ocultan. El estado real lo gestiona el GET del odontograma
// inicial + el 409 del servidor.

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
      space: e.space || '',
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
      // P3: el guard `estado: {$ne:'OFICIAL'}` cierra la carrera TOCTOU. Si otra
      // request firmó el doc entre la verificación previa y este upsert, el
      // filtro ya no coincide y el upsert intenta INSERTAR, chocando con el
      // índice único parcial (patientId, type | deletedAt:null) → E11000, que el
      // catch traduce a 409 (no se pisa un registro ya OFICIAL e inmutable).
      { patientId: patientId, type: TYPE_INITIAL, deletedAt: null, estado: { $ne: 'OFICIAL' } },
      { $set: { current: snapshot, ...auditFields }, $push: { history: snapshot } },
      // P4: runValidators aplica el enum de `estado` y los validadores de
      // subdocumento al escribir vía $set/$push. La validación fuerte del
      // número FDI se hace además en validarEntradasOdontograma porque los
      // validadores de array bajo $push no son del todo fiables en Mongoose.
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    // Integridad NOM-024: el odontograma inicial es de captura única e
    // inmutable, pero antes nacía sin prueba criptográfica (contentHash null →
    // audit/verify daba siempre ok:false). Sellamos el hash sobre el doc YA
    // persistido (para que verify recalcule el mismo valor). Es integridad sin
    // firma con PIN: el inicial es un snapshot de estado capturado por el
    // clínico (creadoPor/savedBy), no una nota narrativa. Solo cuando nace
    // OFICIAL (un asistente lo deja en BORRADOR y se firmará después).
    if (estadoRegistro === 'OFICIAL' && !odontograma.firmadoEn && !odontograma.contentHash) {
      const hash = computeIntegrityHash(odontograma, 'odontograma');
      await OdontogramaModel.updateOne(
        { _id: odontograma._id },
        { $set: { contentHash: hash, integrityHash: hash } }
      );
      odontograma.contentHash = hash;
      odontograma.integrityHash = hash;
    }

    res.status(201).json({
      exists: true,
      datos: (odontograma.current.datos || []).map(normalizeEntry),
      history: odontograma.history.map(v => ({
        id: v._id,
        fecha: v.savedAt ? v.savedAt.toISOString() : null,
        datos: (v.datos || []).map(normalizeEntry)
      })),
      updatedAt: odontograma.updatedAt
    });
  } catch (err) {
    // P3: un upsert que choca con el índice único significa que el doc pasó a
    // OFICIAL en una request concurrente entre la verificación y el guardado →
    // 409 inmutable, en vez de un 500 opaco por duplicate key.
    if (err && err.code === 11000) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'ALREADY_SAVED',
          message: 'El odontograma inicial ya fue guardado y es inmutable. Para corregirlo, archívalo y crea uno nuevo.'
        }
      });
    }
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
      fecha: v.savedAt ? v.savedAt.toISOString() : null,
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
    
    // P5: un snapshotId que no es ObjectId provocaba CastError → 500. Validar
    // antes y responder 404 (las entradas válidas no se afectan).
    if (!mongoose.Types.ObjectId.isValid(snapshotId)) {
      return res.status(404).json({ exists: false, message: 'Snapshot no encontrado' });
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
      fecha: snapshot.savedAt ? snapshot.savedAt.toISOString() : null
    });
  } catch (error) {
    next(error);
  }
};

// NOTA: se eliminó `agregarHistorialInicial` (POST /odontograma-inicial/history).
// No tenía consumidor (el cliente sólo re-guarda vía POST /odontograma-inicial,
// que ya hace $push al history) y contradecía el diseño de captura única: era
// una segunda vía de escritura al historial inicial. Los GET de historial se
// conservan (lectura del registro clínico).

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

    // ── Listado de versiones (paridad con el periodontograma ?listVersions=true) ──
    if (req.query.listVersions === 'true') {
      const rows = await OdontogramaHistory.find({ patient: patientId })
        .sort({ createdAt: -1 })
        .select('versionName createdAt updatedAt')
        .lean();
      const seen = new Set();
      const versions = [];
      for (const r of rows) {
        const name = (r.versionName || '').trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        versions.push({ versionName: name, createdAt: r.createdAt, updatedAt: r.updatedAt });
      }
      return res.json({ success: true, versions });
    }

    // ── Datos de una versión específica (paridad con ?version=X) ──
    if (req.query.version) {
      // SEC-04: coercer a String — sin esto, `?version[$ne]=x` inyecta un
      // operador Mongo ($ne/$regex) y recupera versiones sin conocer el nombre.
      const versionName = String(req.query.version);
      const entry = await OdontogramaHistory.findOne({ patient: patientId, versionName })
        .sort({ createdAt: -1 })
        .lean();
      if (!entry) {
        return res.status(404).json({
          success: false,
          error: { code: 'VERSION_NOT_FOUND', message: 'Versión solicitada no encontrada' }
        });
      }
      return res.json({
        exists: true,
        versionName: entry.versionName,
        datos: (entry.datos || []).map(normalizeEntry),
        source: 'history',
        updatedAt: entry.updatedAt
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
    // El historial se sirve desde la colección de versiones (fallback al
    // embebido legacy si el paciente aún no se migró).
    const history = await buildClinicalHistoryList(patientId, doc);

    // updatedAt se devuelve para que el cliente lo pase como expectedUpdatedAt
    // al guardar; es la base del control de concurrencia 409.
    const responseData = {
      exists: !!doc && !!doc.current,
      versionName: doc?.current?.versionName || null,
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
    // Solo se necesita el embebido como fallback legacy; el historial real son
    // las versiones de `odontograma_history` (las resuelve buildClinicalHistoryList).
    const doc = await OdontogramaModel.findOne({
      patientId: patientId,
      type: TYPE_CLINIC,
      deletedAt: null
    }).select('history');

    const history = await buildClinicalHistoryList(patientId, doc);
    if (history.length === 0) {
      debugLog('📭 [obtenerHistorialClinico] Sin historial, devolviendo vacío');
      return res.json({ exists: false, history: [] });
    }

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
                space: normalized.space || '',
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

        // Nombre de la versión: el cliente puede mandar uno; si no, se autogenera
        // con el mismo esquema del periodontograma. Cada guardado con cambios crea
        // una versión nueva e inmutable en `odontograma_history`.
        const versionName = (typeof req.body?.versionName === 'string' && req.body.versionName.trim())
          || generateDefaultVersionName();

        // Paridad con el periodontograma (P10): cota al nombre de versión. El
        // maxlength del schema de history es el backstop (create-only, no
        // afecta legacy).
        if (versionName.length > MAX_VERSION_NAME_LENGTH) {
          return res.status(400).json({
            success: false,
            error: { code: 'VERSION_NAME_TOO_LONG', message: `versionName no puede exceder ${MAX_VERSION_NAME_LENGTH} caracteres.` }
          });
        }

        const snapshot = {
            datos: entries,
            imageUrl: '',
            versionName,
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
      const entryKey = (e) => `${e.space || ''}|${e.tooth || ''}|${e.damage}|${e.surface}|${e.note || ''}`;
      const prev = (existing?.current?.datos || []).map(entryKey).sort();
      const next = nextEntries.map(entryKey).sort();
      if (prev.length !== next.length) return false;
      return prev.every((v, i) => v === next[i]);
    };
    const shouldCreateVersion = !existingClinic || !isIdenticalToCurrent(existingClinic, entries);

    // Pre-check del nombre ANTES de escribir el doc principal. En Mongo
    // standalone (el despliegue real de la clínica) la transacción degrada a
    // escrituras separadas: sin este check, un versionName duplicado
    // actualizaba `current` con los datos del guardado RECHAZADO y dejaba
    // current.versionName apuntando a una versión vieja con otros datos.
    // El manejo de E11000 de abajo queda para la ventana de carrera residual
    // (en réplica set la transacción ya lo cubre con rollback).
    if (shouldCreateVersion) {
      const nameTaken = await OdontogramaHistory.exists({ patient: patientId, versionName });
      if (nameTaken) {
        return res.status(409).json({
          success: false,
          error: { code: 'VERSION_NAME_CONFLICT', message: `Ya existe una versión con el nombre '${versionName}'. Use un nombre diferente.` }
        });
      }
    }

    // Si NO se crea versión (guardado idéntico al actual), `current.versionName`
    // debe conservar el nombre de la versión vigente — sobrescribirlo con un
    // nombre nuevo no persistido dejaría a `current` apuntando a una versión que
    // no existe en `odontograma_history`.
    const effectiveVersionName = shouldCreateVersion
      ? versionName
      : (existingClinic?.current?.versionName || versionName);
    snapshot.versionName = effectiveVersionName;

    // Ya NO escribimos el array embebido `history[]`: se conserva intacto como
    // fuente legacy de solo lectura (lo migra 0004). Las versiones nuevas viven
    // en la colección inmutable `odontograma_history`.
    const updateOps = {
      $set: { current: snapshot, ...auditUpdate },
      $setOnInsert: { creadoPor: req.user?.id || null }
    };
    // P3: `firmadoEn: null` cierra la carrera TOCTOU. Si otra request firmó el
    // odontograma clínico entre la verificación previa y este upsert, el filtro
    // ya no coincide, el upsert intenta INSERTAR y choca con el índice único
    // parcial {patientId, type} → E11000, que traducimos a 403 inmutable.
    const filter = { patientId: patientId, type: TYPE_CLINIC, deletedAt: null, firmadoEn: null };
    const upsertOpts = { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true };

    // Escritura atómica del doc principal + la versión, con fallback a Mongo
    // standalone (mismo patrón que el periodontograma). El main se escribe
    // PRIMERO para obtener su _id (lo necesita el campo `odontograma` de la
    // versión); ante un fallo posterior el único residuo sería la versión
    // huérfana, que es append-only y no corrompe `current`.
    let doc;
    const createVersion = async (session) => {
      await OdontogramaHistory.create([{
        patient: patientId,
        odontograma: doc._id,
        appointmentId: clinicAppointmentId,
        versionName,
        datos: entries,
        createdBy: req.user?.id || null
      }], session ? { session } : undefined);
    };
    const writeWithTransaction = async (session) => {
      await session.withTransaction(async () => {
        doc = await OdontogramaModel.findOneAndUpdate(filter, updateOps, { ...upsertOpts, session });
        if (shouldCreateVersion) await createVersion(session);
      });
    };
    const writeWithoutTransaction = async () => {
      doc = await OdontogramaModel.findOneAndUpdate(filter, updateOps, upsertOpts);
      if (shouldCreateVersion) await createVersion(null);
    };
    const isStandaloneTxError = (err) => {
      const msg = String(err?.message || '');
      return (
        err?.codeName === 'IllegalOperation' ||
        err?.code === 20 ||
        msg.includes('Transaction numbers are only allowed on a replica set') ||
        msg.includes('Transactions are not supported')
      );
    };

    const session = await mongoose.startSession();
    try {
      try {
        await writeWithTransaction(session);
      } catch (txError) {
        if (isStandaloneTxError(txError)) {
          console.warn('⚠️ MongoDB standalone detectado — guardando odontograma clínico sin transacción');
          await writeWithoutTransaction();
        } else {
          throw txError;
        }
      }
    } catch (writeError) {
      // Distinguir el origen del E11000:
      //  - índice {patient, versionName} de odontograma_history → 409 conflicto de nombre
      //  - índice parcial {patientId, type} del doc principal → el clínico fue
      //    firmado en una request concurrente (TOCTOU) → 403 inmutable
      if (writeError && writeError.code === 11000) {
        const isVersionConflict = (writeError.keyPattern && writeError.keyPattern.versionName)
          || /versionName/i.test(String(writeError.message));
        if (isVersionConflict) {
          return res.status(409).json({
            success: false,
            error: { code: 'VERSION_NAME_CONFLICT', message: `Ya existe una versión con el nombre '${versionName}'. Use un nombre diferente.` }
          });
        }
        return res.status(403).json({
          success: false,
          error: { code: 'IMMUTABLE_RECORD', message: 'No se puede modificar un odontograma clínico firmado. Use addendum para correcciones.' }
        });
      }
      throw writeError;
    } finally {
      session.endSession();
    }

    const responseData = {
      exists: true,
      versionName: effectiveVersionName,
      datos: (doc.current.datos || []).map(normalizeEntry),
      history: await buildClinicalHistoryList(patientId, doc),
      updatedAt: doc.updatedAt
    };

    res.status(201).json(responseData);
  } catch (error) {
    next(error);
  }
};

// NOTA: se eliminaron `deleteClinicalHistoryEntry` (DELETE /history/:entryId)
// y `deleteClinicalOdontogramState` (DELETE /odontograma-clinico) — misma
// decisión que el DELETE del periodontograma (P2): cero consumidores en la UI.
// Además ambos habían quedado incoherentes tras la migración 0004:
//  - el delete de entrada soft-deleteaba el array embebido `history[]`, pero la
//    UI lee las versiones de la colección `odontograma_history` (inmutable) —
//    borrar ahí no tenía ningún efecto visible;
//  - el delete del doc archivaba el principal pero dejaba TODAS sus versiones
//    en `odontograma_history` (consultadas por paciente), que seguirían
//    apareciendo en el selector del sucesor y bloqueando nombres por el índice
//    único {patient, versionName}.
// Si algún día se quiere "reiniciar odontograma clínico", implementarlo
// completo (incluyendo qué hacer con las versiones del archivado).

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

  if (entries.length > MAX_ENTRIES) {
    return res.status(400).json({
      success: false,
      error: { code: 'TOO_MANY_ENTRIES', message: `entries no puede exceder ${MAX_ENTRIES} elementos.` }
    });
  }

  // Cada entrada debe ser un objeto plano con campos escalares. Antes un
  // `null` en el array reventaba normalizeEntry (TypeError → 500) y un campo
  // objeto llegaba hasta Mongoose (CastError → 500). Validamos aquí para
  // responder 400 con contexto.
  const isScalar = (v) => v === undefined || v === null || typeof v === 'string' || typeof v === 'number';
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ENTRY', message: `Entry #${i} debe ser un objeto`, invalidEntry: e ?? null }
      });
    }
    for (const field of ['tooth', 'diente', 'space', 'espacio', 'damage', 'condition', 'tipo', 'surface', 'superficie', 'note', 'nota']) {
      if (!isScalar(e[field])) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ENTRY', message: `Entry #${i}: el campo '${field}' debe ser texto o número` }
        });
      }
    }
  }

  // Mapear usando la función normalizada del helper. Se coercen los campos a
  // String (el engine puede emitir números) para que aguas abajo el tipo sea
  // siempre uniforme.
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
    mapped.tooth = String(mapped.tooth ?? '').trim();
    mapped.damage = String(mapped.damage ?? '').trim();
    mapped.surface = String(mapped.surface ?? '0').trim() || '0';
    mapped.note = String(mapped.note ?? '');
    if (mapped.space !== undefined) mapped.space = String(mapped.space).trim();
    // debugLog(`[DEBUG] Entry #${index} mapeada:`, mapped);
    return mapped;
  });

  // Filtrar duplicados. La clave espeja la del cliente (normalizeEntriesForEngine):
  // objetivo (espacio o diente) + daño + superficie + nota. Incluir `note` evita
  // descartar una entrada sólo-nota que comparte diente/daño con otra.
  const uniqueEntries = [];
  const seenEntries = new Set();

  for (const entry of mappedEntries) {
    const target = entry.space ? `s:${entry.space}` : `t:${entry.tooth}`;
    const entryKey = `${target}|${entry.damage}|${entry.surface}|${entry.note || ''}`;

    if (!seenEntries.has(entryKey)) {
      seenEntries.add(entryKey);
      uniqueEntries.push(entry);
    } else {
      console.warn(`[DUPLICATE FILTER] Entrada duplicada detectada y filtrada:`, {
        tooth: entry.tooth,
        space: entry.space,
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
    // Una entrada identifica su objetivo por `tooth` (diente) O por `space`
    // (daño inter-dental: diastema, prótesis fija…). Y debe aplicar algo:
    // un daño, o al menos una nota (entradas sólo-nota del textBox del engine).
    if (!item.tooth && !item.space) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ENTRY',
          message: `Entry #${i} debe tener 'tooth' o 'space'`,
          invalidEntry: item
        }
      });
    }
    if (item.damage === '' && !(item.note && String(item.note).trim())) {
      // debugLog(`[ERROR] Entry #${i} inválida:`, item);
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ENTRY',
          message: `Entry #${i} debe tener 'damage' (o 'condition') o una 'note'`,
          invalidEntry: item
        }
      });
    }
    // P4: rechazar número FDI inválido con un 400 claro. Antes pasaba sin
    // validar; con runValidators activo produciría un 500 por ValidationError.
    if (item.tooth && !FDI_TOOTH_REGEX.test(String(item.tooth))) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TOOTH',
          message: `Entry #${i}: '${item.tooth}' no es un número FDI válido (11-48, 51-85).`,
          invalidEntry: item
        }
      });
    }
    // Espacios inter-dentales: ID de 4 dígitos = dos números FDI adyacentes
    // concatenados (p.ej. "1817"), tal como los emite el engine.
    if (item.space && !FDI_SPACE_REGEX.test(String(item.space))) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SPACE',
          message: `Entry #${i}: '${item.space}' no es un espacio inter-dental válido (dos números FDI concatenados).`,
          invalidEntry: item
        }
      });
    }
    // Cotas de longitud: 400 claro aquí en vez de ValidationError de Mongoose
    // (500) al persistir. Los maxlength del schema quedan como backstop.
    const tooLong =
      (item.note.length > MAX_NOTE_LENGTH && `'note' excede ${MAX_NOTE_LENGTH} caracteres`) ||
      (item.damage.length > MAX_DAMAGE_LENGTH && `'damage' excede ${MAX_DAMAGE_LENGTH} caracteres`) ||
      (item.surface.length > MAX_SURFACE_LENGTH && `'surface' excede ${MAX_SURFACE_LENGTH} caracteres`);
    if (tooLong) {
      return res.status(400).json({
        success: false,
        error: { code: 'ENTRY_FIELD_TOO_LONG', message: `Entry #${i}: ${tooLong}.` }
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
    stack: !config.isProd ? err.stack : undefined
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
  // ValidationError/CastError de MONGOOSE (no la clase custom de arriba):
  // datos que esquivaron la validación del middleware y fallaron al persistir
  // con runValidators. Son entrada inválida → 400, no un 500 opaco.
  if (err && (err.name === 'ValidationError' || err.name === 'CastError')) {
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
  verificarOdontogramaClinico,
  obtenerHistorialClinico,
  saveClinicalHistoryEntries,
  manejarError
};

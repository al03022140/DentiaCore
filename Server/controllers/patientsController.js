// Import required models and dependencies
const Patient = require('../models/patient.js');
const Appointment = require('../models/appointment.js');
const Periodontogram = require('../models/periodontogram.js');
const Usuario = require('../models/users.js');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { resolveUploadsPath, ensureUploadsPath } = require('../utils/uploads');
const { hasPermission, getEffectivePermissions } = require('../utils/permissions');
const { sanitizePatientForBasicRead, BASIC_PATIENT_WRITE_FIELDS } = require('../middlewares/authorize');
const { saveSignatureDataUrl, copyFirmaToSnapshot } = require('../utils/saveSignatureImage');
const { isHCConsentActive, findLockedFieldsInPayload } = require('../utils/hcConsent');
const auditLogger = require('../middlewares/auditLogger');
const { resolvePatientAppointmentId } = require('../utils/appointmentValidation');
const { computeEvolutionNoteHash } = require('../utils/signing');

// Logs informativos sólo en desarrollo (los errores siempre se loggean).
const DEBUG_LOGS = process.env.NODE_ENV !== 'production';
const debugLog = (...args) => { if (DEBUG_LOGS) console.log(...args); };

// Utilidad compartida: calcular edad a partir de fecha de nacimiento
const calcularEdad = (fechaNacimiento) => {
    const nacimiento = fechaNacimiento instanceof Date ? fechaNacimiento : new Date(fechaNacimiento);
    const hoy = new Date();
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    if (hoy.getMonth() < nacimiento.getMonth() || 
        (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate())) {
        edad--;
    }
    return edad;
};

// 🔥 Función temporal para desarrollo - Borrar todos los pacientes
exports.deleteAllPatients = async (req, res) => {
    // 🚫 BLOQUEADO fuera de modo desarrollo
    if (process.env.NODE_ENV !== 'development') {
        return res.status(403).json({ message: 'Función deshabilitada en producción' });
    }

    try {
        // Verificar que no se esté intentando convertir un ID (evitar el error de Cast to ObjectId)
        if (req.params.id) {
            return res.status(400).json({ message: 'Esta ruta no acepta parámetros de ID' });
        }
        
        // Requerir confirmación explícita
        const { confirm } = req.body;
        if (confirm !== 'CONFIRMAR_BORRADO_TOTAL') {
            return res.status(400).json({ message: 'Se requiere confirmación explícita para borrar todos los pacientes' });
        }
        
        console.log('⚠️ ADVERTENCIA: Borrando TODOS los pacientes de la base de datos');
        
        // Borrar todos los pacientes
        const result = await Patient.deleteMany({});
        
        // Borrar archivos asociados
    const pacientesDir = resolveUploadsPath('pacientes');
        await fs.emptyDir(pacientesDir);
        
        console.log(`✅ Borrados ${result.deletedCount} pacientes y sus archivos`);
        
        res.status(200).json({
            message: `Se borraron ${result.deletedCount} pacientes`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('❌ Error al borrar pacientes:', error);
        res.status(500).json({ message: 'Error al borrar pacientes', error: error.message });
    }
};




/** 🔹 Obtener todos los pacientes */
// Campos que necesita la lista de pacientes / selects de paciente. NO incluye
// historia clínica, encuestas, periodontogramas, etc. — el detalle individual
// se obtiene con GET /patients/:id. Reduce el payload ~15-25x con muchos
// pacientes.
//
// Nota: `ultimaVisita` no es un campo persistido del modelo Patient — se
// calcula en runtime a partir de la última cita atendida (ver agregación
// más abajo). Por eso NO aparece en el select.
const PATIENT_LIST_FIELDS = [
    '_id',
    'paciente_id',
    'primer_nombre', 'segundo_nombre', 'otros_nombres',
    'apellido_paterno', 'apellido_materno',
    'fecha_nacimiento', 'edad', 'sexo',
    'photoURL',
    'documento',
    'contacto',
    'createdAt', 'updatedAt',
].join(' ');

// Estados de cita que cuentan como "visita atendida" para `ultimaVisita`:
//  - Pasada / EnCurso: la atención ocurrió.
//  - Confirmada: cita confirmada por el paciente; si su fecha ya pasó pero
//    el hook pre-save aún no la migró a "Pasada", igual cuenta.
// NO cuentan: Pendiente (sin confirmar), NoShow (no llegó), Cancelada.
const VISITA_ESTADOS = ['Pasada', 'EnCurso', 'Confirmada'];

exports.getAllPatients = async (req, res) => {
    try {
        debugLog("📡 Solicitando todos los pacientes...");

        // Implementar paginación opcional
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 0; // 0 significa sin límite
        const skip = (page - 1) * limit;

        // Construir la consulta base (excluir pacientes dados de baja).
        // .select() limita los campos al subset que necesita la lista.
        // .lean() devuelve POJOs en vez de docs Mongoose hidratados (más rápido).
        let query = Patient.find({ deletedAt: null })
            .select(PATIENT_LIST_FIELDS)
            .lean();

        // Aplicar paginación si se especifica un límite
        if (limit > 0) {
            query = query.skip(skip).limit(limit);
        }

        // Ejecutar la consulta en paralelo con el conteo total
        const [patients, total] = await Promise.all([
            query.exec(),
            Patient.countDocuments({ deletedAt: null })
        ]);

        if (!patients.length) {
            debugLog("⚠️ No se encontraron pacientes.");
        }

        // ── Calcular `ultimaVisita` por paciente en UNA sola agregación ──
        // Para cada paciente de la página, tomamos la fecha de la última
        // cita "atendida" (estado en VISITA_ESTADOS, fecha_hora ≤ ahora,
        // no soft-deleted). Una agregación evita N queries (una por
        // paciente) y escala bien aunque haya cientos de pacientes.
        const patientIds = patients.map(p => p._id);
        const now = new Date();
        const lastVisits = patientIds.length
            ? await Appointment.aggregate([
                {
                    $match: {
                        paciente_id: { $in: patientIds },
                        deletedAt: null,
                        fecha_hora: { $lte: now },
                        estado: { $in: VISITA_ESTADOS }
                    }
                },
                { $sort: { fecha_hora: -1 } },
                {
                    $group: {
                        _id: '$paciente_id',
                        ultimaVisita: { $first: '$fecha_hora' }
                    }
                }
            ])
            : [];

        const visitMap = new Map();
        for (const v of lastVisits) {
            visitMap.set(String(v._id), v.ultimaVisita);
        }

        // Verificar que todos los pacientes tengan un `paciente_id` generado correctamente.
        // Con .lean() ya son POJOs, no necesitamos .toObject().
        let patientsWithId = patients.map(patient => ({
            ...patient,
            paciente_id: patient.paciente_id || "No asignado",
            ultimaVisita: visitMap.get(String(patient._id)) || null
        }));

        // Filtrar datos clínicos si el usuario solo tiene patients.read.basic
        if (req.filterClinicalData) {
            patientsWithId = patientsWithId.map(p => sanitizePatientForBasicRead(p));
        }

        // Incluir información de paginación en la respuesta
        res.status(200).json({
            patients: patientsWithId,
            pagination: {
                total,
                page,
                limit: limit > 0 ? limit : total,
                pages: limit > 0 ? Math.ceil(total / limit) : 1
            }
        });
    } catch (error) {
        console.error("❌ Error al obtener los pacientes:", error);
        res.status(500).json({ message: 'Error al obtener los pacientes', error: error.message });
    }
};

// GET /patients/search?q=algo — búsqueda ligera para autocompletes.
// Match insensible a mayúsculas/acentos en primer_nombre, otros_nombres,
// apellido_paterno, apellido_materno y paciente_id.
exports.searchPatients = async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        if (q.length < 2) {
            return res.status(200).json({ patients: [] });
        }
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 30);

        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(escaped, 'i');

        const patients = await Patient.find({
            deletedAt: null,
            $or: [
                { primer_nombre: re },
                { otros_nombres: re },
                { apellido_paterno: re },
                { apellido_materno: re },
                { paciente_id: re }
            ]
        })
        .select('primer_nombre otros_nombres apellido_paterno apellido_materno photoURL fecha_nacimiento sexo paciente_id')
        .limit(limit)
        .lean();

        const sanitized = req.filterClinicalData
            ? patients.map(p => sanitizePatientForBasicRead(p))
            : patients;

        res.status(200).json({ patients: sanitized });
    } catch (error) {
        console.error('❌ Error en searchPatients:', error);
        res.status(500).json({ message: 'Error al buscar pacientes', error: error.message });
    }
};


exports.getPatientById = async (req, res) => {
    try {
      const { id } = req.params;
      debugLog("🔍 Buscando paciente con _id:", id);
  
      if (!id) {
        return res.status(400).json({ message: "El ID del paciente es obligatorio" });
      }
      
      // Validar si el ID tiene el formato correcto de MongoDB
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "El formato del ID del paciente no es válido" });
      }
  
      // Buscar usando el _id de MongoDB (excluyendo dados de baja)
      const patient = await Patient.findOne({ _id: id, deletedAt: null }).exec();
  
      if (!patient) {
        debugLog("⚠️ Paciente no encontrado en la base de datos.");
        return res.status(404).json({ message: "Paciente no encontrado" });
      }

      // 📌 MEJORA: Obtener citas del modelo Appointment independiente
      // (Campo 'citas' eliminado del modelo Patient por redundancia)
      // Filtra soft-deleted para no mostrar citas zombies en el expediente.
      const citas = await Appointment.find({ paciente_id: patient._id, deletedAt: null })
        .sort({ fecha_hora: 1 })
        .exec();
  
      // Obtener la fecha actual sin componente de tiempo para comparaciones precisas
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      
      // Filtrar citas pasadas y futuras con manejo de fechas mejorado
      const citasPasadas = citas.filter(cita => {
        const fechaCita = new Date(cita.fecha_hora);
        return fechaCita < hoy;
      }).sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora)); // Ordenar descendente
      
      const citasFuturas = citas.filter(cita => {
        const fechaCita = new Date(cita.fecha_hora);
        return fechaCita >= hoy;
      }).sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora)); // Ordenar ascendente
      
      // Respuesta enriquecida con información adicional
      // Filtrar datos clínicos si el usuario solo tiene patients.read.basic
      const patientObj = req.filterClinicalData
        ? sanitizePatientForBasicRead(patient)
        : patient.toObject();

      // Filtrar subdocs soft-deleted. Antes se devolvía toda la lista, lo
      // que mostraba notas/planes "borradas" en la UI del expediente.
      if (Array.isArray(patientObj.notas_evolucion)) {
        patientObj.notas_evolucion = patientObj.notas_evolucion.filter(n => !n.deletedAt);
      }
      if (Array.isArray(patientObj.planes_tratamiento)) {
        patientObj.planes_tratamiento = patientObj.planes_tratamiento.filter(p => !p.deletedAt);
      }

      res.status(200).json({
        patient: patientObj,
        citas: {
          pasadas: citasPasadas,
          futuras: citasFuturas,
          total: citas.length,
          ultimaCita: citasPasadas[0] || null,
          proximaCita: citasFuturas[0] || null
        }
      });
    } catch (error) {
      console.error("❌ Error al obtener el paciente:", error);
      
      // Manejo de errores específicos
      if (error.name === 'CastError') {
        return res.status(400).json({ message: "Formato de ID inválido", error: error.message });
      }
      
      res.status(500).json({ message: "Error al obtener el paciente", error: error.message });
    }
  };
  



// Campos que el cliente puede enviar al crear un paciente.
// Cualquier otro campo (paciente_id, _id, edad, ruta_archivos, notas_evolucion,
// planes_tratamiento, creadoPor, integrityHash, deletedAt, etc.) lo controla
// el servidor para evitar mass-assignment.
const CREATE_ALLOWED_FIELDS = [
    'documento', 'primer_nombre', 'otros_nombres', 'apellido_paterno', 'apellido_materno',
    'fecha_nacimiento', 'sexo', 'estado_civil', 'nacionalidad', 'lugar_nacimiento',
    'escolaridad', 'ocupacion', 'email', 'situacion_laboral', 'contacto',
    'contactos_emergencia', 'antecedentes_heredo_familiares', 'encuesta_medica',
    'informacion_femenina', 'habitos_higiene', 'evaluacion_dental_oclusal',
    'datosNoCompartir'
];

/** 🔹 Crear un paciente con subida de foto */
exports.createPatient = async (req, res) => {
    // Si multer subió la foto, ya creó la carpeta en uploads/pacientes/<req.body._id>.
    // Si en cualquier punto fallamos antes de guardar, limpiamos esa carpeta para no
    // dejar fotos huérfanas en disco.
    let folderIdToCleanup = (req.file && req.body._id && mongoose.Types.ObjectId.isValid(req.body._id))
        ? req.body._id
        : null;
    let savedSuccessfully = false;

    try {
        // 📌 Parsear datos del paciente si vienen en el campo patientData (FormData)
        let patientData = req.body;
        if (req.body.patientData) {
            try {
                patientData = JSON.parse(req.body.patientData);
            } catch (parseError) {
                console.error("Error al parsear patientData:", parseError);
                return res.status(400).json({
                    message: "Error al parsear los datos del paciente",
                    code: 'INVALID_JSON',
                    detail: parseError?.message || null,
                });
            }
        }

        // Sanitizar y limitar tamaño de payload
        const payloadSize = estimatePayloadSize(patientData);
        const MAX_PAYLOAD_SIZE_BYTES = 2 * 1024 * 1024;
        if (payloadSize > MAX_PAYLOAD_SIZE_BYTES) {
            return res.status(413).json({
                message: "El formulario enviado es demasiado grande",
                error: `Payload de ${payloadSize} bytes supera el límite permitido (${MAX_PAYLOAD_SIZE_BYTES})`
            });
        }
        patientData = sanitizeAndLimitPayload(patientData);

        // Filtrar entradas vacías en sub-arreglos
        if (Array.isArray(patientData.contactos_emergencia)) {
            patientData.contactos_emergencia = patientData.contactos_emergencia.filter(c =>
                c && typeof c === 'object' &&
                (c.nombre && String(c.nombre).trim()) &&
                (c.parentesco && String(c.parentesco).trim()) &&
                (c.telefono && String(c.telefono).trim())
            );
        }
        if (Array.isArray(patientData.antecedentes_heredo_familiares)) {
            patientData.antecedentes_heredo_familiares = patientData.antecedentes_heredo_familiares.filter(a => {
                const p = a && a.parentesco ? String(a.parentesco).trim() : '';
                const ant = a && a.antecedentes ? String(a.antecedentes).trim() : '';
                const esp = a && a.parentesco_especifico ? String(a.parentesco_especifico).trim() : '';
                if (!p || !ant) return false;
                if (p === 'Otros') return !!esp;
                return true;
            });
        }

        // Whitelist: solo aceptamos campos clínicos/demográficos del cliente.
        // Esto bloquea mass-assignment de _id, paciente_id, notas_evolucion,
        // planes_tratamiento, firmadoPor, integrityHash, deletedAt, etc.
        // Si el usuario sólo tiene `patients.create.basic` (recepcionista),
        // restringimos aún más a la ficha básica de identificación —
        // roles.MD: "Crear pacientes (ficha básica, sin historia clínica)".
        const hasFullCreate = hasPermission(req.user?.permissions, ['patients.create']);
        const allowedFields = hasFullCreate ? CREATE_ALLOWED_FIELDS : BASIC_PATIENT_WRITE_FIELDS;
        const safePatientData = {};
        for (const key of allowedFields) {
            if (patientData[key] !== undefined) safePatientData[key] = patientData[key];
        }

        // Validar fecha de nacimiento (rango, no futura, edad <= 120)
        if (!safePatientData.fecha_nacimiento) {
            return res.status(400).json({ message: "Fecha de nacimiento no proporcionada" });
        }
        const parsed = parseAndValidateBirthDate(safePatientData.fecha_nacimiento);
        if (!parsed) {
            return res.status(400).json({ message: "Fecha de nacimiento inválida" });
        }
        if (parsed.error === 'future') {
            return res.status(400).json({ message: "La fecha de nacimiento no puede ser futura" });
        }
        if (parsed.error === 'too_old') {
            return res.status(400).json({ message: "La fecha de nacimiento implica una edad mayor a 120 años" });
        }
        safePatientData.fecha_nacimiento = parsed.date;

        // Normalizar documento.numero (trim + uppercase) ANTES del unique-validator
        // para que la detección de duplicados sea case-insensitive de facto.
        if (safePatientData.documento && safePatientData.documento.numero != null) {
            safePatientData.documento.numero = String(safePatientData.documento.numero).trim().toUpperCase();
            if (!safePatientData.documento.numero) {
                return res.status(400).json({ message: "Número de documento es obligatorio" });
            }
        }

        // _id del paciente: siempre lo decide el servidor. Si multer ya creó
        // una carpeta usando un _id generado por sí mismo, lo reutilizamos para
        // que la foto subida quede en la carpeta correcta.
        let patientObjectId;
        if (req.body._id && mongoose.Types.ObjectId.isValid(req.body._id)) {
            patientObjectId = new mongoose.Types.ObjectId(req.body._id);
        } else {
            patientObjectId = new mongoose.Types.ObjectId();
        }
        const patientIdStr = patientObjectId.toString();
        folderIdToCleanup = patientIdStr;

        // Generar paciente_id (4 dígitos) — la colisión se reintenta abajo en save
        const pacienteId = await Patient.generateUniquePatientId();

        const newPatient = new Patient({
            ...safePatientData,
            _id: patientObjectId,
            paciente_id: pacienteId,
            edad: calcularEdad(safePatientData.fecha_nacimiento),
            creadoPor: req.user?.id || null
        });

        // Asegurar estructura de carpetas (multer pudo haber creado profile-pic ya)
        const patientFolderPath = resolveUploadsPath('pacientes', patientIdStr);
        try {
            await ensureUploadsPath('pacientes');
            await ensureUploadsPath('pacientes', patientIdStr);
            await ensureUploadsPath('pacientes', patientIdStr, 'odontograma-inicial');
            await ensureUploadsPath('pacientes', patientIdStr, 'profile-pic');
            newPatient.ruta_archivos = patientFolderPath;
        } catch (err) {
            console.error('❌ Error al crear carpetas del paciente:', err);
            return res.status(503).json({
                message: 'No se pudo crear la estructura de carpetas para el paciente',
                error: err?.message || String(err)
            });
        }

        // photoURL = ruta servible de la foto subida por multer
        if (req.file) {
            newPatient.photoURL = `/uploads/pacientes/${patientIdStr}/profile-pic/${req.file.filename}`;
        }

        // Guardar con retry ante colisión de paciente_id (rango 1000-9999)
        await savePatientWithRetry(newPatient);
        savedSuccessfully = true;
        debugLog("✅ Paciente guardado exitosamente con ID:", newPatient._id);

        // Periodontograma inicial (best-effort, no aborta la creación)
        try {
            const initialPeriodontogram = await Periodontogram.createInitial(newPatient._id);
            debugLog("✅ Periodontograma inicial creado con ID:", initialPeriodontogram._id);
        } catch (periodontogramError) {
            console.error("⚠️ Error al crear periodontograma inicial:", periodontogramError.message);
        }

        return res.status(201).json({
            message: "✅ Paciente creado correctamente",
            patient: newPatient
        });

    } catch (error) {
        console.error("❌ Error al crear el paciente:", error);

        if (error?.name === 'ValidationError') {
            return res.status(400).json({
                message: 'Error de validación al crear el paciente',
                errors: error.errors
            });
        }
        if (error?.code === 11000 || (error?.name === 'MongoServerError' && /E11000/.test(error?.message || ''))) {
            // El campo que colisionó está en keyPattern/keyValue. Devolvemos
            // ambos para que el frontend pueda resaltar el input específico.
            const conflictField = Object.keys(error.keyPattern || error.keyValue || {})[0] || null;
            const conflictValue = conflictField && error.keyValue ? error.keyValue[conflictField] : null;
            return res.status(409).json({
                message: conflictField
                    ? `Ya existe un paciente con el mismo ${conflictField}`
                    : 'Datos duplicados (índice único)',
                code: 'DUPLICATE_KEY',
                field: conflictField,
                value: conflictValue,
                keyValue: error.keyValue || null
            });
        }
        if (error?.name === 'CastError') {
            return res.status(400).json({
                message: 'Dato con tipo inválido en el paciente',
                error: error.message
            });
        }
        return res.status(500).json({ message: "Error al crear el paciente", error: error.message });
    } finally {
        // Limpiar carpeta + foto subida si no llegamos a persistir el paciente
        if (!savedSuccessfully && folderIdToCleanup) {
            try {
                const folder = resolveUploadsPath('pacientes', folderIdToCleanup);
                if (await fs.pathExists(folder)) {
                    await fs.remove(folder);
                    console.log("🧹 Carpeta limpiada tras fallo de creación:", folder);
                }
            } catch (cleanupErr) {
                console.error("Error limpiando carpeta tras fallo:", cleanupErr);
            }
        }
    }
};

/** 🔹 Crear múltiples pacientes (batch) */
exports.createPatients = async (req, res) => {
    try {
        if (!Array.isArray(req.body) || req.body.length === 0) {
            return res.status(400).json({ message: "Debe enviar un array de pacientes" });
        }

        const MAX_BATCH = 100;
        if (req.body.length > MAX_BATCH) {
            return res.status(400).json({ message: `El batch máximo es de ${MAX_BATCH} pacientes` });
        }

        const patientsToInsert = [];
        for (let i = 0; i < req.body.length; i++) {
            const raw = req.body[i];
            if (!raw || typeof raw !== 'object') {
                return res.status(400).json({ message: `Entrada inválida en índice ${i}` });
            }

            // Whitelist por entrada (mismo set que createPatient) — bloquea
            // mass-assignment de notas, planes, paciente_id, _id, etc.
            const safe = {};
            for (const key of CREATE_ALLOWED_FIELDS) {
                if (raw[key] !== undefined) safe[key] = raw[key];
            }

            if (!safe.fecha_nacimiento) {
                return res.status(400).json({ message: `Falta fecha_nacimiento en índice ${i}` });
            }
            const parsed = parseAndValidateBirthDate(safe.fecha_nacimiento);
            if (!parsed) {
                return res.status(400).json({ message: `Fecha de nacimiento inválida en índice ${i}` });
            }
            if (parsed.error === 'future') {
                return res.status(400).json({ message: `Fecha de nacimiento futura en índice ${i}` });
            }
            if (parsed.error === 'too_old') {
                return res.status(400).json({ message: `Edad mayor a 120 años en índice ${i}` });
            }
            safe.fecha_nacimiento = parsed.date;

            if (safe.documento && safe.documento.numero != null) {
                safe.documento.numero = String(safe.documento.numero).trim().toUpperCase();
                if (!safe.documento.numero) {
                    return res.status(400).json({ message: `Número de documento vacío en índice ${i}` });
                }
            }

            const pacienteId = await Patient.generateUniquePatientId();
            const newPatient = new Patient({
                ...safe,
                paciente_id: pacienteId,
                edad: calcularEdad(safe.fecha_nacimiento),
                creadoPor: req.user?.id || null
            });
            patientsToInsert.push(newPatient);
        }

        const newPatients = await Patient.insertMany(patientsToInsert);
        res.status(201).json({
            message: "Pacientes creados correctamente",
            patients: newPatients
        });

    } catch (error) {
        console.error("❌ Error al crear los pacientes:", error);
        if (error?.name === 'ValidationError') {
            return res.status(400).json({ message: 'Error de validación', errors: error.errors });
        }
        if (error?.code === 11000) {
            return res.status(409).json({ message: 'Datos duplicados (índice único)', keyValue: error.keyValue || null });
        }
        res.status(500).json({ message: "Error al crear los pacientes", error: error.message });
    }
};

// Campos que el cliente puede modificar en un PUT. Para evitar
// mass-assignment + bypass del middleware pre-save (findOneAndUpdate NO
// dispara las hooks que protegen notas/planes), esta lista no incluye
// paciente_id, notas_evolucion, planes_tratamiento, firmadoPor, integrityHash
// ni nada de auditoría/soft-delete.
const UPDATE_ALLOWED_FIELDS = [
    'documento', 'primer_nombre', 'otros_nombres', 'apellido_paterno', 'apellido_materno',
    'fecha_nacimiento', 'sexo', 'estado_civil', 'nacionalidad', 'lugar_nacimiento',
    'escolaridad', 'ocupacion', 'email', 'situacion_laboral', 'contacto',
    'contactos_emergencia', 'antecedentes_heredo_familiares', 'encuesta_medica',
    'informacion_femenina', 'habitos_higiene', 'evaluacion_dental_oclusal',
    'datosNoCompartir'
];

/** 🔹 Actualizar paciente */
exports.updatePatient = async (req, res) => {
    // Si multer subió una foto nueva, queda en disco aunque el update falle
    // o el paciente no exista. Track para limpiar después.
    const uploadedFile = req.file || null;
    let updateSucceeded = false;

    try {
        // 📌 Parsear datos enviados como FormData (patientData) y preparar update
        let updateData = req.body || {};
        if (req.body && typeof req.body.patientData === 'string') {
            try {
                updateData = JSON.parse(req.body.patientData);
            } catch (_parseError) {
                return res.status(400).json({ message: 'Error al parsear los datos del paciente (patientData)' });
            }
        }

        // 🔒 Limitar y sanitizar payload para evitar errores por formularios grandes o XSS
        const payloadSize = estimatePayloadSize(updateData);
        const MAX_PAYLOAD_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
        if (payloadSize > MAX_PAYLOAD_SIZE_BYTES) {
            return res.status(413).json({
                message: 'El formulario enviado es demasiado grande',
                error: `Payload de ${payloadSize} bytes supera el límite permitido (${MAX_PAYLOAD_SIZE_BYTES})`
            });
        }
        updateData = sanitizeAndLimitPayload(updateData);
        if (Array.isArray(updateData.contactos_emergencia)) {
            updateData.contactos_emergencia = updateData.contactos_emergencia.filter(c => c && typeof c === 'object' && (c.nombre && String(c.nombre).trim()) && (c.parentesco && String(c.parentesco).trim()) && (c.telefono && String(c.telefono).trim()));
        }
        if (Array.isArray(updateData.antecedentes_heredo_familiares)) {
            updateData.antecedentes_heredo_familiares = updateData.antecedentes_heredo_familiares.filter(a => {
                const p = a && a.parentesco ? String(a.parentesco).trim() : '';
                const ant = a && a.antecedentes ? String(a.antecedentes).trim() : '';
                const esp = a && a.parentesco_especifico ? String(a.parentesco_especifico).trim() : '';
                if (!p || !ant) return false;
                if (p === 'Otros') return !!esp;
                return true;
            });
        }

        // Control de concurrencia optimista: si el cliente envía
        // `expectedUpdatedAt` (timestamp del documento en su última lectura),
        // validamos que el documento no haya cambiado en BD entre tanto. Si
        // cambió, devolvemos 409 para que el cliente pueda recargar y
        // resolver el conflicto en lugar de pisar cambios ajenos. El campo
        // es opcional para no romper clientes existentes.
        const expectedUpdatedAtRaw = updateData.expectedUpdatedAt;
        if (expectedUpdatedAtRaw !== undefined && expectedUpdatedAtRaw !== null) {
            const expectedDate = new Date(expectedUpdatedAtRaw);
            if (Number.isNaN(expectedDate.getTime())) {
                return res.status(400).json({
                    message: 'expectedUpdatedAt no es una fecha válida',
                    code: 'INVALID_EXPECTED_UPDATED_AT'
                });
            }
            const current = await Patient.findOne(
                { _id: req.params.id, deletedAt: null }
            ).select('updatedAt').lean();
            if (!current) {
                return res.status(404).json({ message: 'Paciente no encontrado' });
            }
            const currentMs = new Date(current.updatedAt).getTime();
            const expectedMs = expectedDate.getTime();
            // 1s de tolerancia para round-trips de serialización JSON.
            if (Math.abs(currentMs - expectedMs) > 1000) {
                return res.status(409).json({
                    message: 'El paciente fue modificado por otra sesión. Recarga para ver los cambios antes de guardar.',
                    code: 'PATIENT_STALE',
                    serverUpdatedAt: current.updatedAt
                });
            }
        }

        // Whitelist: el cliente sólo puede tocar campos clínicos/demográficos.
        // notas_evolucion y planes_tratamiento son inmutables por NOM-004 y se
        // editan únicamente vía sus endpoints dedicados (que respetan las hooks
        // pre-save). findOneAndUpdate bypassa esas hooks, así que el whitelist
        // es la barrera principal.
        // Si el usuario sólo tiene `patients.update.basic` (recepcionista),
        // restringimos a la ficha básica — sin tocar el expediente clínico.
        const hasFullUpdate = hasPermission(req.user?.permissions, ['patients.update']);
        const allowedUpdateFields = hasFullUpdate ? UPDATE_ALLOWED_FIELDS : BASIC_PATIENT_WRITE_FIELDS;
        const safeUpdate = {};
        for (const key of allowedUpdateFields) {
            if (updateData[key] !== undefined) safeUpdate[key] = updateData[key];
        }

        // 🔒 HC firmada: bloquear cambios a secciones clínicas y datos del paciente
        // NOM-004 §6.3: el expediente clínico no puede modificarse una vez
        // atestado por el paciente. Para corregir, hay que revocar primero.
        const lockedFieldsInPayload = findLockedFieldsInPayload(safeUpdate);
        if (lockedFieldsInPayload.length > 0) {
            const consentCheck = await Patient.findOne(
                { _id: req.params.id, deletedAt: null }
            ).select('consentimientoHC').lean();
            if (consentCheck && isHCConsentActive(consentCheck)) {
                return res.status(409).json({
                    message: 'La historia clínica está firmada por el paciente y no puede modificarse. ' +
                             'Para corregir información clínica, primero revoque el consentimiento.',
                    code: 'HC_CONSENT_LOCKED',
                    lockedFields: lockedFieldsInPayload,
                });
            }
        }

        // Normalizar y validar fecha_nacimiento si se incluye
        if (safeUpdate.fecha_nacimiento !== undefined) {
            const parsed = parseAndValidateBirthDate(safeUpdate.fecha_nacimiento);
            if (!parsed) {
                return res.status(400).json({ message: 'Fecha de nacimiento inválida' });
            }
            if (parsed.error === 'future') {
                return res.status(400).json({ message: 'La fecha de nacimiento no puede ser futura' });
            }
            if (parsed.error === 'too_old') {
                return res.status(400).json({ message: 'La fecha de nacimiento implica una edad mayor a 120 años' });
            }
            safeUpdate.fecha_nacimiento = parsed.date;
            safeUpdate.edad = calcularEdad(parsed.date);
        }

        // Normalizar documento.numero igual que en create
        if (safeUpdate.documento && safeUpdate.documento.numero != null) {
            const norm = String(safeUpdate.documento.numero).trim().toUpperCase();
            if (!norm) {
                return res.status(400).json({ message: 'Número de documento es obligatorio' });
            }
            safeUpdate.documento.numero = norm;
        }

        // Foto: ruta servible. Sólo `photoURL` existe en el schema.
        if (uploadedFile) {
            safeUpdate.photoURL = `/uploads/pacientes/${req.params.id}/profile-pic/${uploadedFile.filename}`;
        } else if (
            Object.prototype.hasOwnProperty.call(updateData, 'photoURL') &&
            updateData.photoURL === ''
        ) {
            // El cliente envió `photoURL: ""` explícitamente para BORRAR la foto.
            // photoURL no está en UPDATE_ALLOWED_FIELDS para impedir
            // mass-assignment (un cliente no debería poder setear un path
            // arbitrario), así que el clear se maneja aquí: limpiamos el campo
            // del documento y borramos el archivo físico para no dejar
            // huérfanos en disco. Cualquier otro valor de `photoURL` que venga
            // en el payload se ignora silenciosamente.
            try {
                const current = await Patient.findOne(
                    { _id: req.params.id, deletedAt: null }
                ).select('photoURL').lean();
                if (current?.photoURL && current.photoURL.startsWith('/uploads/pacientes/')) {
                    const filename = path.basename(current.photoURL);
                    if (filename) {
                        const fileToDelete = resolveUploadsPath(
                            'pacientes',
                            String(req.params.id),
                            'profile-pic',
                            filename
                        );
                        if (await fs.pathExists(fileToDelete)) {
                            await fs.remove(fileToDelete);
                        }
                    }
                }
            } catch (delErr) {
                // No bloqueamos el clear de la BD si el archivo no se pudo
                // borrar (puede que ya no exista). Sólo loggeamos.
                console.error('Error eliminando archivo de foto al limpiar photoURL:', delErr);
            }
            safeUpdate.photoURL = '';
        }

        // Aplanar a notación con puntos para no reemplazar subdocumentos completos
        const flattenToDot = (obj, prefix = '') => {
            const res = {};
            for (const [key, value] of Object.entries(obj || {})) {
                const path = prefix ? `${prefix}.${key}` : key;
                if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                    Object.assign(res, flattenToDot(value, path));
                } else {
                    res[path] = value;
                }
            }
            return res;
        };
        const setPayload = flattenToDot(safeUpdate);

        // Auditoría
        setPayload.modificadoPor = req.user?.id || null;
        setPayload.modificadoEn = new Date();

        const updatedPatient = await Patient.findOneAndUpdate(
            { _id: req.params.id, deletedAt: null },
            { $set: setPayload },
            { new: true, runValidators: true, context: 'query' }
        );

        if (!updatedPatient) {
            return res.status(404).json({ message: "Paciente no encontrado" });
        }

        updateSucceeded = true;
        res.status(200).json({
            message: "Paciente modificado correctamente",
            patient: updatedPatient
        });

    } catch (error) {
        console.error("❌ Error al actualizar el paciente:", error);
        // Manejo detallado de errores para mejorar la retroalimentación al cliente
        if (error?.name === 'ValidationError') {
            return res.status(400).json({
                message: 'Error de validación al actualizar el paciente',
                errors: error.errors
            });
        }
        if (error?.code === 11000 || (error?.name === 'MongoServerError' && /E11000/.test(error?.message || ''))) {
            return res.status(409).json({
                message: 'Datos duplicados (índice único) al actualizar el paciente',
                keyValue: error.keyValue || null
            });
        }
        if (error?.name === 'CastError') {
            return res.status(400).json({
                message: 'Dato con tipo inválido en la actualización del paciente',
                error: error.message
            });
        }
        return res.status(500).json({ message: "Error interno al actualizar el paciente", error: error.message });
    } finally {
        // Si subieron foto y el update no fue exitoso (validación, 404, etc.),
        // el archivo de multer quedó huérfano en profile-pic/. Borrarlo.
        if (uploadedFile && !updateSucceeded) {
            try {
                const orphan = resolveUploadsPath('pacientes', req.params.id, 'profile-pic', uploadedFile.filename);
                if (await fs.pathExists(orphan)) {
                    await fs.remove(orphan);
                    console.log("🧹 Foto huérfana eliminada tras fallo de update:", orphan);
                }
            } catch (cleanupErr) {
                console.error("Error limpiando foto huérfana tras fallo de update:", cleanupErr);
            }
        }
    }
};

/** 🔹 Soft-delete de un paciente (NOM-004: expedientes clínicos no pueden destruirse) */
exports.deletePatient = async (req, res) => {
    try {
        const { deleteReason } = req.body || {};
        if (!deleteReason || typeof deleteReason !== 'string' || deleteReason.trim().length < 10) {
            return res.status(400).json({
                message: 'Se requiere un motivo de eliminación (mínimo 10 caracteres)',
                field: 'deleteReason'
            });
        }

        const patient = await Patient.findById(req.params.id);
        if (!patient) return res.status(404).json({ message: 'Paciente no encontrado' });

        if (patient.deletedAt) {
            return res.status(409).json({ message: 'El paciente ya fue dado de baja previamente' });
        }

        // Soft-delete del paciente
        const deletedAt = new Date();
        const deletedBy = req.user?.id || null;
        const cascadeReason = 'Paciente dado de baja';
        patient.deletedAt = deletedAt;
        patient.deletedBy = deletedBy;
        patient.deleteReason = deleteReason.trim();
        await patient.save({ validateModifiedOnly: true });

        // Cascade soft-delete a registros clínicos, cargos y adjuntos.
        // Antes sólo se cascadeaba a citas, dejando odontogramas/perio/
        // charges/attachments huérfanos apuntando al paciente "borrado"
        // (LFPDPPP derecho de cancelación). Cada modelo usa su propio
        // mecanismo:
        //   - Appointment, Odontograma, Periodontogram, PatientAttachment: `deletedAt`
        //   - PatientCharge: `cancelado` con motivo
        // CashMovement NO se cascadea: no tiene deletedAt y los
        // movimientos cerrados forman parte del registro contable diario.
        const Odontograma = require('../models/odontograma.js');
        const PatientCharge = require('../models/patientCharge.js');
        const PatientAttachment = require('../models/patientAttachment.js');

        const softDeleteSet = { $set: { deletedAt, deletedBy, deleteReason: cascadeReason } };
        await Promise.all([
            Appointment.updateMany(
                { paciente_id: patient._id, deletedAt: null },
                softDeleteSet
            ),
            Odontograma.updateMany(
                { patientId: patient._id, deletedAt: null },
                softDeleteSet
            ),
            Periodontogram.updateMany(
                { patient: patient._id, deletedAt: null },
                softDeleteSet
            ),
            PatientCharge.updateMany(
                { patientId: patient._id, cancelado: { $ne: true } },
                { $set: { cancelado: true, canceladoEn: deletedAt, canceladoPor: deletedBy, canceladoMotivo: cascadeReason } }
            ),
            PatientAttachment.updateMany(
                { patientId: patient._id, deletedAt: null },
                softDeleteSet
            )
        ]);

        res.status(200).json({ message: 'Paciente dado de baja correctamente' });
    } catch (_error) {
        res.status(500).json({ message: 'Error al dar de baja al paciente', error: _error.message });
    }
};


/** 🔹 [OBSOLETO] Guardar captura del odontograma inicial — Usar modelo Odontograma independiente */
exports.saveOdontogramaScreenshot = (_req, res) => {
  return res.status(410).json({
    success: false,
    error: 'Función obsoleta: usar modelo Odontograma independiente (rutas /odontogramas)'
  });
};


/**
 * Hash determinístico del contenido de una nota de evolución.
 * Se usa como snapshot al firmar (paciente y doctor) para detectar
 * modificaciones posteriores (NOM-024).
 */
// Delega en la utilidad compartida (utils/signing) para que TODOS los caminos
// de firma de notas calculen el mismo hash. Se conserva el nombre local para
// no tocar los call sites de este controller.
function _computeEvolutionNoteHash(note) {
  return computeEvolutionNoteHash(note);
}

/** 🔹 Agregar nota de evolución */
exports.addEvolutionNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { evolutionNote, patientSignature, doctorSignature } = req.body;

    // Validar datos de entrada: al menos uno de los campos debe tener contenido
    const hasContent = evolutionNote && (
      (evolutionNote.procedimiento && evolutionNote.procedimiento.trim()) ||
      (evolutionNote.observaciones && evolutionNote.observaciones.trim()) ||
      (evolutionNote.correcciones && evolutionNote.correcciones.trim())
    );

    if (!hasContent) {
      return res.status(400).json({
        success: false,
        error: 'Al menos uno de los campos (procedimiento, observaciones, correcciones) es requerido'
      });
    }

    // Buscar el paciente (excluir soft-deleted)
    const patient = await Patient.findOne({ _id: id, deletedAt: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'Paciente no encontrado'
      });
    }

    // ── Determinar estado destino ──────────────────────────────────
    // OFICIAL si vienen ambas firmas válidas. BORRADOR si no.
    // Cualquier usuario con `consultas.create.draft` puede crear (en
    // borrador) — el asistente queda incluido. Sólo el `firmadoPor` debe
    // ser un doctor real (verificado abajo).
    const userPerms = getEffectivePermissions(req.user);
    const canCreateAny = hasPermission(userPerms, ['consultas.create']) || hasPermission(userPerms, ['consultas.create.draft']);
    if (!canCreateAny) {
      return res.status(403).json({ success: false, error: 'No tiene permiso para crear notas de evolución.' });
    }

    const hasSignaturesPayload = Boolean(patientSignature && doctorSignature && doctorSignature.method);
    let estadoRegistro = hasSignaturesPayload ? 'OFICIAL' : 'BORRADOR';

    // ── Si pide OFICIAL, validar todo ──────────────────────────────
    let signerDoctor = null;
    if (estadoRegistro === 'OFICIAL') {
      if (!patientSignature || typeof patientSignature !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'La firma del paciente es obligatoria para guardar una nota oficial.'
        });
      }
      if (doctorSignature.method !== 'pin' && doctorSignature.method !== 'pad') {
        return res.status(400).json({
          success: false,
          error: 'Método de firma del doctor inválido (use "pin" o "pad").'
        });
      }

      // Resolver QUIÉN firma:
      //  - asDoctorId presente → otro usuario (asistente pidió firma al doctor)
      //  - sin asDoctorId → req.user (auto-firma — requiere consultas.create)
      const asDoctorId = doctorSignature.asDoctorId || null;
      if (asDoctorId) {
        if (!mongoose.Types.ObjectId.isValid(asDoctorId)) {
          return res.status(400).json({ success: false, error: 'ID de doctor inválido.' });
        }
        signerDoctor = await Usuario.findById(asDoctorId);
        if (!signerDoctor) {
          return res.status(404).json({ success: false, error: 'Doctor seleccionado no encontrado.' });
        }
        if (signerDoctor.active === false) {
          return res.status(403).json({ success: false, error: 'La cuenta del doctor está desactivada.' });
        }
        if (!['doctor', 'doctor_admin'].includes(signerDoctor.rol)) {
          return res.status(403).json({ success: false, error: 'El usuario seleccionado no es doctor.' });
        }
      } else {
        // Auto-firma — req.user debe poder firmar OFICIAL (NOM-013)
        if (!hasPermission(userPerms, ['consultas.create'])) {
          return res.status(403).json({
            success: false,
            error: 'No tiene permiso para firmar notas como OFICIAL. Pida al doctor que firme.'
          });
        }
        signerDoctor = await Usuario.findById(req.user.id);
        if (!signerDoctor) {
          return res.status(401).json({ success: false, error: 'Usuario no encontrado.' });
        }
        // El firmante OFICIAL debe ser doctor real (NOM-004 Art. 5.10), igual
        // que en la rama de firma cruzada. Antes la auto-firma solo validaba
        // el permiso `consultas.create`, dejando que una cuenta no-doctor con
        // ese permiso firmara como oficial.
        if (!['doctor', 'doctor_admin'].includes(signerDoctor.rol)) {
          return res.status(403).json({ success: false, error: 'Solo un doctor puede firmar la nota como OFICIAL.' });
        }
      }

      // Verificar PIN contra el doctor que firma. Antes el método 'pad'
      // saltaba toda verificación de PIN, dejando que un asistente con
      // permisos pudiera enviar un PNG cualquiera como "firma del doctor"
      // → suplantación. Ahora ambos métodos exigen PIN del doctor.
      if (doctorSignature.method === 'pin' && !signerDoctor.firmaDigitalUrl) {
        return res.status(400).json({
          success: false,
          error: 'El doctor no tiene firma digital subida. Use el pad o suba la firma en Perfil Profesional.'
        });
      }
      if (!signerDoctor.pinHash) {
        return res.status(400).json({
          success: false,
          error: 'El doctor no tiene PIN configurado. Configure su PIN en Mi Perfil antes de firmar.'
        });
      }
      const pinResult = await signerDoctor.verificarPinDetallado(doctorSignature.pin || '');
      if (!pinResult.ok) {
        if (pinResult.locked) {
          const minutos = Math.ceil(pinResult.remainingMs / 60000);
          return res.status(429).json({
            success: false,
            error: `PIN del doctor bloqueado por demasiados intentos. Reintenta en ${minutos} minuto(s).`,
            locked: true
          });
        }
        return res.status(401).json({
          success: false,
          error: 'PIN del doctor incorrecto.',
          attemptsLeft: pinResult.attemptsLeft
        });
      }
    }

    // Calcular numero_procedimiento de forma 100% atómica con un UPDATE de
    // pipeline (Mongo 4.2+): counter = max(counterActual, #notas) + 1, todo
    // en una sola operación. Esto cubre dos casos sin ninguna race:
    //   - Pacientes normales: el counter ya va por delante → simplemente +1.
    //   - Pacientes legados sin counter persistido (o atrasado): se siembra
    //     desde el length actual sin un segundo $set no-atómico.
    // Antes el seeding se hacía con una lectura de length + un $set separado:
    // dos primeras escrituras concurrentes leían el mismo length y asignaban
    // el mismo número (el duplicado que el counter debía evitar). El counter
    // siempre sube y nunca se resetea aunque se borren notas — se aceptan
    // huecos para mantener monotonía clínica (NOM-024).
    const counterDoc = await Patient.findOneAndUpdate(
      { _id: id },
      [
        {
          $set: {
            _evolutionNoteCounter: {
              $add: [
                {
                  $max: [
                    { $ifNull: ['$_evolutionNoteCounter', 0] },
                    { $size: { $ifNull: ['$notas_evolucion', []] } },
                  ],
                },
                1,
              ],
            },
          },
        },
      ],
      { new: true, projection: { _evolutionNoteCounter: 1 } }
    );
    const numero_procedimiento = counterDoc?._evolutionNoteCounter;
    if (!numero_procedimiento) {
      return res.status(500).json({
        success: false,
        error: 'No se pudo asignar el número de la nota. Intente nuevamente.'
      });
    }

    // Preparar la nueva nota de evolución
    const now = new Date();
    // Valida que la appointment pertenezca a este paciente — evita
    // vincular notas con citas de otro paciente (cross-linking).
    const appointmentId = await resolvePatientAppointmentId(
      evolutionNote.appointmentId || req.body.appointmentId,
      id
    );
    const newEvolutionNote = {
      numero_procedimiento,
      procedimiento: (evolutionNote.procedimiento || '').trim(),
      observaciones: (evolutionNote.observaciones || '').trim(),
      correcciones: (evolutionNote.correcciones || '').trim(),
      fecha: evolutionNote.fecha ? new Date(evolutionNote.fecha) : now,
      fechaFormateada: evolutionNote.fechaFormateada || now.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      appointmentId,
      creadoPor: req.user?.id || null,
      estadoRegistro,
      capturaExtemporanea: req.body._capturaExtemporanea || undefined
    };

    // Construimos el subdocumento con el constructor del array para que
    // Mongoose aplique defaults, casting y genere el _id — pero lo
    // persistimos con un $push atómico (ver más abajo) en vez de cargar y
    // re-guardar el documento completo del paciente. Así, dos guardados
    // simultáneos del mismo paciente no se pisan: con versionKey:false el
    // save() no detectaba el conflicto y se podían perder notas.
    if (!Array.isArray(patient.notas_evolucion)) {
      patient.notas_evolucion = [];
    }
    const noteSubdoc = patient.notas_evolucion.create(newEvolutionNote);

    // Rastrea archivos de firma escritos a disco — si la inserción falla
    // los borramos para evitar dejar PNGs huérfanos (BUG-C3).
    const writtenSignaturePaths = [];

    // Persistir firmas SOLO si la nota es OFICIAL (BORRADOR sin firma)
    if (estadoRegistro === 'OFICIAL') {
      const savedSubdoc = noteSubdoc;
      const noteId = savedSubdoc._id.toString();
      const contentHash = _computeEvolutionNoteHash(savedSubdoc);

      // 1) Firma del paciente. Guardamos también el hash SHA-256 del PNG
      // (`pacienteFirmaImageHash`) para detectar tampering del archivo
      // en disco posterior al firmado (no reemplaza PKI, es defensa
      // en profundidad — un script de auditoría puede comparar).
      try {
        const patientSig = await saveSignatureDataUrl(patientSignature, [
          'pacientes', id, 'firmas-notas', `${noteId}_paciente.png`
        ]);
        if (patientSig.absPath) writtenSignaturePaths.push(patientSig.absPath);
        savedSubdoc.pacienteFirmaUrl = patientSig.publicUrl;
        savedSubdoc.pacienteFirmadoEn = now;
        savedSubdoc.pacienteFirmaContentHash = contentHash;
        savedSubdoc.pacienteFirmaImageHash = patientSig.contentHash;
      } catch (e) {
        // La nota no se va a guardar. NO decrementamos el counter: es
        // monótono por diseño (se aceptan huecos) y un $inc -1 aquí podría
        // pisar un incremento concurrente de otra nota.
        return res.status(400).json({
          success: false,
          error: `No se pudo guardar la firma del paciente: ${e.message}`
        });
      }

      // 2) Firma del doctor — siempre persistimos un snapshot servible
      // junto con el hash del PNG.
      if (doctorSignature.method === 'pad') {
        try {
          const docSig = await saveSignatureDataUrl(doctorSignature.dataUrl, [
            'pacientes', id, 'firmas-notas', `${noteId}_doctor.png`
          ]);
          if (docSig.absPath) writtenSignaturePaths.push(docSig.absPath);
          savedSubdoc.doctorFirmaUrl = docSig.publicUrl;
          savedSubdoc.doctorFirmaImageHash = docSig.contentHash;
        } catch (e) {
          // Rollback: borra la firma del paciente ya escrita. El counter es
          // monótono (no se decrementa — ver nota arriba).
          await Promise.all(writtenSignaturePaths.map(p => fs.remove(p).catch(() => {})));
          return res.status(400).json({
            success: false,
            error: `No se pudo guardar la firma del doctor: ${e.message}`
          });
        }
      } else {
        // PIN: copiar la firma del doctor a la carpeta del paciente como
        // snapshot inmutable (NOM-024). La verificación previa garantiza que
        // signerDoctor.firmaDigitalUrl existe.
        // Si la copia falla, abortamos el guardado completo en vez de dejar
        // una nota OFICIAL sin firma visible. El usuario verá el error y
        // podrá reintentar; nada se persiste en la BD (no llamamos a save()).
        try {
          const snap = await copyFirmaToSnapshot(signerDoctor.firmaDigitalUrl, [
            'pacientes', id, 'firmas-notas', `${noteId}_doctor`
          ]);
          if (snap.absPath) writtenSignaturePaths.push(snap.absPath);
          savedSubdoc.doctorFirmaUrl = snap.publicUrl;
          savedSubdoc.doctorFirmaImageHash = snap.contentHash;
        } catch (e) {
          console.error('[addEvolutionNote] Fallo al copiar snapshot de firma:', e.message);
          await Promise.all(writtenSignaturePaths.map(p => fs.remove(p).catch(() => {})));
          return res.status(500).json({
            success: false,
            error: 'No se pudo persistir el snapshot de la firma del doctor. La nota NO fue guardada. Intente nuevamente o contacte a soporte.'
          });
        }
      }
      savedSubdoc.doctorFirmaMethod = doctorSignature.method;

      // firmadoPor = el DOCTOR que firmó (puede ser ≠ del creador si fue
      // cross-user signing iniciado por un asistente).
      savedSubdoc.firmadoPor = signerDoctor._id;
      savedSubdoc.firmadoEn = now;
      savedSubdoc.contentHash = contentHash;
      savedSubdoc.firmaDesactualizada = false;
    }

    // Insertar la nota con un $push atómico al inicio del array ($position:0),
    // en vez de patient.save(). Cada inserción es una operación atómica del
    // lado de Mongo y no depende de releer/reescribir todo el documento, así
    // que guardados concurrentes del mismo paciente ya no pierden notas.
    // Si falla, rollback explícito: borra los PNGs ya escritos para no dejar
    // archivos huérfanos. El counter NO se decrementa (es monótono; el hueco
    // en la numeración es aceptable y preferible a una race de decrementos).
    try {
      const result = await Patient.updateOne(
        { _id: id, deletedAt: null },
        { $push: { notas_evolucion: { $each: [noteSubdoc.toObject()], $position: 0 } } },
        { runValidators: true }
      );
      if (!result || result.matchedCount === 0) {
        throw new Error('Paciente no encontrado al insertar la nota');
      }
    } catch (saveErr) {
      console.error('[addEvolutionNote] inserción de nota falló, ejecutando rollback:', saveErr);
      await Promise.all(writtenSignaturePaths.map(p => fs.remove(p).catch(() => {})));
      // El counter es monótono y no se decrementa (se acepta el hueco) para
      // no pisar incrementos concurrentes de otras notas.
      return res.status(500).json({
        success: false,
        error: 'No se pudo guardar la nota. Los cambios se revirtieron.'
      });
    }

    // Devolver el subdocumento guardado (con su _id ya generado)
    const savedNote = noteSubdoc;

    // Audit log: create + (si aplica) firma. Antes el flujo no registraba
    // creación de notas en AuditLog — quedaba sin trazabilidad ante
    // auditorías NOM-024.
    auditLogger.registrarManual(req, 'nota_evolucion_creada', {
      resourceType: 'patient',
      resourceId: patient._id,
      patientId: patient._id,
      detalles: {
        noteId: savedNote._id,
        numero_procedimiento: savedNote.numero_procedimiento,
        estadoRegistro: savedNote.estadoRegistro
      }
    }).catch(() => {});
    if (savedNote.firmadoPor) {
      auditLogger.registrarManual(req, 'firma_electronica', {
        resourceType: 'patient',
        resourceId: savedNote._id,
        patientId: patient._id,
        detalles: {
          context: 'nota_evolucion',
          contentHash: savedNote.contentHash,
          doctorFirmaMethod: savedNote.doctorFirmaMethod
        }
      }).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      message: 'Nota de evolución agregada correctamente',
      data: savedNote
    });
  } catch (error) {
    console.error('Error al agregar nota de evolución:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor al agregar la nota de evolución'
    });
  }
};

/**
 * 🔹 Actualizar el contenido de una nota de evolución en BORRADOR.
 *
 * PATCH /patients/:id/evolution-note/:noteId
 * Body: { procedimiento?, observaciones?, correcciones? }
 *
 * Restricciones:
 * - La nota debe seguir en BORRADOR (las OFICIAL son inmutables por NOM-024).
 * - Sólo el creador (o un admin) puede editar.
 * - Cualquier cambio queda en AuditLog.
 *
 * Sin este endpoint, un asistente que se equivoca al capturar tenía que crear
 * otra nota — contaminaba el historial. Crear y editar BORRADOR es legítimo
 * porque la nota aún no está firmada.
 */
exports.updateDraftEvolutionNote = async (req, res) => {
  try {
    const { id, noteId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(noteId)) {
      return res.status(400).json({ success: false, error: 'IDs inválidos.' });
    }

    const patient = await Patient.findOne({ _id: id, deletedAt: null });
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Paciente no encontrado.' });
    }

    const note = patient.notas_evolucion.id(noteId);
    if (!note || note.deletedAt) {
      return res.status(404).json({ success: false, error: 'Nota no encontrada.' });
    }

    if (note.estadoRegistro !== 'BORRADOR') {
      return res.status(409).json({
        success: false,
        error: 'Sólo se pueden editar notas en BORRADOR. Las notas OFICIALES son inmutables (NOM-024).'
      });
    }

    const userPerms = getEffectivePermissions(req.user);
    const isAdmin = ['administrador', 'superadmin', 'doctor_admin'].includes(req.user?.role);
    const isCreator = note.creadoPor && note.creadoPor.toString() === req.user?.id;
    if (!isAdmin && !isCreator) {
      return res.status(403).json({
        success: false,
        error: 'Sólo el creador de la nota o un administrador pueden editarla.'
      });
    }
    if (!hasPermission(userPerms, ['consultas.create', 'consultas.create.draft'])) {
      return res.status(403).json({ success: false, error: 'Permiso insuficiente.' });
    }

    const { procedimiento, observaciones, correcciones } = req.body || {};
    const changes = {};
    if (typeof procedimiento === 'string') {
      changes.procedimiento = procedimiento.trim();
      note.procedimiento = changes.procedimiento;
    }
    if (typeof observaciones === 'string') {
      changes.observaciones = observaciones.trim();
      note.observaciones = changes.observaciones;
    }
    if (typeof correcciones === 'string') {
      changes.correcciones = correcciones.trim();
      note.correcciones = changes.correcciones;
    }

    if (Object.keys(changes).length === 0) {
      return res.status(400).json({ success: false, error: 'Nada que actualizar.' });
    }

    // Al menos un campo de contenido debe quedar no vacío (igual que en create).
    const hasContent = (note.procedimiento || '').trim() || (note.observaciones || '').trim() || (note.correcciones || '').trim();
    if (!hasContent) {
      return res.status(400).json({
        success: false,
        error: 'La nota no puede quedar vacía (requiere procedimiento, observaciones o correcciones).'
      });
    }

    note.modificadoPor = req.user?.id || null;
    note.modificadoEn = new Date();

    // $set posicional atómico (en vez de patient.save()) con guardia de
    // BORRADOR: evita pisar cambios concurrentes y rechaza la edición si la
    // nota fue firmada en paralelo (pasaría a OFICIAL → inmutable).
    const updateResult = await Patient.updateOne(
      { _id: id, deletedAt: null, 'notas_evolucion._id': note._id, 'notas_evolucion.estadoRegistro': 'BORRADOR' },
      { $set: {
        'notas_evolucion.$.procedimiento': note.procedimiento,
        'notas_evolucion.$.observaciones': note.observaciones,
        'notas_evolucion.$.correcciones': note.correcciones,
        'notas_evolucion.$.modificadoPor': note.modificadoPor,
        'notas_evolucion.$.modificadoEn': note.modificadoEn,
      } }
    );
    if (!updateResult || updateResult.matchedCount === 0) {
      return res.status(409).json({
        success: false,
        error: 'La nota ya no es editable (fue firmada o modificada por otra operación). Recargue e intente de nuevo.'
      });
    }

    auditLogger.registrarManual(req, 'nota_evolucion_editada', {
      resourceType: 'patient',
      resourceId: note._id,
      patientId: patient._id,
      detalles: { campos: Object.keys(changes) }
    }).catch(() => {});

    return res.json({
      success: true,
      message: 'Nota actualizada correctamente',
      data: note
    });
  } catch (error) {
    console.error('Error en updateDraftEvolutionNote:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error interno al actualizar la nota.'
    });
  }
};

/**
 * 🔹 Firmar una nota de evolución existente (BORRADOR → OFICIAL).
 *
 * POST /patients/:id/evolution-note/:noteId/sign
 * Body: { patientSignature: dataURL, doctorSignature: { method, pin|dataUrl, asDoctorId? } }
 */
exports.signExistingEvolutionNote = async (req, res) => {
  try {
    const { id, noteId } = req.params;
    const { patientSignature, doctorSignature } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(noteId)) {
      return res.status(400).json({ success: false, error: 'IDs inválidos.' });
    }
    if (!patientSignature || typeof patientSignature !== 'string') {
      return res.status(400).json({ success: false, error: 'La firma del paciente es obligatoria.' });
    }
    if (!doctorSignature || !doctorSignature.method) {
      return res.status(400).json({ success: false, error: 'La firma del doctor es obligatoria.' });
    }
    if (doctorSignature.method !== 'pin' && doctorSignature.method !== 'pad') {
      return res.status(400).json({ success: false, error: 'Método de firma del doctor inválido (use "pin" o "pad").' });
    }

    const patient = await Patient.findOne({ _id: id, deletedAt: null });
    if (!patient) return res.status(404).json({ success: false, error: 'Paciente no encontrado.' });

    const note = patient.notas_evolucion.id(noteId);
    if (!note || note.deletedAt) return res.status(404).json({ success: false, error: 'Nota no encontrada.' });

    if (note.estadoRegistro !== 'BORRADOR') {
      return res.status(409).json({
        success: false,
        error: 'Esta nota ya está firmada como OFICIAL. Las notas OFICIALES son inmutables (NOM-024).'
      });
    }

    const userPerms = getEffectivePermissions(req.user);

    const asDoctorId = doctorSignature.asDoctorId || null;
    let signerDoctor;
    if (asDoctorId) {
      if (!mongoose.Types.ObjectId.isValid(asDoctorId)) {
        return res.status(400).json({ success: false, error: 'ID de doctor inválido.' });
      }
      signerDoctor = await Usuario.findById(asDoctorId);
      if (!signerDoctor) return res.status(404).json({ success: false, error: 'Doctor seleccionado no encontrado.' });
      if (signerDoctor.active === false) return res.status(403).json({ success: false, error: 'La cuenta del doctor está desactivada.' });
      if (!['doctor', 'doctor_admin'].includes(signerDoctor.rol)) {
        return res.status(403).json({ success: false, error: 'El usuario seleccionado no es doctor.' });
      }
    } else {
      if (!hasPermission(userPerms, ['consultas.create'])) {
        return res.status(403).json({
          success: false,
          error: 'No tiene permiso para firmar notas como OFICIAL. Pida al doctor que firme.'
        });
      }
      signerDoctor = await Usuario.findById(req.user.id);
      if (!signerDoctor) return res.status(401).json({ success: false, error: 'Usuario no encontrado.' });
      if (!['doctor', 'doctor_admin'].includes(signerDoctor.rol)) {
        return res.status(403).json({ success: false, error: 'Solo un doctor puede firmar la nota como OFICIAL.' });
      }
    }

    if (doctorSignature.method === 'pin' && !signerDoctor.firmaDigitalUrl) {
      return res.status(400).json({
        success: false,
        error: 'El doctor no tiene firma digital subida. Use el pad o suba la firma en Perfil Profesional.'
      });
    }
    if (!signerDoctor.pinHash) {
      return res.status(400).json({ success: false, error: 'El doctor no tiene PIN configurado. Configure su PIN en Mi Perfil antes de firmar.' });
    }
    const pinResult = await signerDoctor.verificarPinDetallado(doctorSignature.pin || '');
    if (!pinResult.ok) {
      if (pinResult.locked) {
        const minutos = Math.ceil(pinResult.remainingMs / 60000);
        return res.status(429).json({ success: false, error: `PIN del doctor bloqueado. Reintenta en ${minutos} minuto(s).`, locked: true });
      }
      return res.status(401).json({ success: false, error: 'PIN del doctor incorrecto.', attemptsLeft: pinResult.attemptsLeft });
    }

    const now = new Date();
    const noteIdStr = note._id.toString();
    const contentHash = _computeEvolutionNoteHash(note);
    const writtenSignaturePaths = [];

    try {
      const patientSig = await saveSignatureDataUrl(patientSignature, [
        'pacientes', id, 'firmas-notas', `${noteIdStr}_paciente.png`
      ]);
      if (patientSig.absPath) writtenSignaturePaths.push(patientSig.absPath);
      note.pacienteFirmaUrl = patientSig.publicUrl;
      note.pacienteFirmadoEn = now;
      note.pacienteFirmaContentHash = contentHash;
      note.pacienteFirmaImageHash = patientSig.contentHash;
    } catch (e) {
      return res.status(400).json({ success: false, error: `No se pudo guardar la firma del paciente: ${e.message}` });
    }

    if (doctorSignature.method === 'pad') {
      try {
        const docSig = await saveSignatureDataUrl(doctorSignature.dataUrl, [
          'pacientes', id, 'firmas-notas', `${noteIdStr}_doctor.png`
        ]);
        if (docSig.absPath) writtenSignaturePaths.push(docSig.absPath);
        note.doctorFirmaUrl = docSig.publicUrl;
        note.doctorFirmaImageHash = docSig.contentHash;
      } catch (e) {
        await Promise.all(writtenSignaturePaths.map(p => fs.remove(p).catch(() => {})));
        return res.status(400).json({ success: false, error: `No se pudo guardar la firma del doctor: ${e.message}` });
      }
    } else {
      try {
        const snap = await copyFirmaToSnapshot(signerDoctor.firmaDigitalUrl, [
          'pacientes', id, 'firmas-notas', `${noteIdStr}_doctor`
        ]);
        if (snap.absPath) writtenSignaturePaths.push(snap.absPath);
        note.doctorFirmaUrl = snap.publicUrl;
        note.doctorFirmaImageHash = snap.contentHash;
      } catch (e) {
        await Promise.all(writtenSignaturePaths.map(p => fs.remove(p).catch(() => {})));
        return res.status(500).json({ success: false, error: 'No se pudo persistir el snapshot de la firma del doctor.' });
      }
    }

    note.doctorFirmaMethod = doctorSignature.method;
    note.firmadoPor = signerDoctor._id;
    note.firmadoEn = now;
    note.contentHash = contentHash;
    note.firmaDesactualizada = false;
    note.estadoRegistro = 'OFICIAL';

    // Persistir con un $set posicional atómico en vez de patient.save(). El
    // filtro exige que la nota siga en BORRADOR: si otra operación la firmó o
    // modificó en paralelo (el schema usa versionKey:false y save() no lo
    // detectaría), matchedCount=0 y abortamos sin pisar nada.
    try {
      const result = await Patient.updateOne(
        { _id: id, deletedAt: null, 'notas_evolucion._id': note._id, 'notas_evolucion.estadoRegistro': 'BORRADOR' },
        { $set: {
          'notas_evolucion.$.pacienteFirmaUrl': note.pacienteFirmaUrl,
          'notas_evolucion.$.pacienteFirmadoEn': note.pacienteFirmadoEn,
          'notas_evolucion.$.pacienteFirmaContentHash': note.pacienteFirmaContentHash,
          'notas_evolucion.$.pacienteFirmaImageHash': note.pacienteFirmaImageHash,
          'notas_evolucion.$.doctorFirmaUrl': note.doctorFirmaUrl,
          'notas_evolucion.$.doctorFirmaImageHash': note.doctorFirmaImageHash,
          'notas_evolucion.$.doctorFirmaMethod': note.doctorFirmaMethod,
          'notas_evolucion.$.firmadoPor': note.firmadoPor,
          'notas_evolucion.$.firmadoEn': note.firmadoEn,
          'notas_evolucion.$.contentHash': note.contentHash,
          'notas_evolucion.$.firmaDesactualizada': false,
          'notas_evolucion.$.estadoRegistro': 'OFICIAL',
        } }
      );
      if (!result || result.matchedCount === 0) {
        await Promise.all(writtenSignaturePaths.map(p => fs.remove(p).catch(() => {})));
        return res.status(409).json({ success: false, error: 'La nota ya fue firmada o modificada por otra operación. Recargue e intente de nuevo.' });
      }
    } catch (saveErr) {
      await Promise.all(writtenSignaturePaths.map(p => fs.remove(p).catch(() => {})));
      return res.status(500).json({ success: false, error: 'No se pudo guardar la nota firmada. Los cambios se revirtieron.' });
    }

    auditLogger.registrarManual(req, 'firma_electronica', {
      resourceType: 'patient',
      resourceId: note._id,
      patientId: patient._id,
      detalles: { contentHash, noteId: noteIdStr, method: doctorSignature.method }
    }).catch(() => {});

    return res.json({ success: true, message: 'Nota firmada exitosamente como OFICIAL.', data: note });
  } catch (error) {
    console.error('Error en signExistingEvolutionNote:', error);
    return res.status(500).json({ success: false, error: error.message || 'Error interno al firmar la nota.' });
  }
};

/**
 * 🔹 Finalizar historia clínica con consentimiento del paciente.
 *
 * POST /patients/:id/finalize-history
 * Body: { patientSignature: dataURL, textoConsentimiento: string }
 *
 * NOM-004-SSA3-2012 §4.5 + LFPDPPP Arts. 8 y 16: el paciente otorga su
 * consentimiento informado para la captura, tratamiento y conservación de
 * sus datos clínicos. La firma se guarda como imagen junto al hash del
 * texto consentido (para detectar cambios al texto legal después del firmado).
 */
exports.finalizeClinicalHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { patientSignature, textoConsentimiento, doctorSignature } = req.body;

    if (!patientSignature || typeof patientSignature !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'La firma del paciente es obligatoria.'
      });
    }
    if (!textoConsentimiento || typeof textoConsentimiento !== 'string' || !textoConsentimiento.trim()) {
      return res.status(400).json({
        success: false,
        error: 'El texto del consentimiento es obligatorio.'
      });
    }
    // NOM-013 + roles.MD: la HC requiere validación del doctor (cirujano dentista).
    if (!doctorSignature || !['pin', 'pad'].includes(doctorSignature.method)) {
      return res.status(400).json({
        success: false,
        error: 'La co-firma del doctor es obligatoria (PIN o pad).'
      });
    }

    const patient = await Patient.findOne({ _id: id, deletedAt: null });
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Paciente no encontrado' });
    }

    if (patient.consentimientoHC && patient.consentimientoHC.firmadoEn && !patient.consentimientoHC.revocadoEn) {
      return res.status(409).json({
        success: false,
        error: 'La historia clínica ya cuenta con un consentimiento firmado.',
        consentimientoHC: patient.consentimientoHC
      });
    }

    // ── Resolver doctor que co-firma ───────────────────────────────
    const asDoctorId = doctorSignature.asDoctorId || null;
    let signerDoctor;
    const userPerms = getEffectivePermissions(req.user);
    if (asDoctorId) {
      if (!mongoose.Types.ObjectId.isValid(asDoctorId)) {
        return res.status(400).json({ success: false, error: 'ID de doctor inválido.' });
      }
      signerDoctor = await Usuario.findById(asDoctorId);
      if (!signerDoctor || signerDoctor.active === false) {
        return res.status(404).json({ success: false, error: 'Doctor seleccionado no disponible.' });
      }
      if (!['doctor', 'doctor_admin'].includes(signerDoctor.rol)) {
        return res.status(403).json({ success: false, error: 'El usuario seleccionado no es doctor.' });
      }
    } else {
      // Auto-firma: el req.user debe ser doctor
      if (!hasPermission(userPerms, ['consultas.create'])) {
        return res.status(403).json({
          success: false,
          error: 'Solo un doctor puede co-firmar la HC. Pida al doctor que firme.'
        });
      }
      signerDoctor = await Usuario.findById(req.user.id);
      if (!signerDoctor) {
        return res.status(401).json({ success: false, error: 'Usuario no encontrado.' });
      }
    }

    // PIN: validar antes de tocar nada. PIN exigido SIEMPRE (incluso si
    // method='pad') para evitar suplantación — pad sólo controla el
    // SOURCE visual, no la AUTORIZACIÓN.
    if (doctorSignature.method === 'pin' && !signerDoctor.firmaDigitalUrl) {
      return res.status(400).json({
        success: false,
        error: 'El doctor no tiene firma digital subida. Use el pad o suba la firma en Perfil Profesional.'
      });
    }
    if (!signerDoctor.pinHash) {
      return res.status(400).json({
        success: false,
        error: 'El doctor no tiene PIN configurado. Configure su PIN en Mi Perfil antes de firmar.'
      });
    }
    {
      const pinResult = await signerDoctor.verificarPinDetallado(doctorSignature.pin || '');
      if (!pinResult.ok) {
        if (pinResult.locked) {
          const minutos = Math.ceil(pinResult.remainingMs / 60000);
          return res.status(429).json({
            success: false,
            error: `PIN del doctor bloqueado por demasiados intentos. Reintenta en ${minutos} minuto(s).`,
            locked: true
          });
        }
        return res.status(401).json({
          success: false,
          error: 'PIN del doctor incorrecto.',
          attemptsLeft: pinResult.attemptsLeft
        });
      }
    }

    const now = new Date();

    // 1) Firma del paciente
    let patientSig;
    try {
      patientSig = await saveSignatureDataUrl(patientSignature, [
        'pacientes', id, 'firmas-hc', `consent_${now.getTime()}.png`
      ]);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: `No se pudo guardar la firma del paciente: ${e.message}`
      });
    }

    // 2) Firma del doctor — siempre snapshot inmutable bajo carpeta del paciente
    let doctorFirmaUrl = null;
    if (doctorSignature.method === 'pad') {
      if (!doctorSignature.dataUrl) {
        return res.status(400).json({ success: false, error: 'Falta la imagen del pad del doctor.' });
      }
      try {
        const docSig = await saveSignatureDataUrl(doctorSignature.dataUrl, [
          'pacientes', id, 'firmas-hc', `consent_${now.getTime()}_doctor.png`
        ]);
        doctorFirmaUrl = docSig.publicUrl;
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: `No se pudo guardar la firma del doctor: ${e.message}`
        });
      }
    } else {
      // PIN — copiar la firmaDigitalUrl del doctor como snapshot.
      // Verificación previa garantiza que signerDoctor.firmaDigitalUrl existe.
      // Si la copia falla, abortamos en vez de dejar consentimiento sin firma.
      try {
        const snap = await copyFirmaToSnapshot(signerDoctor.firmaDigitalUrl, [
          'pacientes', id, 'firmas-hc', `consent_${now.getTime()}_doctor`
        ]);
        doctorFirmaUrl = snap.publicUrl;
      } catch (e) {
        console.error('[finalizeClinicalHistory] Fallo al copiar snapshot:', e.message);
        return res.status(500).json({
          success: false,
          error: 'No se pudo persistir el snapshot de la firma del doctor. El consentimiento NO fue guardado. Intente nuevamente o contacte a soporte.'
        });
      }
    }

    const contentHash = crypto.createHash('sha256')
      .update(textoConsentimiento.trim())
      .digest('hex');

    patient.consentimientoHC = {
      firmadoEn: now,
      firmaUrl: patientSig.publicUrl,
      contentHash,
      textoConsentimiento: textoConsentimiento.trim(),
      firmadoPor: req.user?.id || null,
      ipCliente: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim() || null,
      doctorFirmadoPor: signerDoctor._id,
      doctorFirmadoEn: now,
      doctorFirmaUrl,
      doctorFirmaMethod: doctorSignature.method,
      revocadoEn: null,
      revocadoMotivo: null,
    };

    await patient.save();

    return res.status(200).json({
      success: true,
      message: 'Historia clínica firmada exitosamente.',
      consentimientoHC: patient.consentimientoHC
    });
  } catch (error) {
    console.error('Error al finalizar historia clínica:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor al finalizar la historia clínica'
    });
  }
};

/**
 * 🔹 Revocar consentimiento de historia clínica.
 *
 * POST /patients/:id/revoke-hc-consent
 * Body: { motivo: string (≥10 chars), doctorSignature: { method: 'pin'|'pad', pin?, dataUrl? } }
 *
 * Reabre el expediente para correcciones. NOM-024 — la revocación queda
 * auditada con motivo justificado + autenticación del doctor (PIN o pad).
 */
exports.revokeHCConsent = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo, doctorSignature } = req.body || {};

    if (!motivo || typeof motivo !== 'string' || motivo.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Debe proporcionar un motivo claro de al menos 10 caracteres.'
      });
    }
    if (!doctorSignature || !doctorSignature.method) {
      return res.status(400).json({
        success: false,
        error: 'Firma del doctor requerida (PIN o pad).'
      });
    }
    if (doctorSignature.method !== 'pin' && doctorSignature.method !== 'pad') {
      return res.status(400).json({
        success: false,
        error: 'Método de firma inválido (use "pin" o "pad").'
      });
    }

    // Verificar PIN del doctor antes de tocar nada. La revocación de
    // consentimiento es un acto serio (LFPDPPP derechos ARCO) — se exige
    // PIN incluso si method='pad', el pad solo controla el visual.
    {
      const usuario = await Usuario.findById(req.user.id);
      if (!usuario) {
        return res.status(401).json({ success: false, error: 'Usuario no encontrado' });
      }
      if (!usuario.pinHash) {
        return res.status(400).json({
          success: false,
          error: 'No tiene PIN configurado. Configure su PIN en Mi Perfil antes de revocar.'
        });
      }
      const pinResult = await usuario.verificarPinDetallado(doctorSignature.pin || '');
      if (!pinResult.ok) {
        if (pinResult.locked) {
          const minutos = Math.ceil(pinResult.remainingMs / 60000);
          return res.status(429).json({
            success: false,
            error: `PIN bloqueado por demasiados intentos. Reintenta en ${minutos} minuto(s).`,
            locked: true
          });
        }
        return res.status(401).json({
          success: false,
          error: 'PIN incorrecto',
          attemptsLeft: pinResult.attemptsLeft
        });
      }
    }

    const patient = await Patient.findOne({ _id: id, deletedAt: null });
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Paciente no encontrado' });
    }

    if (!patient.consentimientoHC || !patient.consentimientoHC.firmadoEn) {
      return res.status(409).json({
        success: false,
        error: 'No hay un consentimiento firmado en este expediente.'
      });
    }
    if (patient.consentimientoHC.revocadoEn) {
      return res.status(409).json({
        success: false,
        error: 'El consentimiento ya estaba revocado.'
      });
    }

    // Guardar la firma del doctor que autoriza la revocación (si pad)
    let revocacionFirmaUrl = null;
    if (doctorSignature.method === 'pad') {
      if (!doctorSignature.dataUrl) {
        return res.status(400).json({
          success: false,
          error: 'Se requiere la imagen de la firma para el método pad.'
        });
      }
      try {
        const sig = await saveSignatureDataUrl(doctorSignature.dataUrl, [
          'pacientes', id, 'firmas-hc', `revocacion_${Date.now()}_doctor.png`
        ]);
        revocacionFirmaUrl = sig.publicUrl;
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: `No se pudo guardar la firma del doctor: ${e.message}`
        });
      }
    }

    patient.consentimientoHC.revocadoEn = new Date();
    patient.consentimientoHC.revocadoPor = req.user.id;
    patient.consentimientoHC.revocadoMotivo = motivo.trim();
    patient.consentimientoHC.revocacionFirmaUrl = revocacionFirmaUrl;

    await patient.save();

    return res.status(200).json({
      success: true,
      message: 'Consentimiento revocado. El expediente clínico se puede modificar nuevamente.',
      consentimientoHC: patient.consentimientoHC,
    });
  } catch (error) {
    console.error('Error al revocar consentimiento HC:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor al revocar el consentimiento'
    });
  }
};

/** 🔹 Agregar plan de tratamiento */
exports.addTreatmentPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { treatmentPlan } = req.body;

        // Validar datos de entrada
        const confirmText = treatmentPlan?.confirmar || treatmentPlan?.confirmacion;
        const isConfirmed = typeof confirmText === 'string' && confirmText.trim().toLowerCase() === 'confirmar';

        if (!treatmentPlan || !treatmentPlan.texto || !treatmentPlan.texto.trim()) {
            return res.status(400).json({ 
                success: false, 
                error: 'El texto del plan de tratamiento es requerido' 
            });
        }

        if (!isConfirmed) {
            return res.status(400).json({
                success: false,
                error: 'Debe escribir "confirmar" para guardar el plan de tratamiento'
            });
        }

        // Buscar el paciente (excluir soft-deleted)
        const patient = await Patient.findOne({ _id: id, deletedAt: null });
        if (!patient) {
            return res.status(404).json({ 
                success: false, 
                error: 'Paciente no encontrado' 
            });
        }

        // Determinar estadoRegistro según permisos (asistente → BORRADOR)
        const userPerms = getEffectivePermissions(req.user);
        let estadoRegistro = 'OFICIAL';
        if (!hasPermission(userPerms, ['consultas.create']) && hasPermission(userPerms, ['consultas.create.draft'])) {
            estadoRegistro = 'BORRADOR';
        }

        // Preparar el nuevo plan de tratamiento. Valida appointment vs paciente.
        const appointmentId = await resolvePatientAppointmentId(
            treatmentPlan.appointmentId || req.body.appointmentId,
            id
        );
        const newTreatmentPlan = {
            texto: treatmentPlan.texto.trim(),
            fecha: treatmentPlan.fecha ? new Date(treatmentPlan.fecha) : new Date(),
            fechaFormateada: treatmentPlan.fechaFormateada || new Date().toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            appointmentId,
            creadoPor: req.user?.id || null,
            estadoRegistro,
            capturaExtemporanea: req.body._capturaExtemporanea || undefined
        };

        // Agregar el plan de tratamiento al array
        patient.planes_tratamiento.unshift(newTreatmentPlan);

        // Guardar el paciente
        await patient.save();

        // Devolver el subdocumento guardado (con _id generado por Mongoose)
        const savedPlan = patient.planes_tratamiento[0];

        // Audit log: trazabilidad NOM-024 — antes el create de plan no quedaba
        // registrado (a diferencia de notas de evolución, que sí lo hacían).
        auditLogger.registrarManual(req, 'plan_tratamiento_creado', {
            resourceType: 'patient',
            resourceId: patient._id,
            patientId: patient._id,
            detalles: {
                planId: savedPlan._id,
                estadoRegistro: savedPlan.estadoRegistro,
                appointmentId: savedPlan.appointmentId || null
            }
        }).catch(() => {});

        res.status(201).json({
            success: true,
            message: 'Plan de tratamiento agregado correctamente',
            data: savedPlan
        });

    } catch (error) {
        console.error('Error al agregar plan de tratamiento:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor al agregar el plan de tratamiento'
        });
    }
};



const { LIMITS, SANITIZERS } = require('../config/patientValidation');

// Utilidad: sanitizar y limitar tamaño de payload para formularios grandes
function sanitizeAndLimitPayload(obj) {
  const MAX_STR_LEN = LIMITS?.MAX_LONG_TEXT_LENGTH || 2000;
  const DEFAULT_MAX_ARRAY_LEN = 100;
  const MAX_ARRAY_BY_KEY = {
    contactos_emergencia: LIMITS?.MAX_EMERGENCY_CONTACTS || 5,
    medicacion: 100,
    alergias: 100,
  };

  const recurse = (value, key) => {
    if (typeof value === 'string') {
      const sanitized = SANITIZERS?.sanitizeText ? SANITIZERS.sanitizeText(value) : value.trim();
      return sanitized.length > MAX_STR_LEN ? sanitized.slice(0, MAX_STR_LEN) : sanitized;
    }
    if (Array.isArray(value)) {
      const cap = MAX_ARRAY_BY_KEY[key] ?? DEFAULT_MAX_ARRAY_LEN;
      return value.slice(0, cap).map((item) => recurse(item));
    }
    if (value && typeof value === 'object') {
      const result = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = recurse(v, k);
      }
      return result;
    }
    return value;
  };

  return recurse(obj);
}

function estimatePayloadSize(obj) {
  try {
    return Buffer.byteLength(JSON.stringify(obj || {}), 'utf8');
  } catch {
    return 0;
  }
}

// Parsea fecha de nacimiento aceptando Date, ISO (YYYY-MM-DD) y DD/MM/YYYY.
// Rechaza días/meses fuera de rango (no acepta overflow silencioso como 32/13/2020),
// fechas futuras y edades > 120 años. Devuelve { date } en éxito o { error } en
// errores específicos, null para formatos inválidos.
function parseAndValidateBirthDate(input) {
  let date = null;
  if (input instanceof Date) {
    date = new Date(input.getTime());
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const ymd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (dmy) {
      const d = parseInt(dmy[1], 10);
      const m = parseInt(dmy[2], 10);
      const y = parseInt(dmy[3], 10);
      if (m < 1 || m > 12 || d < 1 || d > 31) return null;
      const candidate = new Date(y, m - 1, d);
      if (candidate.getFullYear() === y && candidate.getMonth() === m - 1 && candidate.getDate() === d) {
        date = candidate;
      } else {
        return null;
      }
    } else if (ymd) {
      const y = parseInt(ymd[1], 10);
      const m = parseInt(ymd[2], 10);
      const d = parseInt(ymd[3], 10);
      if (m < 1 || m > 12 || d < 1 || d > 31) return null;
      // Construimos la fecha en zona local para evitar el corrimiento de un día
      // que aparece cuando new Date("YYYY-MM-DD") la interpreta como UTC.
      const candidate = new Date(y, m - 1, d);
      if (candidate.getFullYear() === y && candidate.getMonth() === m - 1 && candidate.getDate() === d) {
        date = candidate;
      } else {
        return null;
      }
    } else {
      const candidate = new Date(trimmed);
      if (!isNaN(candidate.getTime())) date = candidate;
    }
  } else if (input != null) {
    const candidate = new Date(input);
    if (!isNaN(candidate.getTime())) date = candidate;
  }

  if (!date || isNaN(date.getTime())) return null;

  const now = new Date();
  if (date.getTime() > now.getTime()) return { error: 'future' };
  const ageYears = (now.getTime() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears > 120) return { error: 'too_old' };
  return { date };
}

// Reintenta el save si colisiona el paciente_id (sólo 9000 IDs posibles: hay
// race entre exists() y save() en cargas concurrentes).
async function savePatientWithRetry(newPatient, maxAttempts = 5) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await newPatient.save();
      return;
    } catch (err) {
      lastErr = err;
      const isE11000 = err?.code === 11000;
      const e11000Key = err?.keyPattern || err?.keyValue || {};
      const isPacienteIdDupe = isE11000 && Object.prototype.hasOwnProperty.call(e11000Key, 'paciente_id');
      const isUVPacienteId = err?.name === 'ValidationError' && err?.errors?.paciente_id?.kind === 'unique';
      if ((isPacienteIdDupe || isUVPacienteId) && attempt < maxAttempts) {
        newPatient.paciente_id = await newPatient.constructor.generateUniquePatientId();
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}



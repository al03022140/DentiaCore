// Import required models and dependencies
const Patient = require('../models/patient.js');
const { devError } = require('../utils/httpError');
const Appointment = require('../models/appointment.js');
const Periodontogram = require('../models/periodontogram.js');
const Usuario = require('../models/users.js');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { resolveUploadsPath, ensureUploadsPath } = require('../utils/uploads');
const { isJpegOrPng } = require('../utils/imageSignature');
const { hasPermission, getEffectivePermissions, isAdminRole } = require('../utils/permissions');
const { sanitizePatientForBasicRead, sanitizeAppointmentForBasicRead, BASIC_PATIENT_WRITE_FIELDS } = require('../middlewares/authorize');
const { saveSignatureDataUrl, copyFirmaToSnapshot, verifySignatureImageHash } = require('../utils/saveSignatureImage');
const { isHCConsentActive, findLockedFieldsInPayload } = require('../utils/hcConsent');
const auditLogger = require('../middlewares/auditLogger');
const { resolvePatientAppointmentId } = require('../utils/appointmentValidation');
const { computeEvolutionNoteHash, evaluateNoteIntegrity } = require('../utils/signing');

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

        // Cascada (dev-only): al borrar TODOS los pacientes, limpiar también las
        // colecciones relacionadas para no dejar citas/odontogramas/perio/cargos/
        // adjuntos huérfanos. (deletePatient hace soft-delete por-paciente; aquí
        // es un wipe total de desarrollo.)
        const Odontograma = require('../models/odontograma.js');
        const PatientCharge = require('../models/patientCharge.js');
        const PatientAttachment = require('../models/patientAttachment.js');
        await Promise.all([
            Appointment.deleteMany({}),
            Periodontogram.deleteMany({}),
            Odontograma.deleteMany({}),
            PatientCharge.deleteMany({}),
            PatientAttachment.deleteMany({}),
        ]);
        
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
        res.status(500).json({ message: 'Error al borrar pacientes', error: devError(error) });
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

        // Paginación con tope de seguridad. El cliente actual pide la lista
        // completa y pagina en memoria, así que NO imponemos un default chico
        // (rompería la lista). Pero sí un backstop duro: antes `limit=0` traía
        // la colección ENTERA sin tope (riesgo de memoria/latencia y de
        // descarga masiva de PII). MAX_LIMIT acota incluso el caso "sin limit".
        // (Para clínicas muy grandes, lo ideal es migrar el front a paginación
        // server-side y usar ?page/?limit explícitos.)
        const MAX_LIMIT = 5000;

        // Validación estricta de params EXPLÍCITOS: si el cliente envía
        // limit/page presentes pero inválidos (negativo, 0, no numérico,
        // sufijos), devolver 400 en vez de caer en silencio a MAX_LIMIT
        // (descarga masiva de PII) o a page 1.
        const parsePositiveIntParam = (raw, name) => {
            if (raw === undefined) return { value: null };
            const s = String(raw).trim();
            if (!/^\d+$/.test(s)) return { error: `Parámetro '${name}' inválido (debe ser un entero positivo)` };
            const n = parseInt(s, 10);
            if (!Number.isFinite(n) || n < 1) return { error: `Parámetro '${name}' inválido (debe ser un entero positivo)` };
            return { value: n };
        };
        const limitParam = parsePositiveIntParam(req.query.limit, 'limit');
        if (limitParam.error) return res.status(400).json({ message: limitParam.error });
        const pageParam = parsePositiveIntParam(req.query.page, 'page');
        if (pageParam.error) return res.status(400).json({ message: pageParam.error });

        const limit = limitParam.value ? Math.min(limitParam.value, MAX_LIMIT) : MAX_LIMIT;

        // Conteo PRIMERO para acotar `page` al máximo real y evitar
        // deep-pagination: un skip = (page-1)*limit gigantesco hace que Mongo
        // recorra y descarte O(n) documentos por petición.
        const total = await Patient.countDocuments({ deletedAt: null });
        const maxPage = Math.max(1, Math.ceil(total / limit));
        const page = Math.min(pageParam.value || 1, maxPage);
        const skip = (page - 1) * limit;

        // Construir la consulta base (excluir pacientes dados de baja).
        // .select() limita los campos al subset que necesita la lista.
        // .lean() devuelve POJOs en vez de docs Mongoose hidratados (más rápido).
        const patients = await Patient.find({ deletedAt: null })
            .select(PATIENT_LIST_FIELDS)
            .skip(skip)
            .limit(limit)
            .lean()
            .exec();

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
        res.status(500).json({ message: 'Error al obtener los pacientes', error: devError(error) });
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
        res.status(500).json({ message: 'Error al buscar pacientes', error: devError(error) });
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
  
      // Buscar usando el _id de MongoDB (excluyendo dados de baja).
      // firmadoPor de las notas se popula con el nombre/cédula del doctor: la
      // UI (tooltip de firma e impresión del expediente) mostraba el nombre
      // del USUARIO LOGUEADO como firmante porque nunca recibía el nombre
      // real — en un documento clínico impreso eso atribuía la firma a la
      // persona equivocada.
      const patient = await Patient.findOne({ _id: id, deletedAt: null })
        .populate({ path: 'notas_evolucion.firmadoPor', select: 'nombre cedulaProfesional' })
        .exec();

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
      let citasPasadas = citas.filter(cita => {
        const fechaCita = new Date(cita.fecha_hora);
        return fechaCita < hoy;
      }).sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora)); // Ordenar descendente

      let citasFuturas = citas.filter(cita => {
        const fechaCita = new Date(cita.fecha_hora);
        return fechaCita >= hoy;
      }).sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora)); // Ordenar ascendente

      // Si el usuario sólo tiene `patients.read.basic` (recepción), las citas
      // se devuelven con campos de programación únicamente: NO debe ver
      // motivo/observaciones/items ni la bitácora clínica de la cita. Antes el
      // paciente se sanitizaba pero las citas se entregaban íntegras → fuga de
      // PII clínica (NOM-004 Art. 5.7 / LFPDPPP). ultimaCita/proximaCita se
      // derivan de los arreglos ya saneados.
      if (req.filterClinicalData) {
        citasPasadas = citasPasadas.map(sanitizeAppointmentForBasicRead);
        citasFuturas = citasFuturas.map(sanitizeAppointmentForBasicRead);
      }

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
        return res.status(400).json({ message: "Formato de ID inválido", error: devError(error) });
      }
      
      res.status(500).json({ message: "Error al obtener el paciente", error: devError(error) });
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

// Valida que las fechas clínicas femeninas (último parto / última menstruación)
// NO sean futuras. Sólo valida el valor entrante (no toca datos legacy ya
// guardados). Devuelve un mensaje de error o null. Defensa en profundidad
// NOM-024: el `max` del input y validateFormat del cliente son evadibles.
const validateFemaleDates = (info) => {
    if (!info || typeof info !== 'object') return null;
    const checks = [
        ['fecha_ultimo_parto', 'La fecha del último parto no puede ser futura'],
        ['fecha_ultima_menstruacion', 'La fecha de última menstruación no puede ser futura'],
    ];
    const now = Date.now();
    for (const [field, msg] of checks) {
        const val = info[field];
        if (val == null || val === '') continue;
        const d = new Date(val);
        if (!Number.isNaN(d.getTime()) && d.getTime() > now) return msg;
    }
    return null;
};

// Reglas de rango de la ficha (defensa servidor). Se validan a nivel de
// CONTROLLER sobre el payload ENTRANTE —no en el schema— a propósito: un
// validador de schema re-validaría el documento COMPLETO en cualquier
// patient.save() (p. ej. finalizeClinicalHistory) y un dato legacy fuera de
// rango bloquearía saves que no lo tocan. Devuelve mensaje de error o null.
const validatePatientFieldRules = (data) => {
    const MAX_NAME = LIMITS?.MAX_NAME_LENGTH || 50;
    for (const field of ['primer_nombre', 'otros_nombres', 'apellido_paterno', 'apellido_materno']) {
        const val = data[field];
        if (typeof val === 'string' && val.length > MAX_NAME) {
            return `El campo ${field.replace(/_/g, ' ')} no puede exceder ${MAX_NAME} caracteres`;
        }
    }
    const semanas = data.encuesta_medica?.embarazo?.semanas_gestacion;
    if (semanas !== undefined && semanas !== null && semanas !== '') {
        const n = Number(semanas);
        if (!Number.isFinite(n) || n < 0 || n > 45) {
            return 'Las semanas de gestación deben estar entre 0 y 45';
        }
    }
    // "Último examen médico" y "última visita al odontólogo" no pueden ser
    // futuros — mismo criterio de coherencia NOM-024 que validateFemaleDates.
    const now = Date.now();
    const dateChecks = [
        [data.encuesta_medica?.informacion_general?.ultimo_examen_medico?.fecha,
            'La fecha del último examen médico no puede ser futura'],
        [data.habitos_higiene?.fecha_ultima_visita_odontologo,
            'La fecha de la última visita al odontólogo no puede ser futura'],
    ];
    for (const [val, msg] of dateChecks) {
        if (val == null || val === '') continue;
        const d = new Date(val);
        if (!Number.isNaN(d.getTime()) && d.getTime() > now) return msg;
    }
    return null;
};

/** 🔹 Crear un paciente con subida de foto */
exports.createPatient = async (req, res) => {
    // Si multer subió la foto, ya creó la carpeta en uploads/pacientes/<id>,
    // donde <id> es SIEMPRE el ObjectId generado por el servidor en la ruta
    // (req.uploadTargetId). NUNCA usamos req.body._id aquí: era controlado por
    // el cliente y permitía apuntar el cleanup a la carpeta de otro paciente.
    // Si en cualquier punto fallamos antes de guardar, limpiamos esa carpeta
    // para no dejar fotos huérfanas en disco.
    let folderIdToCleanup = (req.file && req.uploadTargetId && mongoose.Types.ObjectId.isValid(req.uploadTargetId))
        ? req.uploadTargetId
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

        // Defensa-en-profundidad: el fileFilter de multer solo mira el mimetype
        // declarado por el cliente (spoofeable). Verificamos la firma real del
        // archivo; si no es JPEG/PNG, rechazamos (el finally limpia la carpeta).
        if (req.file && !isJpegOrPng(req.file.path)) {
            return res.status(415).json({
                message: 'El archivo de foto no es una imagen JPEG o PNG válida',
                code: 'INVALID_IMAGE'
            });
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
        const hasFullCreate = hasPermission(getEffectivePermissions(req.user), ['patients.create']);
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

        // Fechas clínicas femeninas no pueden ser futuras (defensa servidor).
        const femErr = validateFemaleDates(safePatientData.informacion_femenina);
        if (femErr) return res.status(400).json({ message: femErr });

        // Rangos de ficha: nombres ≤50, semanas de gestación 0-45, fechas
        // médicas no futuras.
        const ruleErr = validatePatientFieldRules(safePatientData);
        if (ruleErr) return res.status(400).json({ message: ruleErr });

        // documento debe ser un objeto {tipo, numero}. Si llega como string/
        // array/number, las guardas `.numero` lo saltan en silencio (no corre el
        // dup-check) y Mongoose lo castea a {} → ValidationError genérico de
        // required. Rechazar con un 400 de formato claro.
        if (safePatientData.documento !== undefined &&
            (typeof safePatientData.documento !== 'object' || safePatientData.documento === null || Array.isArray(safePatientData.documento))) {
            return res.status(400).json({ message: 'El campo documento debe ser un objeto con tipo y numero', field: 'documento' });
        }

        // Normalizar documento.numero (trim + uppercase) ANTES de insertar para
        // que el índice único de Mongo detecte duplicados de facto sin importar
        // mayúsculas/espacios (siempre se almacena normalizado).
        if (safePatientData.documento && safePatientData.documento.numero != null) {
            safePatientData.documento.numero = String(safePatientData.documento.numero).trim().toUpperCase();
            if (!safePatientData.documento.numero) {
                return res.status(400).json({ message: "Número de documento es obligatorio" });
            }
        }

        // Chequeo de duplicado a nivel de aplicación (legacy-safe). En una BD
        // legacy el índice único de documento.numero puede no existir
        // (autoIndex off en prod, o saltado por duplicados preexistentes), así
        // que no podemos depender solo del E11000. Esta consulta —indexada
        // cuando el índice existe— atrapa el caso común (alta secuencial en
        // recepción) y da un 409 claro.
        // OJO: este findOne + save NO es atómico. La carrera entre dos altas
        // concurrentes con el mismo documento SÓLO queda cubierta si el índice
        // único existe en la BD (entonces el segundo save da E11000 → 409). Si
        // el índice fue saltado en una instalación legacy, dos requests
        // simultáneas pueden crear ambos expedientes; garantizar la unicidad en
        // ese escenario requiere construir el índice (ver ensureIndexes) o un
        // upsert atómico, no este chequeo. savePatientWithRetry sólo reintenta
        // colisiones de paciente_id, no de documento.numero.
        // Sin filtro deletedAt: el índice único reserva el número aunque el
        // paciente esté dado de baja, así que lo reflejamos igual.
        if (safePatientData.documento && safePatientData.documento.numero) {
            const dupe = await Patient.findOne({
                'documento.numero': safePatientData.documento.numero
            }).select('_id deletedAt').lean();
            if (dupe) {
                return res.status(409).json({
                    message: dupe.deletedAt
                        ? `El documento ${safePatientData.documento.numero} pertenece a un paciente dado de baja. Restáuralo en lugar de crear uno nuevo.`
                        : `Ya existe un paciente con el documento ${safePatientData.documento.numero}`,
                    code: 'DUPLICATE_DOCUMENT',
                    field: 'documento.numero',
                    existingPatientId: dupe._id
                });
            }
        }

        // _id del paciente: SIEMPRE lo decide el servidor. Si multer ya creó
        // una carpeta usando el _id que generó el propio servidor en la ruta
        // (req.uploadTargetId), lo reutilizamos para que la foto subida quede en
        // la carpeta correcta. Nunca se usa req.body._id (mass-assignment).
        let patientObjectId;
        if (req.uploadTargetId && mongoose.Types.ObjectId.isValid(req.uploadTargetId)) {
            patientObjectId = new mongoose.Types.ObjectId(req.uploadTargetId);
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
            // ensureDir (fs-extra) crea toda la cadena de padres, así que basta
            // con asegurar las dos carpetas hoja; las lanzamos en paralelo en
            // vez de 4 awaits secuenciales (cada uno era un round-trip de I/O a
            // disco en el camino crítico del alta). Ambas crean además
            // `pacientes/` y `pacientes/<id>` como padres.
            await Promise.all([
                ensureUploadsPath('pacientes', patientIdStr, 'odontograma-inicial'),
                ensureUploadsPath('pacientes', patientIdStr, 'profile-pic'),
            ]);
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

        // NO se crea el periodontograma aquí. Antes se hacía createInitial en
        // cada alta, generando un BORRADOR vacío que contaminaba el Centro de
        // Firmas (aparecía como pendiente de firma sin que nadie lo hubiera
        // tocado). El periodontograma se crea solo en el PRIMER guardado real
        // (savePeriodontogramData es idempotente vía ensurePeriodontogramExists);
        // las lecturas devuelven uno vacío en memoria sin persistir.

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
                error: devError(error)
            });
        }
        return res.status(500).json({ message: "Error al crear el paciente", error: devError(error) });
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

// NOTA: se eliminó createPatients (POST /patients/batch). No tenía consumidor
// (ni cliente, ni server, ni tests) y le faltaban las defensas del alta
// individual (sanitización, fechas femeninas, dedup de paciente_id dentro del
// lote). Si algún día llega un importador, reescribirlo sobre createPatient.

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

        // Defensa-en-profundidad: verificar la firma real del archivo subido
        // (no confiar en el mimetype declarado). El finally limpia el huérfano.
        if (uploadedFile && !isJpegOrPng(uploadedFile.path)) {
            return res.status(415).json({
                message: 'El archivo de foto no es una imagen JPEG o PNG válida',
                code: 'INVALID_IMAGE'
            });
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
        // Se eleva al scope de la función para reutilizarlo como guarda ATÓMICA
        // en el findOneAndUpdate de más abajo (cierre del TOCTOU).
        let expectedUpdatedAtDate = null;
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
            // Valor autoritativo del servidor para la guarda atómica de abajo:
            // si entre este control y el update otra sesión escribe, updatedAt
            // cambiará y el filtro del findOneAndUpdate no matcheará.
            expectedUpdatedAtDate = new Date(current.updatedAt);
        }

        // Whitelist: el cliente sólo puede tocar campos clínicos/demográficos.
        // notas_evolucion y planes_tratamiento son inmutables por NOM-004 y se
        // editan únicamente vía sus endpoints dedicados (que respetan las hooks
        // pre-save). findOneAndUpdate bypassa esas hooks, así que el whitelist
        // es la barrera principal.
        // Si el usuario sólo tiene `patients.update.basic` (recepcionista),
        // restringimos a la ficha básica — sin tocar el expediente clínico.
        const hasFullUpdate = hasPermission(getEffectivePermissions(req.user), ['patients.update']);
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

        // Fechas clínicas femeninas no pueden ser futuras (defensa servidor).
        if (safeUpdate.informacion_femenina !== undefined) {
            const femErr = validateFemaleDates(safeUpdate.informacion_femenina);
            if (femErr) return res.status(400).json({ message: femErr });
        }

        // Rangos de ficha sobre el payload entrante (igual que en create).
        const ruleErr = validatePatientFieldRules(safeUpdate);
        if (ruleErr) return res.status(400).json({ message: ruleErr });

        // documento debe ser un objeto {tipo, numero}. Un string/array aquí hace
        // que castObject lo descarte a {} y el update "tenga éxito" (200) sin
        // cambiar nada (no-op silencioso). Rechazar con un 400 de formato.
        if (safeUpdate.documento !== undefined &&
            (typeof safeUpdate.documento !== 'object' || safeUpdate.documento === null || Array.isArray(safeUpdate.documento))) {
            return res.status(400).json({ message: 'El campo documento debe ser un objeto con tipo y numero', field: 'documento' });
        }

        // Normalizar documento.numero igual que en create
        if (safeUpdate.documento && safeUpdate.documento.numero != null) {
            const norm = String(safeUpdate.documento.numero).trim().toUpperCase();
            if (!norm) {
                return res.status(400).json({ message: 'Número de documento es obligatorio' });
            }
            safeUpdate.documento.numero = norm;
        }

        // Dup-check legacy-safe al cambiar el documento: excluye al propio
        // paciente. Igual que en create, no depende del índice único (que en
        // legacy puede faltar); la carrera concurrente la cubre el índice/E11000.
        if (safeUpdate.documento && safeUpdate.documento.numero) {
            const dupe = await Patient.findOne({
                'documento.numero': safeUpdate.documento.numero,
                _id: { $ne: req.params.id }
            }).select('_id deletedAt').lean();
            if (dupe) {
                return res.status(409).json({
                    message: dupe.deletedAt
                        ? `El documento ${safeUpdate.documento.numero} pertenece a un paciente dado de baja.`
                        : `Ya existe otro paciente con el documento ${safeUpdate.documento.numero}`,
                    code: 'DUPLICATE_DOCUMENT',
                    field: 'documento.numero',
                    existingPatientId: dupe._id
                });
            }
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

        const updateFilter = { _id: req.params.id, deletedAt: null };
        if (expectedUpdatedAtDate) {
            // Cierre ATÓMICO del TOCTOU (ver control de concurrencia arriba):
            // exigir que updatedAt siga siendo el leído en el control. Si otra
            // sesión guardó en la ventana entre ambos, el filtro no matchea y
            // no se pisan sus cambios.
            updateFilter.updatedAt = expectedUpdatedAtDate;
        }

        const updatedPatient = await Patient.findOneAndUpdate(
            updateFilter,
            { $set: setPayload },
            { new: true, runValidators: true, context: 'query' }
        );

        if (!updatedPatient) {
            // Si pedíamos guarda de concurrencia y no hubo match, distinguir
            // entre "no existe / borrado" (404) y "cambió en la ventana TOCTOU"
            // (409 PATIENT_STALE), para no reportar 404 ante una colisión.
            if (expectedUpdatedAtDate) {
                const stillExists = await Patient.findOne(
                    { _id: req.params.id, deletedAt: null }
                ).select('updatedAt').lean();
                if (stillExists) {
                    return res.status(409).json({
                        message: 'El paciente fue modificado por otra sesión. Recarga para ver los cambios antes de guardar.',
                        code: 'PATIENT_STALE',
                        serverUpdatedAt: stillExists.updatedAt
                    });
                }
            }
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
                error: devError(error)
            });
        }
        return res.status(500).json({ message: "Error interno al actualizar el paciente", error: devError(error) });
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

        // Soft-delete del paciente + cascada a registros relacionados de forma
        // ATÓMICA. Antes el paciente se marcaba deletedAt y luego un Promise.all
        // cascadeaba a citas/odontograma/perio/cargos/adjuntos; si una
        // updateMany fallaba a mitad, el paciente quedaba de baja con
        // relacionados activos huérfanos (LFPDPPP derecho de cancelación
        // incompleto) y un reintento daba 409 sin completar la cascada. Se
        // envuelve en transacción; fallback standalone → secuencial (como antes).
        // Cada modelo usa su propio mecanismo:
        //   - Appointment, Odontograma, Periodontogram, PatientAttachment: `deletedAt`
        //   - PatientCharge: `cancelado` con motivo
        // CashMovement NO se cascadea: no tiene deletedAt y los movimientos
        // cerrados forman parte del registro contable diario.
        const deletedAt = new Date();
        const deletedBy = req.user?.id || null;
        const cascadeReason = 'Paciente dado de baja';

        const Odontograma = require('../models/odontograma.js');
        const PatientCharge = require('../models/patientCharge.js');
        const PatientAttachment = require('../models/patientAttachment.js');
        // DB-INT-01: Examen (único con camino de escritura vivo hoy),
        // Tratamiento y Receta también referencian al paciente por `paciente_id`
        // y traen los campos de soft-delete; sin esto quedaban registros activos
        // de un paciente dado de baja (rompe la cancelación LFPDPPP).
        const Exam = require('../models/exam.js');
        const Treatment = require('../models/treatment.js');
        const Prescription = require('../models/prescription.js');

        const softDeleteSet = { $set: { deletedAt, deletedBy, deleteReason: cascadeReason } };
        const chargeCancelSet = { $set: { cancelado: true, canceladoEn: deletedAt, canceladoPor: deletedBy, canceladoMotivo: cascadeReason } };

        const runCascade = async (session) => {
            const opts = session ? { session } : {};
            patient.deletedAt = deletedAt;
            patient.deletedBy = deletedBy;
            patient.deleteReason = deleteReason.trim();
            await patient.save({ validateModifiedOnly: true, ...opts });
            await Promise.all([
                Appointment.updateMany({ paciente_id: patient._id, deletedAt: null }, softDeleteSet, opts),
                Odontograma.updateMany({ patientId: patient._id, deletedAt: null }, softDeleteSet, opts),
                Periodontogram.updateMany({ patient: patient._id, deletedAt: null }, softDeleteSet, opts),
                PatientCharge.updateMany({ patientId: patient._id, cancelado: { $ne: true } }, chargeCancelSet, opts),
                PatientAttachment.updateMany({ patientId: patient._id, deletedAt: null }, softDeleteSet, opts),
                Exam.updateMany({ paciente_id: patient._id, deletedAt: null }, softDeleteSet, opts),
                Treatment.updateMany({ paciente_id: patient._id, deletedAt: null }, softDeleteSet, opts),
                Prescription.updateMany({ paciente_id: patient._id, deletedAt: null }, softDeleteSet, opts),
            ]);
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
                await session.withTransaction(async () => { await runCascade(session); });
            } catch (txErr) {
                if (isStandaloneTxError(txErr)) {
                    console.warn('⚠️ MongoDB standalone — baja de paciente sin transacción');
                    await runCascade(null);
                } else {
                    throw txErr;
                }
            }
        } finally {
            session.endSession();
        }

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


// Cotas de los campos de contenido de una nota — espejo del maxlength del
// schema (models/patient.js → notas_evolucion), leídas de ahí para no duplicar
// la fuente de verdad.
const NOTE_CONTENT_FIELDS = ['procedimiento', 'observaciones', 'correcciones'];
const NOTE_FIELD_MAX = Object.fromEntries(NOTE_CONTENT_FIELDS.map((f) => [
  f, Patient.schema.path('notas_evolucion').schema.path(f).options.maxlength,
]));

/**
 * Valida tipos y cotas del payload de una nota de evolución ANTES de tocar el
 * contador, el disco o la BD. Antes estos casos reventaban tarde: un campo
 * numérico/objeto lanzaba TypeError (500), una fecha no parseable o un campo
 * sobre el maxlength fallaban recién en el $push con runValidators (500) — ya
 * con el contador monotónico consumido y, en el camino OFICIAL, con los PNGs
 * de firma escritos y borrados en rollback.
 *
 * @param {object} evolutionNote
 * @returns {string|null} mensaje de error para un 400, o null si es válido
 */
function validateEvolutionNotePayload(evolutionNote) {
  for (const f of NOTE_CONTENT_FIELDS) {
    const v = evolutionNote[f];
    if (v !== undefined && v !== null && typeof v !== 'string') {
      return `El campo ${f} debe ser texto.`;
    }
    if (typeof v === 'string' && v.trim().length > NOTE_FIELD_MAX[f]) {
      return `El campo ${f} excede el máximo de ${NOTE_FIELD_MAX[f]} caracteres.`;
    }
  }
  if (evolutionNote.fecha !== undefined && evolutionNote.fecha !== null
      && Number.isNaN(new Date(evolutionNote.fecha).getTime())) {
    return 'La fecha de la nota no es válida.';
  }
  return null;
}

/**
 * Resuelve quién firma como doctor una nota de evolución (self o cross-user
 * vía `doctorSignature.asDoctorId`) y valida su autenticación según el
 * método ('pin' exige firma digital subida + PIN vigente; 'pad' no exige
 * PIN, el trazo en vivo es la autorización).
 *
 * Antes esta lógica estaba duplicada entre addEvolutionNote y
 * signExistingEvolutionNote (mismo comportamiento, sólo cambiaba el formato).
 * No escribe en `res` directamente: devuelve `{ ok:false, status, body }` con
 * el mismo status/body que cada caller ya enviaba, así ninguna respuesta cambia.
 *
 * @param {object} params
 * @param {object} params.doctorSignature - { method, asDoctorId?, pin?, dataUrl? }
 * @param {object} params.userPerms - permisos efectivos de req.user
 * @param {object} params.req - request (para req.user.id)
 * @param {string} [params.pinLockedMessage] - texto exacto del error 429 por PIN
 *   bloqueado. Los dos call sites originales usaban redacciones ligeramente
 *   distintas; se preserva vía este parámetro en vez de unificarlas.
 * @returns {Promise<{ok:true, signerDoctor:object}|{ok:false, status:number, body:object}>}
 */
async function resolveSigningDoctor({
  doctorSignature,
  userPerms,
  req,
  pinLockedMessage = 'PIN del doctor bloqueado por demasiados intentos. Reintenta en {minutos} minuto(s).',
}) {
  let signerDoctor;

  // Resolver QUIÉN firma:
  //  - asDoctorId presente → otro usuario (asistente pidió firma al doctor)
  //  - sin asDoctorId → req.user (auto-firma — requiere consultas.create)
  const asDoctorId = doctorSignature.asDoctorId || null;
  if (asDoctorId) {
    if (!mongoose.Types.ObjectId.isValid(asDoctorId)) {
      return { ok: false, status: 400, body: { success: false, error: 'ID de doctor inválido.' } };
    }
    signerDoctor = await Usuario.findById(asDoctorId);
    if (!signerDoctor) {
      return { ok: false, status: 404, body: { success: false, error: 'Doctor seleccionado no encontrado.' } };
    }
    if (signerDoctor.active === false) {
      return { ok: false, status: 403, body: { success: false, error: 'La cuenta del doctor está desactivada.' } };
    }
    if (!['doctor', 'doctor_admin'].includes(signerDoctor.rol)) {
      return { ok: false, status: 403, body: { success: false, error: 'El usuario seleccionado no es doctor.' } };
    }
  } else {
    // Auto-firma — req.user debe poder firmar OFICIAL (NOM-013)
    if (!hasPermission(userPerms, ['consultas.create'])) {
      return {
        ok: false,
        status: 403,
        body: { success: false, error: 'No tiene permiso para firmar notas como OFICIAL. Pida al doctor que firme.' },
      };
    }
    signerDoctor = await Usuario.findById(req.user.id);
    if (!signerDoctor) {
      return { ok: false, status: 401, body: { success: false, error: 'Usuario no encontrado.' } };
    }
    // El firmante OFICIAL debe ser doctor real (NOM-004 Art. 5.10), igual
    // que en la rama de firma cruzada. Antes la auto-firma solo validaba
    // el permiso `consultas.create`, dejando que una cuenta no-doctor con
    // ese permiso firmara como oficial.
    if (!['doctor', 'doctor_admin'].includes(signerDoctor.rol)) {
      return { ok: false, status: 403, body: { success: false, error: 'Solo un doctor puede firmar la nota como OFICIAL.' } };
    }
  }

  // Autenticación del doctor firmante según el método:
  //  - 'pin': reusa la firma digital subida; exige firma subida + PIN.
  //  - 'pad' con el MISMO usuario de la sesión: el trazo basta (la sesión ya
  //    autentica al doctor).
  //  - 'pad' con OTRO doctor (asDoctorId ajeno — asistente pidiendo firma, o
  //    doctor firmando en sesión ajena): se exige ADEMÁS el PIN del doctor.
  //    Antes bastaba un PNG arbitrario como "firma del doctor" (suplantación
  //    por cualquier cuenta con permisos de captura). Decisión del
  //    propietario 2026-07-12 — cierra el modo laxo documentado aquí antes.
  const isCrossUser = Boolean(asDoctorId) && String(asDoctorId) !== String(req.user.id);
  if (doctorSignature.method === 'pin' && !signerDoctor.firmaDigitalUrl) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: 'El doctor no tiene firma digital subida. Use el pad o suba la firma en Perfil Profesional.' },
    };
  }
  if (doctorSignature.method === 'pin' || isCrossUser) {
    if (!signerDoctor.pinHash) {
      return {
        ok: false,
        status: 400,
        body: { success: false, error: 'El doctor no tiene PIN configurado. Configure su PIN en Mi Perfil antes de firmar.' },
      };
    }
    const pinResult = await signerDoctor.verificarPinDetallado(doctorSignature.pin || '');
    if (!pinResult.ok) {
      if (pinResult.locked) {
        const minutos = Math.ceil(pinResult.remainingMs / 60000);
        return {
          ok: false,
          status: 429,
          body: { success: false, error: pinLockedMessage.replace('{minutos}', minutos), locked: true },
        };
      }
      return {
        ok: false,
        status: 401,
        body: { success: false, error: 'PIN del doctor incorrecto.', attemptsLeft: pinResult.attemptsLeft },
      };
    }
  }

  return { ok: true, signerDoctor };
}

/**
 * Persiste las firmas (paciente + doctor) de una nota de evolución que se va
 * a marcar OFICIAL, mutando `note` in-place igual que el código original.
 *
 * Antes este bloque estaba duplicado entre addEvolutionNote y
 * signExistingEvolutionNote (idéntico salvo el mensaje del catch de PIN y si
 * se loggeaba con console.error). Se preservan ambas diferencias vía
 * parámetros para no alterar ninguna respuesta ni ningún log existente.
 *
 * @param {object} params
 * @param {object} params.note - subdocumento de la nota (Mongoose), se muta in-place
 * @param {string} params.patientId
 * @param {string} params.patientSignature - dataURL de la firma del paciente
 * @param {object} params.doctorSignature - { method, dataUrl? }
 * @param {object} params.signerDoctor - Usuario que firma como doctor
 * @param {Date} params.now
 * @param {string|null} [params.logContext] - prefijo de console.error si falla el
 *   snapshot de la firma del doctor; `null` para no loggear (signExistingEvolutionNote no lo hacía)
 * @param {string} [params.doctorSnapshotFailureMessage] - texto del error 500
 *   cuando falla el snapshot de la firma del doctor (varía entre call sites)
 * @returns {Promise<{ok:true, writtenSignaturePaths:string[]}|{ok:false, status:number, body:object}>}
 */
async function persistNoteSignatures({
  note,
  patientId,
  patientSignature,
  doctorSignature,
  signerDoctor,
  now,
  logContext = '[addEvolutionNote]',
  doctorSnapshotFailureMessage = 'No se pudo persistir el snapshot de la firma del doctor. La nota NO fue guardada. Intente nuevamente o contacte a soporte.',
}) {
  const writtenSignaturePaths = [];
  const noteId = note._id.toString();
  const contentHash = computeEvolutionNoteHash(note);
  // Sufijo único POR INTENTO de firma. Antes dos intentos sobre la MISMA nota
  // (doble submit, o firma concurrente vía Centro de Firmas) escribían
  // exactamente las mismas rutas (`<noteId>_paciente.png`): el perdedor de la
  // carrera primero PISABA los PNGs del ganador y luego su rollback los
  // BORRABA — la nota OFICIAL quedaba apuntando a archivos ajenos o
  // inexistentes (pérdida de la evidencia de firma). Con sufijo por intento
  // cada request escribe y revierte SOLO sus propios archivos.
  const attempt = crypto.randomBytes(4).toString('hex');

  // 1) Firma del paciente. Guardamos también el hash SHA-256 del PNG
  // (`pacienteFirmaImageHash`) para detectar tampering del archivo
  // en disco posterior al firmado (no reemplaza PKI, es defensa
  // en profundidad — un script de auditoría puede comparar).
  try {
    const patientSig = await saveSignatureDataUrl(patientSignature, [
      'pacientes', patientId, 'firmas-notas', `${noteId}_paciente_${attempt}`
    ]);
    if (patientSig.absPath) writtenSignaturePaths.push(patientSig.absPath);
    note.pacienteFirmaUrl = patientSig.publicUrl;
    note.pacienteFirmadoEn = now;
    note.pacienteFirmaContentHash = contentHash;
    note.pacienteFirmaImageHash = patientSig.contentHash;
  } catch (e) {
    // La nota no se va a guardar. NO decrementamos el counter: es
    // monótono por diseño (se aceptan huecos) y un $inc -1 aquí podría
    // pisar un incremento concurrente de otra nota.
    return {
      ok: false,
      status: 400,
      body: { success: false, error: `No se pudo guardar la firma del paciente: ${e.message}` },
    };
  }

  // 2) Firma del doctor — siempre persistimos un snapshot servible
  // junto con el hash del PNG.
  if (doctorSignature.method === 'pad') {
    try {
      const docSig = await saveSignatureDataUrl(doctorSignature.dataUrl, [
        'pacientes', patientId, 'firmas-notas', `${noteId}_doctor_${attempt}`
      ]);
      if (docSig.absPath) writtenSignaturePaths.push(docSig.absPath);
      note.doctorFirmaUrl = docSig.publicUrl;
      note.doctorFirmaImageHash = docSig.contentHash;
    } catch (e) {
      // Rollback: borra la firma del paciente ya escrita. El counter es
      // monótono (no se decrementa — ver nota arriba).
      await Promise.all(writtenSignaturePaths.map(p => fs.remove(p).catch(() => {})));
      return {
        ok: false,
        status: 400,
        body: { success: false, error: `No se pudo guardar la firma del doctor: ${e.message}` },
      };
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
        'pacientes', patientId, 'firmas-notas', `${noteId}_doctor_${attempt}`
      ]);
      if (snap.absPath) writtenSignaturePaths.push(snap.absPath);
      note.doctorFirmaUrl = snap.publicUrl;
      note.doctorFirmaImageHash = snap.contentHash;
    } catch (e) {
      if (logContext) console.error(`${logContext} Fallo al copiar snapshot de firma:`, e.message);
      await Promise.all(writtenSignaturePaths.map(p => fs.remove(p).catch(() => {})));
      return {
        ok: false,
        status: 500,
        body: { success: false, error: doctorSnapshotFailureMessage },
      };
    }
  }
  note.doctorFirmaMethod = doctorSignature.method;

  // firmadoPor = el DOCTOR que firmó (puede ser ≠ del creador si fue
  // cross-user signing iniciado por un asistente).
  note.firmadoPor = signerDoctor._id;
  note.firmadoEn = now;
  note.contentHash = contentHash;
  note.firmaDesactualizada = false;

  return { ok: true, writtenSignaturePaths };
}

/** 🔹 Agregar nota de evolución */
exports.addEvolutionNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { evolutionNote, patientSignature, doctorSignature } = req.body;

    if (!evolutionNote || typeof evolutionNote !== 'object' || Array.isArray(evolutionNote)) {
      return res.status(400).json({
        success: false,
        error: 'La nota de evolución es requerida.'
      });
    }
    // Tipos, cotas y fecha ANTES de contador/firmas/BD (400 en vez de 500 tardío).
    const invalidMsg = validateEvolutionNotePayload(evolutionNote);
    if (invalidMsg) {
      return res.status(400).json({ success: false, error: invalidMsg });
    }

    // Validar datos de entrada: al menos uno de los campos debe tener contenido
    const hasContent = (
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
    // Firma incompleta (una sola de las dos, o doctorSignature sin method):
    // antes se degradaba en silencio a BORRADOR, descartando una firma del
    // paciente ya capturada sin avisarle a nadie.
    if ((patientSignature || doctorSignature) && !hasSignaturesPayload) {
      return res.status(400).json({
        success: false,
        error: 'Firma incompleta: para guardar como OFICIAL se requieren la firma del paciente Y la del doctor (con método). Omita ambas para guardar como BORRADOR.'
      });
    }
    const estadoRegistro = hasSignaturesPayload ? 'OFICIAL' : 'BORRADOR';

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

      const signerResult = await resolveSigningDoctor({ doctorSignature, userPerms, req });
      if (!signerResult.ok) {
        return res.status(signerResult.status).json(signerResult.body);
      }
      signerDoctor = signerResult.signerDoctor;
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
      // A-8: filtrar `deletedAt: null` igual que el $push posterior. Antes el
      // contador se incrementaba aunque el paciente estuviera soft-deleted,
      // mientras la inserción de la nota (que sí filtra deletedAt) fallaba —
      // dejando el contador monotónico avanzado de forma permanente y un 500.
      { _id: id, deletedAt: null },
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
    // A-8: si el paciente no existe o está soft-deleted, el update filtrado por
    // `deletedAt: null` no matchea y counterDoc es null. No se mutó nada (el
    // contador no avanzó), así que respondemos 404 sin efectos colaterales.
    if (!counterDoc) {
      return res.status(404).json({
        success: false,
        error: 'Paciente no encontrado o no disponible.'
      });
    }
    const numero_procedimiento = counterDoc._evolutionNoteCounter;
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
    // Fecha clínica de la nota (puede ser retroactiva en una captura
    // extemporánea). `fechaFormateada` se deriva de ESTA fecha, no de `now`:
    // antes una nota retroactiva mostraba la fecha de captura en la UI (que
    // prefiere `fechaFormateada`) en vez de la fecha clínica real.
    const fechaNota = evolutionNote.fecha ? new Date(evolutionNote.fecha) : now;
    const newEvolutionNote = {
      numero_procedimiento,
      procedimiento: (evolutionNote.procedimiento || '').trim(),
      observaciones: (evolutionNote.observaciones || '').trim(),
      correcciones: (evolutionNote.correcciones || '').trim(),
      fecha: fechaNota,
      // La etiqueta visible se deriva SIEMPRE de la fecha clínica (la que cubre
      // el contentHash y vigila el guard de captura extemporánea). Antes se
      // aceptaba `fechaFormateada` del cliente y la UI la prefiere al
      // renderizar: una nota firmada podía MOSTRAR una fecha arbitraria
      // distinta de la fecha hasheada, fuera de toda verificación (el cliente
      // propio nunca envía este campo — sólo lo explotaría un caller directo).
      fechaFormateada: fechaNota.toLocaleDateString('es-ES', {
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
    let writtenSignaturePaths = [];

    // Persistir firmas SOLO si la nota es OFICIAL (BORRADOR sin firma)
    if (estadoRegistro === 'OFICIAL') {
      const signResult = await persistNoteSignatures({
        note: noteSubdoc,
        patientId: id,
        patientSignature,
        doctorSignature,
        signerDoctor,
        now,
        logContext: '[addEvolutionNote]',
      });
      if (!signResult.ok) {
        return res.status(signResult.status).json(signResult.body);
      }
      writtenSignaturePaths = signResult.writtenSignaturePaths;
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

    // firmadoPor enriquecido con el snapshot del firmante ya cargado (misma
    // forma que el populate de getPatientById): la UI muestra el nombre del
    // doctor en tooltip/impresión sin tener que recargar el expediente.
    const responseNote = savedNote.toObject();
    if (responseNote.firmadoPor && signerDoctor) {
      responseNote.firmadoPor = {
        _id: signerDoctor._id,
        nombre: signerDoctor.nombre,
        cedulaProfesional: signerDoctor.cedulaProfesional || null,
      };
    }

    return res.status(201).json({
      success: true,
      message: 'Nota de evolución agregada correctamente',
      data: responseNote
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
    // Usa el helper canónico (normaliza casing e incluye 'admin'/'superadmin').
    // Antes era un `includes()` case-sensitive contra strings en minúscula: si el
    // rol del token venía con otra capitalización, un admin legítimo NO era
    // reconocido como tal y no podía editar un borrador ajeno.
    const isAdmin = isAdminRole(req.user?.role);
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

    const changes = {};
    for (const f of NOTE_CONTENT_FIELDS) {
      const v = (req.body || {})[f];
      if (typeof v !== 'string') continue;
      const trimmed = v.trim();
      // Cota espejo del schema: el $set posicional de abajo NO corre
      // validators de Mongoose, así que sin este check el maxlength de
      // notas_evolucion era bypasseable editando el borrador.
      if (trimmed.length > NOTE_FIELD_MAX[f]) {
        return res.status(400).json({
          success: false,
          error: `El campo ${f} excede el máximo de ${NOTE_FIELD_MAX[f]} caracteres.`
        });
      }
      changes[f] = trimmed;
      note[f] = trimmed;
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
      error: devError(error) || 'Error interno al actualizar la nota.'
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

    const signerResult = await resolveSigningDoctor({
      doctorSignature,
      userPerms,
      req,
      pinLockedMessage: 'PIN del doctor bloqueado. Reintenta en {minutos} minuto(s).',
    });
    if (!signerResult.ok) {
      return res.status(signerResult.status).json(signerResult.body);
    }
    const signerDoctor = signerResult.signerDoctor;

    const now = new Date();
    const noteIdStr = note._id.toString();

    const signResult = await persistNoteSignatures({
      note,
      patientId: id,
      patientSignature,
      doctorSignature,
      signerDoctor,
      now,
      logContext: null,
      doctorSnapshotFailureMessage: 'No se pudo persistir el snapshot de la firma del doctor.',
    });
    if (!signResult.ok) {
      return res.status(signResult.status).json(signResult.body);
    }
    const writtenSignaturePaths = signResult.writtenSignaturePaths;

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
    } catch (_saveErr) {
      await Promise.all(writtenSignaturePaths.map(p => fs.remove(p).catch(() => {})));
      return res.status(500).json({ success: false, error: 'No se pudo guardar la nota firmada. Los cambios se revirtieron.' });
    }

    auditLogger.registrarManual(req, 'firma_electronica', {
      resourceType: 'patient',
      resourceId: note._id,
      patientId: patient._id,
      detalles: { contentHash: note.contentHash, noteId: noteIdStr, method: doctorSignature.method }
    }).catch(() => {});

    // Igual que en addEvolutionNote: firmadoPor enriquecido con el firmante ya
    // cargado, para que la UI muestre el nombre real sin recargar.
    const responseNote = note.toObject();
    responseNote.firmadoPor = {
      _id: signerDoctor._id,
      nombre: signerDoctor.nombre,
      cedulaProfesional: signerDoctor.cedulaProfesional || null,
    };

    return res.json({ success: true, message: 'Nota firmada exitosamente como OFICIAL.', data: responseNote });
  } catch (error) {
    console.error('Error en signExistingEvolutionNote:', error);
    return res.status(500).json({ success: false, error: devError(error) || 'Error interno al firmar la nota.' });
  }
};

/**
 * 🔹 Verificar la integridad de una nota de evolución.
 *
 * GET /patients/:id/evolution-note/:noteId/verify
 *
 * Recalcula el hash del contenido clínico y los SHA-256 de las imágenes de
 * firma en disco, y los compara contra lo sellado al firmar. El veredicto
 * (evaluateNoteIntegrity, utils/signing) aplica las reglas NOM-004/NOM-024:
 * una OFICIAL exige contenido y firma del doctor íntegros; la firma del
 * paciente sólo penaliza si está presente y alterada (el Centro de Firmas
 * produce OFICIALES sin ella por diseño del flujo de delegación).
 */
exports.verifyEvolutionNoteIntegrity = async (req, res) => {
  // URL pública almacenada por el server ('/uploads/...') → ruta absoluta.
  const uploadsPathFromPublicUrl = (publicUrl) => (
    (typeof publicUrl === 'string' && publicUrl.startsWith('/uploads/'))
      ? resolveUploadsPath(...publicUrl.replace(/^\/uploads\//, '').split('/'))
      : null
  );
  try {
    const { id, noteId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(noteId)) {
      return res.status(400).json({ success: false, error: 'IDs inválidos.' });
    }

    const patient = await Patient.findOne({ _id: id, deletedAt: null });
    if (!patient) return res.status(404).json({ success: false, error: 'Paciente no encontrado.' });

    const note = patient.notas_evolucion.id(noteId);
    if (!note || note.deletedAt) return res.status(404).json({ success: false, error: 'Nota no encontrada.' });

    // Contenido vs hash sellado al firmar (null = sin referencia; el veredicto
    // decide si eso es anomalía según el estado).
    const computedHash = computeEvolutionNoteHash(note);
    const contenidoOk = note.contentHash ? computedHash === note.contentHash : null;

    // Imágenes de firma vs su SHA-256 sellado (detecta swap del archivo en disco).
    const firmaPacienteOk = (note.pacienteFirmaUrl && note.pacienteFirmaImageHash)
      ? (await verifySignatureImageHash(uploadsPathFromPublicUrl(note.pacienteFirmaUrl), note.pacienteFirmaImageHash)).ok
      : null;
    let firmaDoctorOk;
    if (note.doctorFirmaUrl && note.doctorFirmaImageHash) {
      firmaDoctorOk = (await verifySignatureImageHash(uploadsPathFromPublicUrl(note.doctorFirmaUrl), note.doctorFirmaImageHash)).ok;
    } else if (note.doctorFirmaMethod === 'pin' && note.firmadoPor) {
      // Firma electrónica (PIN + contentHash) sin imagen: válida por diseño —
      // el Centro de Firmas no bloquea ante un fallo de disco del snapshot.
      firmaDoctorOk = true;
    } else {
      firmaDoctorOk = null; // sin evidencia de firma del doctor
    }

    const veredicto = evaluateNoteIntegrity({
      estadoRegistro: note.estadoRegistro,
      contenidoOk,
      firmaPacienteOk,
      firmaDoctorOk,
    });

    return res.json({
      success: true,
      integro: veredicto.integro,
      motivos: veredicto.motivos,
      checks: { contenidoOk, firmaPacienteOk, firmaDoctorOk },
      contentHash: { almacenado: note.contentHash || null, calculado: computedHash },
      estadoRegistro: note.estadoRegistro,
      firmadoEn: note.firmadoEn || null,
    });
  } catch (error) {
    console.error('Error en verifyEvolutionNoteIntegrity:', error);
    return res.status(500).json({ success: false, error: devError(error) || 'Error interno al verificar la nota.' });
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

    // Autenticación del doctor según el método:
    //  - 'pin': reusa la firma digital subida; exige firma subida + PIN.
    //  - 'pad' con el mismo usuario de la sesión: el trazo basta.
    //  - 'pad' con OTRO doctor (asDoctorId ajeno): exige ADEMÁS su PIN —
    //    misma regla que resolveSigningDoctor (notas); cierra la suplantación
    //    por asistente. Decisión del propietario 2026-07-12.
    const isCrossUserHC = Boolean(asDoctorId) && String(asDoctorId) !== String(req.user.id);
    if (doctorSignature.method === 'pin' && !signerDoctor.firmaDigitalUrl) {
      return res.status(400).json({
        success: false,
        error: 'El doctor no tiene firma digital subida. Use el pad o suba la firma en Perfil Profesional.'
      });
    }
    if (doctorSignature.method === 'pin' || isCrossUserHC) {
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
        // Paridad con addEvolutionNote (N1): la etiqueta visible se deriva
        // SIEMPRE de la fecha clínica del plan — antes se aceptaba
        // `fechaFormateada` del cliente y el fallback usaba la fecha de
        // captura (new Date()), no la del plan (un plan retroactivo mostraba
        // la fecha de captura). Fecha no parseable → 400 (antes CastError→500).
        if (treatmentPlan.fecha !== undefined && treatmentPlan.fecha !== null
            && Number.isNaN(new Date(treatmentPlan.fecha).getTime())) {
            return res.status(400).json({ success: false, error: 'La fecha del plan no es válida.' });
        }
        const fechaPlan = treatmentPlan.fecha ? new Date(treatmentPlan.fecha) : new Date();
        const newTreatmentPlan = {
            texto: treatmentPlan.texto.trim(),
            fecha: fechaPlan,
            fechaFormateada: fechaPlan.toLocaleDateString('es-ES', {
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

        // A-10: insertar de forma ATÓMICA con $push + $position:0 (equivalente a
        // unshift) en lugar de unshift + patient.save(). El modelo usa
        // versionKey:false (sin control de concurrencia optimista), por lo que
        // un read-modify-write del documento completo descartaba silenciosamente
        // planes en escrituras concurrentes. addEvolutionNote ya se reescribió
        // así; esto alinea addTreatmentPlan al mismo patrón seguro.
        const planId = new mongoose.Types.ObjectId();
        newTreatmentPlan._id = planId;
        const updateResult = await Patient.updateOne(
            { _id: id, deletedAt: null },
            { $push: { planes_tratamiento: { $each: [newTreatmentPlan], $position: 0 } } }
        );
        if (!updateResult || updateResult.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Paciente no encontrado'
            });
        }

        // Devolver el subdocumento guardado (con el _id que generamos)
        const savedPlan = { ...newTreatmentPlan, _id: planId };

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
    // Acepta YYYY-MM-DD y también ISO-8601 con hora (YYYY-MM-DDTHH:mm…) o un
    // espacio + hora: formatos inequívocos. El cliente envía YYYY-MM-DD, pero la
    // BD/consumidores por API pueden mandar el ISO completo. Se sigue rechazando
    // texto ambiguo ("Jan 5 2010", "5-6-2010"); sólo se usa la parte y-m-d.
    const ymd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
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
      // Estricto: sólo aceptamos DD/MM/YYYY o YYYY-MM-DD. Se eliminó el
      // fallback `new Date(trimmed)`, que aceptaba formatos ambiguos
      // ("Jan 5 2010", "5-6-2010", "2010/06/05") con semántica de
      // timezone/locale y producía fecha_nacimiento/edad inconsistentes.
      return null;
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

// Sólo para tests unitarios — no es API pública del controller.
exports._validatePatientFieldRules = validatePatientFieldRules;
exports._sanitizeAndLimitPayload = sanitizeAndLimitPayload;

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
      // Colisión de paciente_id: ahora siempre llega como E11000 del índice
      // único. (Antes mongoose-unique-validator también la reportaba como
      // ValidationError kind:'unique'; ese plugin se quitó por costo/race.)
      // Regeneramos el id y reintentamos.
      const e11000Key = err?.keyPattern || err?.keyValue || {};
      const isPacienteIdDupe = err?.code === 11000
        && Object.prototype.hasOwnProperty.call(e11000Key, 'paciente_id');
      if (isPacienteIdDupe && attempt < maxAttempts) {
        newPatient.paciente_id = await newPatient.constructor.generateUniquePatientId();
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}



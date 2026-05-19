// Import required models and dependencies
const Patient = require('../models/patient.js');
const Appointment = require('../models/appointment.js');
const Periodontogram = require('../models/periodontogram.js');
const fs = require('fs-extra');
const path = require('path');
const mongoose = require('mongoose');
const { resolveUploadsPath, ensureUploadsPath } = require('../utils/uploads');
const { hasPermission, getEffectivePermissions } = require('../utils/permissions');
const { sanitizePatientForBasicRead, BASIC_PATIENT_WRITE_FIELDS } = require('../middlewares/authorize');

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
exports.getAllPatients = async (req, res) => {
    try {
        console.log("📡 Solicitando todos los pacientes...");

        // Implementar paginación opcional
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 0; // 0 significa sin límite
        const skip = (page - 1) * limit;

        // Construir la consulta base (excluir pacientes dados de baja)
        let query = Patient.find({ deletedAt: null }, { __v: 0 });

        // Aplicar paginación si se especifica un límite
        if (limit > 0) {
            query = query.skip(skip).limit(limit);
        }

        // Ejecutar la consulta
        const patients = await query.exec();

        // Contar el total de pacientes para la paginación (excluyendo dados de baja)
        const total = await Patient.countDocuments({ deletedAt: null });

        if (!patients.length) {
            console.log("⚠️ No se encontraron pacientes.");
        }

        // Verificar que todos los pacientes tengan un `paciente_id` generado correctamente
        let patientsWithId = patients.map(patient => ({
            ...patient.toObject(),
            paciente_id: patient.paciente_id || "No asignado" // Si no tiene un ID, muestra "No asignado"
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


exports.getPatientById = async (req, res) => {
    try {
      const { id } = req.params;
      console.log("🔍 Buscando paciente con _id:", id);
  
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
        console.log("⚠️ Paciente no encontrado en la base de datos.");
        return res.status(404).json({ message: "Paciente no encontrado" });
      }

      // 📌 MEJORA: Obtener citas del modelo Appointment independiente
      // (Campo 'citas' eliminado del modelo Patient por redundancia)
      const citas = await Appointment.find({ paciente_id: patient._id })
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
                return res.status(400).json({ message: "Error al parsear los datos del paciente" });
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
        console.log("✅ Paciente guardado exitosamente con ID:", newPatient._id);

        // Periodontograma inicial (best-effort, no aborta la creación)
        try {
            const initialPeriodontogram = await Periodontogram.createInitial(newPatient._id);
            console.log("✅ Periodontograma inicial creado con ID:", initialPeriodontogram._id);
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
            return res.status(409).json({
                message: 'Datos duplicados (índice único)',
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
        patient.deletedAt = new Date();
        patient.deletedBy = req.user?.id || null;
        patient.deleteReason = deleteReason.trim();
        await patient.save({ validateModifiedOnly: true });

        // Soft-delete de citas asociadas (deletedAt: null coincide con null y campo ausente)
        await Appointment.updateMany(
            { paciente_id: patient._id, deletedAt: null },
            { $set: { deletedAt: new Date(), deletedBy: req.user?.id || null, deleteReason: 'Paciente dado de baja' } }
        );

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


/** 🔹 Agregar nota de evolución */
exports.addEvolutionNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { evolutionNote } = req.body;

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

    // Calcular numero_procedimiento como longitud_actual + 1
    const numero_procedimiento = (patient.notas_evolucion?.length || 0) + 1;

    // Determinar estadoRegistro según permisos (asistente → BORRADOR)
    const userPerms = getEffectivePermissions(req.user);
    let estadoRegistro = 'OFICIAL';
    if (!hasPermission(userPerms, ['consultas.create']) && hasPermission(userPerms, ['consultas.create.draft'])) {
      estadoRegistro = 'BORRADOR';
    }

    // Preparar la nueva nota de evolución
    const now = new Date();
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
      creadoPor: req.user?.id || null,
      estadoRegistro,
      capturaExtemporanea: req.body._capturaExtemporanea || undefined
    };

    // Agregar al inicio del array
    if (!Array.isArray(patient.notas_evolucion)) {
      patient.notas_evolucion = [];
    }
    patient.notas_evolucion.unshift(newEvolutionNote);

    // Guardar el paciente
    await patient.save();

    // Devolver el subdocumento guardado (con _id generado por Mongoose)
    const savedNote = patient.notas_evolucion[0];
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

        // Preparar el nuevo plan de tratamiento
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



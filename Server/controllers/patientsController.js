// Import required models and dependencies
const Patient = require('../models/patient.js');
const Appointment = require('../models/appointment.js');
const Periodontogram = require('../models/periodontogram.js');
const fs = require('fs-extra');
const path = require('path');
const mongoose = require('mongoose');
const { getUploadsBase, resolveUploadsPath, ensureUploadsPath } = require('../utils/uploads');
const uploadsBase = getUploadsBase();
// 🔥 Función temporal para desarrollo - Borrar todos los pacientes
exports.deleteAllPatients = async (req, res) => {
    try {
        // Verificar que no se esté intentando convertir un ID (evitar el error de Cast to ObjectId)
        if (req.params.id) {
            return res.status(400).json({ message: 'Esta ruta no acepta parámetros de ID' });
        }
        
        // Solo permitir en modo desarrollo
        if (process.env.NODE_ENV !== 'development') {
            return res.status(403).json({ message: 'Esta función solo está disponible en modo desarrollo' });
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

        // Construir la consulta base
        let query = Patient.find({}, { __v: 0 }); // Excluye __v para limpiar la respuesta

        // Aplicar paginación si se especifica un límite
        if (limit > 0) {
            query = query.skip(skip).limit(limit);
        }

        // Ejecutar la consulta
        const patients = await query.exec();

        // Contar el total de pacientes para la paginación
        const total = await Patient.countDocuments();

        if (!patients.length) {
            console.log("⚠️ No se encontraron pacientes.");
        }

        // Verificar que todos los pacientes tengan un `paciente_id` generado correctamente
        const patientsWithId = patients.map(patient => ({
            ...patient.toObject(),
            paciente_id: patient.paciente_id || "No asignado" // Si no tiene un ID, muestra "No asignado"
        }));

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
  
      // Buscar usando el _id de MongoDB con manejo de errores mejorado
      console.log('🔍 DEBUG: Ejecutando Patient.findById con ID:', id);
      console.log('🔍 DEBUG: Tipo de ID:', typeof id);
      console.log('🔍 DEBUG: Conexión MongoDB estado:', mongoose.connection.readyState);
      console.log('🔍 DEBUG: Base de datos actual:', mongoose.connection.name);
      
      const patient = await Patient.findById(id).exec();
      
      console.log('🔍 DEBUG: Resultado de findById:', patient ? 'ENCONTRADO' : 'NULL');
      if (patient) {
        console.log('🔍 DEBUG: Datos del paciente encontrado:', {
          _id: patient._id,
          name: patient.name,
          primer_nombre: patient.primer_nombre,
          email: patient.email
        });
      }
  
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
      res.status(200).json({ 
        patient: patient.toObject(),
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
  



/** 🔹 Crear un paciente con subida de foto y archivos anexos */
exports.createPatient = async (req, res) => {
    try {
        console.log("📥 Recibiendo paciente:", req.body);
        console.log("📝 Validando estructura de datos recibidos:", JSON.stringify(req.body, null, 2));

        // 📌 Parsear datos del paciente si vienen en el campo patientData
        let patientData = req.body;
        if (req.body.patientData) {
            try {
                patientData = JSON.parse(req.body.patientData);
                console.log("📝 Datos del paciente parseados:", patientData);
            } catch (parseError) {
                console.error("Error al parsear patientData:", parseError);
                return res.status(400).json({ message: "Error al parsear los datos del paciente" });
            }
        }

        // Si multer generó un _id para la subida, propagarlo al patientData para que coincida con la carpeta creada
        if (req.body._id && mongoose.Types.ObjectId.isValid(req.body._id) && !patientData._id) {
            patientData._id = req.body._id;
        }
        // Nuevo: sanitizar y limitar tamaño de payload para evitar 500 por formularios muy grandes
        const payloadSize = estimatePayloadSize(patientData);
        const MAX_PAYLOAD_SIZE_BYTES = 2 * 1024 * 1024; // 2MB de tope lógico para campos de texto
        if (payloadSize > MAX_PAYLOAD_SIZE_BYTES) {
            return res.status(413).json({
                message: "El formulario enviado es demasiado grande",
                error: `Payload de ${payloadSize} bytes supera el límite permitido (${MAX_PAYLOAD_SIZE_BYTES})`
            });
        }
        patientData = sanitizeAndLimitPayload(patientData);
        if (Array.isArray(patientData.contactos_emergencia)) {
            patientData.contactos_emergencia = patientData.contactos_emergencia.filter(c => c && typeof c === 'object' && (c.nombre && String(c.nombre).trim()) && (c.parentesco && String(c.parentesco).trim()) && (c.telefono && String(c.telefono).trim()));
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

        // 📌 Validar si se envió la fecha de nacimiento correctamente
        if (!patientData.fecha_nacimiento) {
            console.error("❌ Fecha de nacimiento no proporcionada");
            return res.status(400).json({ message: "Fecha de nacimiento no proporcionada" });
        }
        
        // Verificar si la fecha está en formato DD/MM/YYYY y convertirla correctamente
        let fechaNacimiento;
        if (typeof patientData.fecha_nacimiento === 'string' && patientData.fecha_nacimiento.includes('/')) {
            // Si viene en formato DD/MM/YYYY, convertir correctamente
            const parts = patientData.fecha_nacimiento.split('/');
            if (parts.length === 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // Los meses en JS son 0-indexados
                const year = parseInt(parts[2], 10);
                fechaNacimiento = new Date(year, month, day);
                // Actualizar el valor en patientData para usarlo más adelante
                patientData.fecha_nacimiento = fechaNacimiento;
            }
        } else {
            // Si no está en formato DD/MM/YYYY, intentar parsear normalmente
            fechaNacimiento = new Date(patientData.fecha_nacimiento);
        }
        
        if (isNaN(fechaNacimiento.getTime())) {
            console.error("❌ Fecha de nacimiento inválida");
            return res.status(400).json({ message: "Fecha de nacimiento inválida" });
        }

        // 📌 Generar un ID único para el paciente si no se proporciona
        if (!patientData.paciente_id) {
            console.log("🔧 Generando ID único para paciente...");
            patientData.paciente_id = await Patient.generateUniquePatientId();
            console.log("✅ ID generado:", patientData.paciente_id);
        }

        // 📌 Calcular la edad correctamente
        const calcularEdad = (fechaNacimiento) => {
            // Si ya es un objeto Date, usarlo directamente
            const nacimiento = fechaNacimiento instanceof Date ? fechaNacimiento : new Date(fechaNacimiento);
            const hoy = new Date();
            let edad = hoy.getFullYear() - nacimiento.getFullYear();
            if (hoy.getMonth() < nacimiento.getMonth() || 
                (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate())) {
                edad--;
            }
            return edad;
        };

        // Validar _id si viene en el payload
        if (patientData._id && !mongoose.Types.ObjectId.isValid(patientData._id)) {
            console.error("❌ ID de paciente inválido en el payload");
            return res.status(400).json({ message: "ID de paciente inválido en el payload" });
        }

        // 📌 Crear paciente en la base de datos
        if (patientData._id && mongoose.Types.ObjectId.isValid(patientData._id)) {
            patientData._id = new mongoose.Types.ObjectId(patientData._id);
        }

        const newPatient = new Patient({
            ...patientData,
            edad: calcularEdad(patientData.fecha_nacimiento)
        });
        
        // 📂 Crear carpeta del paciente usando el _id de mongoose
        const patientIdStr = newPatient._id.toString();
        const patientFolderPath = resolveUploadsPath('pacientes', patientIdStr);
        const initialOdontogramPath = resolveUploadsPath('pacientes', patientIdStr, 'odontograma-inicial');
        const profilePicFolderPath = resolveUploadsPath('pacientes', patientIdStr, 'profile-pic');

        try {
            await ensureUploadsPath('pacientes');
            await ensureUploadsPath('pacientes', patientIdStr);
            await ensureUploadsPath('pacientes', patientIdStr, 'odontograma-inicial');
            await ensureUploadsPath('pacientes', patientIdStr, 'profile-pic');
            console.log(`✅ Carpeta del paciente creada en: ${patientFolderPath}`);
            console.log(`✅ Subcarpeta para odontograma inicial creada en: ${initialOdontogramPath}`);
            // Actualizar el paciente con la ruta de archivos principal
            newPatient.ruta_archivos = patientFolderPath;
        } catch (err) {
            console.error('❌ Error al crear carpetas del paciente:', err);
            return res.status(503).json({
                message: 'No se pudo crear la estructura de carpetas para el paciente',
                error: err?.message || String(err)
            });
        }

        // 📌 Guardar la foto del paciente si se subió
        let fotoPath = null;
        if (req.file) {
            // La foto se guarda en la ruta específica configurada en multer
            fotoPath = `/uploads/pacientes/${patientIdStr}/profile-pic/${req.file.filename}`;
        }

        // 📌 Guardar archivos anexos si se subieron
        let archivosAnexos = [];
        if (req.files && req.files.archivos) {
            archivosAnexos = req.files.archivos.map(file => path.join(patientFolderPath, file.filename));
        }
        
        // Actualizar el paciente con las rutas de archivos
        newPatient.photoURL = fotoPath;
        newPatient.foto = fotoPath; // También guardar en el campo foto para compatibilidad
        newPatient.archivos = archivosAnexos;

        console.log("💾 Intentando guardar paciente en la base de datos...");
        await newPatient.save();
        console.log("✅ Paciente guardado exitosamente con ID:", newPatient._id);

        // 📌 INICIALIZACIÓN AUTOMÁTICA DEL PERIODONTOGRAMA
        try {
            console.log("🦷 Creando periodontograma inicial para el paciente...");
            const initialPeriodontogram = await Periodontogram.createInitial(newPatient._id);
            console.log("✅ Periodontograma inicial creado exitosamente con ID:", initialPeriodontogram._id);
        } catch (periodontogramError) {
            console.error("⚠️ Error al crear periodontograma inicial:", periodontogramError.message);
            // No detener la creación del paciente por este error, solo registrarlo
            console.log("ℹ️ El paciente se creó correctamente, pero el periodontograma deberá crearse manualmente");
        }

        res.status(201).json({
            message: "✅ Paciente creado correctamente",
            patient: newPatient
        });

    } catch (error) {
        console.error("❌ Error al crear el paciente:", error);
        // Manejo detallado de errores comunes para evitar 500 genérico
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
    }
};

/** 🔹 Crear múltiples pacientes */
exports.createPatients = async (req, res) => {
    try {
        console.log("📥 Recibiendo pacientes:", req.body);

        if (!Array.isArray(req.body) || req.body.length === 0) {
            return res.status(400).json({ message: "Debe enviar un array de pacientes" });
        }

        // 📌 Función para calcular la edad
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

        const patientsWithId = await Promise.all(req.body.map(async (patientData) => {
            if (!patientData.paciente_id) {
                patientData.paciente_id = await Patient.generateUniquePatientId();
            }

            const newPatient = new Patient(patientData);
            newPatient.edad = calcularEdad(patientData.fecha_nacimiento);
            return newPatient;
        }));

        const newPatients = await Patient.insertMany(patientsWithId);
        res.status(201).json({
            message: "Pacientes creados correctamente",
            patients: newPatients
        });

    } catch (error) {
        console.error("❌ Error al crear los pacientes:", error);
        res.status(500).json({ message: "Error al crear los pacientes", error: error.message });
    }
};

/** 🔹 Actualizar paciente */
exports.updatePatient = async (req, res) => {
    try {
        // 📌 Parsear datos enviados como FormData (patientData) y preparar update
        let updateData = req.body || {};
        if (req.body && typeof req.body.patientData === 'string') {
            try {
                updateData = JSON.parse(req.body.patientData);
            } catch (parseError) {
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

        // 📌 Función para calcular la edad
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

        // 📅 Normalizar formato de fecha_nacimiento (aceptar DD/MM/YYYY) y recalcular edad
        if (updateData.fecha_nacimiento) {
            let fechaNacimiento = updateData.fecha_nacimiento;
            if (typeof fechaNacimiento === 'string' && fechaNacimiento.includes('/')) {
                const parts = fechaNacimiento.split('/');
                if (parts.length === 3) {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1; // 0-index
                    const year = parseInt(parts[2], 10);
                    fechaNacimiento = new Date(year, month, day);
                }
            } else {
                fechaNacimiento = new Date(fechaNacimiento);
            }
            if (isNaN(fechaNacimiento.getTime())) {
                return res.status(400).json({ message: 'Fecha de nacimiento inválida' });
            }
            updateData.fecha_nacimiento = fechaNacimiento;
            updateData.edad = calcularEdad(fechaNacimiento);
        }

        // 📌 Manejar actualización de foto si se subió una nueva
        if (req.file) {
            const fotoPath = `/uploads/pacientes/${req.params.id}/profile-pic/${req.file.filename}`;
            updateData.photoURL = fotoPath;
            updateData.foto = fotoPath; // También guardar en el campo foto para compatibilidad
        }

        // 🧩 Evitar reemplazar subdocumentos completos: aplanar a notación con puntos
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
        const setPayload = flattenToDot(updateData);

        const updatedPatient = await Patient.findByIdAndUpdate(
            req.params.id,
            { $set: setPayload },
            { new: true, runValidators: true, context: 'query' }
        );

        if (!updatedPatient) {
            return res.status(404).json({ message: "Paciente no encontrado" });
        }

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
    }
};

/** 🔹 Eliminar un paciente y su carpeta */
exports.deletePatient = async (req, res) => {
    try {
        const deletedPatient = await Patient.findByIdAndDelete(req.params.id);
        if (!deletedPatient) return res.status(404).json({ message: 'Paciente no encontrado' });

        // 📂 Eliminar carpeta del paciente si existe (usando ID sin #)
    const patientFolderPath = path.join(uploadsBase, 'pacientes', deletedPatient._id.toString());
        try {
            await fs.remove(patientFolderPath);
            console.log(`🗑️ Carpeta del paciente eliminada: ${patientFolderPath}`);
        } catch (error) {
            console.error(`⚠️ No se pudo eliminar la carpeta del paciente: ${patientFolderPath}`);
        }

        // 🔹 Eliminar citas asociadas
        await Appointment.deleteMany({ paciente_id: deletedPatient._id });

        res.status(200).json({ message: 'Paciente eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar el paciente', error: error.message });
    }
};


/** 🔹 Guardar captura del odontograma inicial */
// Add these methods to your existing controller

/**
 * Save odontograma screenshot
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
// Update the saveOdontogramaScreenshot method
exports.saveOdontogramaScreenshot = async (req, res) => {
  try {
    const { id } = req.params;
    const { imageData, tipo, odontogramaData } = req.body;
    
    // Validar datos de entrada
    if (!imageData) {
      return res.status(400).json({ error: 'No se proporcionó la imagen del odontograma' });
    }
    
    if (!imageData.startsWith('data:image')) {
      return res.status(400).json({ error: 'Formato de imagen inválido' });
    }
    

    if (imageData.length < 1000) {
      return res.status(400).json({ error: 'La imagen proporcionada es demasiado pequeña o está corrupta' });
    }
    
    // Create directory if it doesn't exist
    const dir = path.join(uploadsBase, 'pacientes', id);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    

    const timestamp = Date.now();
    const filename = `odontograma_inicial_${timestamp}.png`;
    const filepath = path.join(dir, filename);
    
    try {

      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      
      // Verificar que los datos base64 sean válidos
      if (!base64Data || base64Data.trim() === '') {
        throw new Error('Datos base64 inválidos después de procesar');
      }
      
      // Escribir archivo con manejo de errores
      fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
      
      // Verificar que el archivo se creó correctamente
      if (!fs.existsSync(filepath) || fs.statSync(filepath).size === 0) {
        throw new Error('El archivo de imagen se creó pero está vacío');
      }
      
      console.log(`Imagen guardada correctamente en: ${filepath}, tamaño: ${fs.statSync(filepath).size} bytes`);
    } catch (fileError) {
      console.error('Error al escribir el archivo de imagen:', fileError);
      return res.status(500).json({ error: `Error al guardar la imagen: ${fileError.message}` });
    }
    
    // Store both the relative URL path and the full base64 data
    const imageUrl = `/uploads/pacientes/${id}/${filename}`;
    
    // Update patient record
    const patient = await Patient.findById(id);
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }
    
    // ❌ CAMPO ELIMINADO: odontogramaInicial migrado a modelo Odontograma independiente
    // patient.odontogramaInicial = {

    //   datos: odontogramaData,
    //   fecha: new Date(),
    //   odontogramaInicialGuardado: true
    // };
    
    await patient.save();
    

    res.status(500).json({
      error: 'Función obsoleta: usar modelo Odontograma independiente'
    });
  } catch (error) {
    console.error('Error al guardar el odontograma inicial:', error);
    res.status(500).json({ error: `Error al guardar el odontograma inicial: ${error.message}` });
  }
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

    // Buscar el paciente
    const patient = await Patient.findById(id);
    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'Paciente no encontrado'
      });
    }

    // Calcular numero_procedimiento como longitud_actual + 1
    const numero_procedimiento = (patient.notas_evolucion?.length || 0) + 1;

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
      })
    };

    // Agregar al inicio del array
    if (!Array.isArray(patient.notas_evolucion)) {
      patient.notas_evolucion = [];
    }
    patient.notas_evolucion.unshift(newEvolutionNote);

    // Guardar el paciente
    await patient.save();

    return res.status(201).json({
      success: true,
      message: 'Nota de evolución agregada correctamente',
      data: newEvolutionNote
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

        // Buscar el paciente
        const patient = await Patient.findById(id);
        if (!patient) {
            return res.status(404).json({ 
                success: false, 
                error: 'Paciente no encontrado' 
            });
        }

        // Preparar el nuevo plan de tratamiento
        const newTreatmentPlan = {
            texto: treatmentPlan.texto.trim(),
            fecha: treatmentPlan.fecha || new Date(),
            fechaFormateada: treatmentPlan.fechaFormateada || new Date().toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        };

        // Agregar el plan de tratamiento al array
        patient.planes_tratamiento.unshift(newTreatmentPlan);
        
        // Guardar el paciente
        await patient.save();

        res.status(201).json({
            success: true,
            message: 'Plan de tratamiento agregado correctamente',
            data: newTreatmentPlan
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



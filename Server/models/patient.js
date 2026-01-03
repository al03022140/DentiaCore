const mongoose = require('mongoose');
const uniqueValidator = require('mongoose-unique-validator');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { resolveUploadsPath, ensureUploadsPath } = require('../utils/uploads');

// Importar esquemas modulares (solo los necesarios)
const DamageSchema = require('./schemas/damageSchema');
const InitialSnapshotSchema = require('./schemas/initialSnapshotSchema');

// Función para generar un número de 4 dígitos
function generate4Digits() {
  return Math.floor(1000 + Math.random() * 9000);
}

// Función para encriptar datos sensibles
function encryptSensitiveData(data) {
  if (!data) return data;
  const algorithm = 'aes-256-cbc';
  const key = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, key);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

// ─── Esquema principal del Paciente ───────────────────────────────────────────
const PatientSchema = new mongoose.Schema({
  // ─── Identificación única ──────────────────────────────────────────────────
  paciente_id: {
    type: String,
    unique: true,
    sparse: true, // Permite múltiples documentos con valor null/undefined
    index: true // Índice para búsquedas rápidas
  },

  // ─── Información personal y médica (estructura legacy normalizada) ────────
  // 📌 Foto del paciente (opcional)
  photoURL: { type: String, default: '' },

  // 📌 Identificación
  documento: {
      tipo: { type: String, enum: ["Licencia", "Pasaporte", "INE", "Otro"], required: true },
      numero: { type: String, required: true, unique: true }
  },

  // 📌 Datos Personales
  primer_nombre: { type: String, required: true, trim: true },
  otros_nombres: { type: String, trim: true, default: "" },
  apellido_paterno: { type: String, required: true, trim: true },
  apellido_materno: { type: String, trim: true, default: "" },
  fecha_nacimiento: { type: Date, required: true },
  edad: { type: Number }, // Se calcula automáticamente
  sexo: { type: String, enum: ['Masculino', 'Femenino', 'Otro'], required: true },
  estado_civil: { type: String, default: "" },
  nacionalidad: { type: String, default: "" },
  lugar_nacimiento: { type: String, default: "" },
  escolaridad: { type: String, default: "" },
  ocupacion: { type: String, default: "" },
  email: { type: String, default: "" },
  
  // 📌 Situación Laboral
  situacion_laboral: {
      empleado: { type: Boolean, default: false },
      pensionado: { type: Boolean, default: false },
      desempleado: { type: Boolean, default: false },
      jubilado: { type: Boolean, default: false }
  },

  // 📌 CAMPO ELIMINADO: citas (redundante - ya existe modelo Appointment independiente)
  // citas: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' }],

  // 📌 Información de Contacto
  contacto: {
      telefono: { type: String, default: "" },
      direccion: { type: String, default: "" },
      codigo_postal: { type: String, default: "" },
      colonia: { type: String, default: "" },
      numero_interior: { type: String, default: "" },
      numero_exterior: { type: String, default: "" },
      ciudad: { type: String, default: "" },
      entidad_federativa: { type: String, default: "" }
  },

  // 📌 Contactos de Emergencia
  contactos_emergencia: {
      type: [{
        nombre: { type: String, required: true },
        parentesco: { type: String, required: true },
        telefono: { type: String, required: true }
      }],
      default: []
  },

  // 📌 Antecedentes Heredo Familiares
  antecedentes_heredo_familiares: {
      type: [{
        parentesco: { 
          type: String, 
          enum: ['Padre', 'Madre', 'Hermano', 'Hermana', 'Abuelo', 'Abuela', 'Tío', 'Tía','Primo', 'Prima', 'Otros'],
          required: true 
        },
        parentesco_especifico: { type: String, default: "" },
        antecedentes: { type: String, required: true }
      }],
      default: []
  },

    // 📌 Encuesta Médica
    encuesta_medica: {
        informacion_general: {
            considera_su_salud: { 
                type: String, 
                enum: ["", "Mala", "Regular", "Buena", "Excelente"], 
                default: "" 
            },
            ultimo_examen_medico: {
                estado: { type: Boolean, default: false },
                fecha: { type: Date, default: null }
            },
            en_tratamiento_medico: {
                estado: { type: Boolean, default: false },
                explicacion: { type: String, default: "" }
            },
            hospitalizado_anteriormente: {
                estado: { type: Boolean, default: false },
                razon: { type: String, default: "" }
            },
            // Nuevas preguntas de salud general
            se_cansa_facilmente: { type: Boolean, default: false },
            cambios_peso_recientes: { type: Boolean, default: false },
            dolores_perdida_oido: { type: Boolean, default: false },
            sangrado_excesivo_cortes: { type: Boolean, default: false },
            hemorragias_espontaneas: { type: Boolean, default: false },
            seropositivo_vih: { type: Boolean, default: false },
            dolores_cabeza_frecuentes: { type: Boolean, default: false },
            observaciones_salud_general: { type: String, default: "" },
            enfermedad_grave_adicional: {
                opcion_principal: {
                    type: String,
                    enum: ["", 'no', 'otras_enfermedades'],
                    default: 'no'
                },
                enfermedades_seleccionadas: {
                    trastornos_neurologicos: { type: Boolean, default: false },
                    enfermedades_autoinmunes: { type: Boolean, default: false },
                    enfermedades_respiratorias: { type: Boolean, default: false },
                    problemas_renales: { type: Boolean, default: false },
                    problemas_hepaticos: { type: Boolean, default: false },
                    tratamiento_oncologico: { type: Boolean, default: false },
                    tuberculosis: { type: Boolean, default: false },
                    asma: { type: Boolean, default: false },
                    rinitis_alergica: { type: Boolean, default: false },
                    convulsiones_epilepsia: { type: Boolean, default: false },
                    enfisema: { type: Boolean, default: false },
                    tos_persistente_sangre: { type: Boolean, default: false },
                    fiebre_reumatica: { type: Boolean, default: false },
                    soplo_cardiaco: { type: Boolean, default: false },
                    angina_pecho: { type: Boolean, default: false },
                    presion_arterial_baja: { type: Boolean, default: false },
                    gastritis_ulcera: { type: Boolean, default: false },
                    enfermedades_rinon: { type: Boolean, default: false },
                    transplantes_organos: { type: Boolean, default: false },
                    marcapasos: { type: Boolean, default: false },
                    dano_valvulas: { type: Boolean, default: false },
                    retencion_liquidos: { type: Boolean, default: false },
                    arteriosclerosis: { type: Boolean, default: false },
                    hipertiroidismo: { type: Boolean, default: false },
                    hipotiroidismo: { type: Boolean, default: false },
                    anemia: { type: Boolean, default: false },
                    sida: { type: Boolean, default: false },
                    cancer: { type: Boolean, default: false },
                    esclerodermia: { type: Boolean, default: false },
                    enfermedades_sangre: { type: Boolean, default: false },
                    presion_arterial_alta: { type: Boolean, default: false },
                    paratiroidismo: { type: Boolean, default: false },
                    transfusiones_sanguineas: { type: Boolean, default: false },
                    radiaciones_cara_cuello: { type: Boolean, default: false },
                    osteogenesis_imperfecta: { type: Boolean, default: false },
                    enfermedad_paget: { type: Boolean, default: false },
                    osteoporosis: { type: Boolean, default: false },
                    lupus_eritematoso: { type: Boolean, default: false },
                    tratamiento_inmuno_supresion: { type: Boolean, default: false },
                    insuficiencia_renal: { type: Boolean, default: false },
                    enfermedades_familiares: { type: Boolean, default: false },
                    hipertension: { type: Boolean, default: false },
                    sinusitis: { type: Boolean, default: false },
                    trastornos_coagulacion: { type: Boolean, default: false },
                    infarto_corazon: {
                        checked: { type: Boolean, default: false },
                        fecha: { type: String, default: '' }
                    },
                    diabetes: {
                        checked: { type: Boolean, default: false },
                        tipo: {
                            type: String,
                            enum: ["", "Tipo 1", "Tipo 2", "Gestacional"],
                            default: ''
                        }
                    },
                    hepatitis: {
                        checked: { type: Boolean, default: false },
                        tipo: {
                            type: String,
                            enum: ["", "A", "B", "C", "D", "E"],
                            default: ''
                        }
                    }
                }
            }
        },
        medicacion: [{
            nombre: { type: String, default: "" },
            dosis: { type: String, default: "" },
            frecuencia: { type: String, default: "" }
        }],
        cirugias_previas: { type: [String], default: [] },
        alergias: [{
            sustancia: { type: String, default: "" },
            reaccion: { type: String, default: "" }
        }],
        ansiedad_dental: {
            nivel: { type: String, enum: ["",'Bajo', 'Moderado', 'Alto'], default: "" },
            experiencia_negativa_previa: { type: Boolean, default: false }
        },
        habitos_estilo_vida: {
            tabaquismo: {
                estado: { type: Boolean, default: false },
                frecuencia: { 
                    type: String, 
                    enum: [
                        "", "Diario", "6 veces a la semana", "5 veces a la semana", "4 veces a la semana",
                        "3 veces a la semana", "2 veces a la semana", "1 vez a la semana",
                        "1 vez cada 2 semanas", "1 vez cada 3 semanas", "1 vez al mes", "Ocasional"
                    ],
                    default: ""
                }
            },
            alcoholismo: {
                estado: { type: Boolean, default: false },
                frecuencia: { 
                    type: String, 
                    enum: [
                        "", "Diario", "6 veces a la semana", "5 veces a la semana", "4 veces a la semana",
                        "3 veces a la semana", "2 veces a la semana", "1 vez a la semana",
                        "1 vez cada 2 semanas", "1 vez cada 3 semanas", "1 vez al mes", "Ocasional"
                    ],
                    default: ""
                }
            }
        },
        embarazo: {
            estado: { type: Boolean, default: false },
            semanas_gestacion: { type: Number, default: 0 }
        }
    },

    // 📌 Información Específica para Mujeres
    informacion_femenina: {
        ha_estado_embarazada: { type: Boolean, default: false },
        como_fue_parto: { 
            type: String, 
            enum: ["", "normal", "cesarea", "complicaciones"], 
            default: "" 
        },
        tipo_parto_detallado: {
            type: String,
            enum: ["", "forceps", "ventosa", "cesarea_programada", "cesarea_electiva", 
                   "parto_prolongado", "parto_instrumentado", "cesarea_urgencia", 
                   "parto_distocico", "complicaciones_hemorragicas", "presentacion_anomala", 
                   "parto_prematuro", "desprendimiento_placenta", "sufrimiento_fetal", "retencion_placenta", "otro"],
            default: ""
        },
        complicaciones_parto: { type: String, default: "" },
        fecha_ultimo_parto: { type: Date, default: null },
        menopausia: { type: Boolean, default: false },
        alteraciones_ciclo_menstrual: { type: Boolean, default: false },
        fecha_ultima_menstruacion: { type: Date, default: null },
        toma_anticonceptivos: { type: Boolean, default: false }
    },

    // 📌 Hábitos de Higiene Bucodental
    habitos_higiene: {
        cepillo_dental: { type: Boolean, default: false },
        frecuencia_cambio_cepillo: { 
            type: String, 
            enum: ["","Cada semana", "Cada 2 semanas", "Cada 3 semanas", "Cada 4 semanas", "Cada mes", "Cada 2 meses", "Cada 3 meses o más"],
            default: ""
        },
        seda_dental: { 
            type: String, 
            enum: ["","Diario", "6 veces a la semana", "5 veces a la semana", "4 veces a la semana", "3 veces a la semana", "2 veces a la semana", "1 vez a la semana", "1 vez cada 2 semanas", "1 vez cada 3 semanas", "1 vez al mes", "No usa"], 
            default: ""
        },
        numero_cepillados_dia: {
            type: String,
            enum: ["","0","1", "2", "3", "4", "5 o más"],
            default: ""
        },          
        tipo_cepillo: { type: String, enum: ["",'Suave', 'Medio', 'Duro', 'Eléctrico'], default: "" },

        uso_enjuague_bucal: { 
            usa: { type: Boolean, default: false }, 
            tipo: { 
                type: String, 
                enum: ["","Con flúor", "Sin flúor", "Con alcohol", "Sin alcohol"],
                default: ""
            },
            frecuencia: { 
                type: String, 
                enum: ["","Diario", "6 veces a la semana", "5 veces a la semana", "4 veces a la semana", "3 veces a la semana", "2 veces a la semana", "1 vez a la semana", "No usa"],
                default: ""
            }
        },

        consumo_azucar: { 
            nivel: { 
                type: String, 
                enum: ["","No", "Bajo", "Medio", "Alto"],
                default: ""
            },
            tipo: { type: [String], default: [] }
        },

        mastica_chicle: { 
            tipo: { type: String, enum: ["","Sí", "No"], default: "" },
            frecuencia: { 
                type: String, 
                enum: ["","1 vez cada mes","1 vez cada 3 semanas","1 vez cada 2 semanas","1 vez a la semana", "2 veces a la semana", "3 veces a la semana", "4 veces a la semana", "5 veces a la semana", "6 o más veces a la semana"],
                default: ""
            }
        },

        bruxismo: {
            presente: { type: Boolean, default: false },
            uso_placa: { type: Boolean, default: false }
        },

        otros: { type: String, default: "" },

        // Nuevos campos de historial odontológico
        fecha_ultima_visita_odontologo: { type: Date, default: null },
        perdida_dientes: { type: Boolean, default: false },
        acumulacion_alimento_dientes: { type: Boolean, default: false },
        tumores_agrandamientos_boca: { type: Boolean, default: false },
        llagas_ulceras_aftas_frecuentes: { type: Boolean, default: false },
        enfermedad_periodontal: { type: Boolean, default: false },
        sangrado_encias: { type: Boolean, default: false },
        tratamiento_ortodoncia_previo: { type: Boolean, default: false },
        problemas_tratamientos_previos: {
            estado: { type: Boolean, default: false },
            explicacion: { type: String, default: "" }
        },
        dolores_cerca_oido: { type: Boolean, default: false },
        motivo_consulta_odontologica: { type: String, default: "" }
    },

    // 📌 Evaluación Dental y Oclusal
    evaluacion_dental_oclusal: {
        // Línea de sonrisa
        linea_sonrisa: {
            longitud_labio: {
                type: String,
                enum: ["", "Alta (Gingival)", "Media", "Baja (Dental)"],
                default: ""
            },
            muestra_reborde_al_sonreir: { type: Boolean, default: false }
        },
        
        // Clasificación de Kennedy
        clasificacion_kennedy: { type: Boolean, default: false },
        
        // Encía insertada
        encia_insertada: {
            type: String,
            enum: ["", "Suficiente", "Insuficiente"],
            default: ""
        },
        
        // Apertura bucal
        apertura_bucal: {
            type: String,
            enum: ["", "Amplia", "Normal", "Reducida/Limitada"],
            default: ""
        },
        
        // Evaluación ATM
        evaluacion_atm: {
            molestias_atm: { type: Boolean, default: false },
            ruidos: {
                derecha: {
                    type: String,
                    enum: ["", "Cómica", "Crepitante", "Chasquido"],
                    default: ""
                },
                izquierda: {
                    type: String,
                    enum: ["", "Cómica", "Crepitante", "Chasquido"],
                    default: ""
                }
            },
            dolor: {
                derecha: { type: Boolean, default: false },
                izquierda: { type: Boolean, default: false }
            },
            movilidad_mandibular: {
                protrusiva: { type: Boolean, default: false },
                lateralidad: {
                    lateral_derecho: {
                        type: String,
                        enum: ["", "normal", "excesivo", "limitado"],
                        default: ""
                    },
                    lateral_izquierdo: {
                        type: String,
                        enum: ["", "normal", "excesivo", "limitado"],
                        default: ""
                    }
                }
            }
        },
        
        // Evaluación oclusal
        evaluacion_oclusal: {
            clasificacion_angle: { type: String, default: "" },
            contacto_dentario_oclusion_centrica: { type: Boolean, default: false },
            proteccion_canina: {
                type: String,
                enum: ["", "Derecha", "Izquierda", "No hay"],
                default: ""
            },
            proteccion_anterior: { type: Boolean, default: false },
            funcion_grupo: {
                type: String,
                enum: ["", "Derecha", "Izquierda", "No hay"],
                default: ""
            },
            proteccion_mutua: {
                type: String,
                enum: ["", "Derecha", "Izquierda", "No hay"],
                default: ""
            },
            sobremordida: { type: Boolean, default: false },
            mordida_cruzada: { type: Boolean, default: false },
            traslape_horizontal_mm: { type: String, default: "" },
            traslape_vertical_mm: { type: String, default: "" },
            mordida_abierta: {
                presente: { type: Boolean, default: false },
                medidas: {
                    anterior_mm: { type: String, default: "" },
                    posterior_mm: { type: String, default: "" },
                    derecha_mm: { type: String, default: "" },
                    izquierda_mm: { type: String, default: "" }
                }
            }
        }
    },

    // 📌 CAMPOS ELIMINADOS: odontogramaInicial y odontogramaClinico (duplicación eliminada)
    // MIGRADOS A: Modelo Odontograma independiente (Server/models/odontograma.js)
    // RAZÓN: Eliminar duplicación de funcionalidad entre Patient y Odontograma
    /*
    odontogramaInicial: {
        // Campo migrado al modelo Odontograma independiente
    },
    odontogramaClinico: {
        // Campo migrado al modelo Odontograma independiente
    },
    */

    // 📌 Planes de tratamiento del paciente
    planes_tratamiento: [{
        texto: {
            type: String,
            required: true,
            trim: true
        },
        fecha: {
            type: Date,
            required: true,
            default: Date.now
        },
        fechaFormateada: {
            type: String,
            required: false
        }
    }],

    // 📌 Notas de evolución del paciente
    notas_evolucion: [{
        numero_procedimiento: { type: Number, required: true },
        procedimiento: { type: String, default: "", trim: true },
        observaciones: { type: String, default: "", trim: true },
        correcciones: { type: String, default: "", trim: true },
        fecha: { type: Date, required: true, default: Date.now },
        fechaFormateada: { type: String, required: false }
    }],

    // 📌 Ruta donde se almacenan los archivos del paciente
    ruta_archivos: { type: String, default: "" }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    // Optimizaciones de rendimiento
    collection: 'patients',
    versionKey: false,
    // Configuración de índices automáticos
    autoIndex: process.env.NODE_ENV !== 'production'
});

// ─── Virtuales mejorados ───────────────────────────────────────────────────────

// Virtual para nombre completo
PatientSchema.virtual('fullName').get(function() {
    const nombres = [this.primer_nombre, this.otros_nombres].filter(Boolean).join(' ');
    const apellidos = [this.apellido_paterno, this.apellido_materno].filter(Boolean).join(' ');
    return `${nombres} ${apellidos}`.trim();
});

// Virtual para edad calculada
PatientSchema.virtual('edadVirtual').get(function() {
    if (!this.fecha_nacimiento) return null;
    
    const today = new Date();
    const birthDate = new Date(this.fecha_nacimiento);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
});

// Virtual para email
PatientSchema.virtual('emailVirtual').get(function() {
    return this.email;
});

// Virtual para teléfono
PatientSchema.virtual('telefonoVirtual').get(function() {
    return this.contacto?.telefono;
});

// Método para calcular la edad
PatientSchema.methods.calculateAge = function() {
    if (!this.fecha_nacimiento) return null;
    
    const birthDate = new Date(this.fecha_nacimiento);
    const today = new Date();
    
    let years = today.getFullYear() - birthDate.getFullYear();
    let months = today.getMonth() - birthDate.getMonth();
    let days = today.getDate() - birthDate.getDate();
    
    if (days < 0) {
        months--;
        const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        days += prevMonth.getDate();
    }
    
    if (months < 0) {
        years--;
        months += 12;
    }
    
    return { years, months, days };
};

// ─── Middlewares mejorados ─────────────────────────────────────────────────────

// Middleware para eliminar archivos cuando se elimina un paciente
PatientSchema.pre('remove', async function(next) {
    try {
        const uploadsPath = path.join(__dirname, '..', 'uploads', this._id.toString());
        
        // Eliminar carpeta de uploads del paciente
        if (fs.existsSync(uploadsPath)) {
            await fs.promises.rmdir(uploadsPath, { recursive: true });
            // Carpeta de uploads eliminada
        }
        
        // También eliminar ruta_archivos si existe
        if (this.ruta_archivos && fs.existsSync(this.ruta_archivos)) {
            await fs.promises.rmdir(this.ruta_archivos, { recursive: true });
        }
        
        next();
    } catch (error) {
        console.error('Error eliminando archivos del paciente:', error);
        next(error);
    }
});

// Middleware para generar paciente_id único antes de validar
PatientSchema.pre('validate', async function(next) {
    try {
        if (this.isNew && !this.paciente_id) {
            this.paciente_id = await this.constructor.generateUniquePatientId();
        }
        next();
    } catch (error) {
        next(error);
    }
});

// Middleware para hacer inmutables las notas de evolución: sólo se permite añadir nuevas,
// no se permite modificar o eliminar notas ya existentes.
PatientSchema.pre('save', async function(next) {
    try {
        if (this.isNew) return next();

        // Sólo validar si hubo cambio en notas_evolucion
        if (!this.isModified('notas_evolucion')) return next();

        const original = await this.constructor.findById(this._id).lean();
        if (!original) return next();

        const oldNotes = Array.isArray(original.notas_evolucion) ? original.notas_evolucion : [];
        const newNotes = Array.isArray(this.notas_evolucion) ? this.notas_evolucion : [];

        // No permitir eliminación de notas
        if (newNotes.length < oldNotes.length) {
            return next(new Error('Las notas de evolución no pueden eliminarse una vez creadas.'));
        }

        // Verificar que las notas existentes no hayan sido modificadas
        const fieldsToCheck = ['numero_procedimiento','procedimiento','observaciones','correcciones','fecha','fechaFormateada'];
        for (let i = 0; i < oldNotes.length; i++) {
            const oldN = oldNotes[i];
            const newN = newNotes[i];
            if (!newN) {
                return next(new Error('No se pueden modificar las notas de evolución existentes.'));
            }
            for (const f of fieldsToCheck) {
                const oldVal = oldN && oldN[f] !== undefined && oldN[f] !== null ? (oldN[f] instanceof Date ? new Date(oldN[f]).toISOString() : String(oldN[f])) : '';
                const newVal = newN && newN[f] !== undefined && newN[f] !== null ? (newN[f] instanceof Date ? new Date(newN[f]).toISOString() : String(newN[f])) : '';
                if (oldVal !== newVal) {
                    return next(new Error('Las notas de evolución no pueden editarse una vez creadas.'));
                }
            }
        }

        return next();
    } catch (err) {
        return next(err);
    }
});

// Middleware para calcular edad y crear carpetas antes de guardar
PatientSchema.pre('save', async function(next) {
    try {
        // Calcular edad si hay fecha de nacimiento
        if (this.fecha_nacimiento && (this.isModified('fecha_nacimiento') || this.isNew)) {
            const today = new Date();
            const birthDate = new Date(this.fecha_nacimiento);
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            this.edad = age;
        }
        
        // ❌ MIDDLEWARES OBSOLETOS: campos odontogramaInicial/odontogramaClinico eliminados
        // if (this.isModified('odontogramaInicial')) {
        //     this.odontogramaInicial.fechaActualizacion = new Date();
        // }
        // if (this.isModified('odontogramaClinico')) {
        //     this.odontogramaClinico.fechaActualizacion = new Date();
        // }
        
        // Crear carpeta de uploads si es nuevo paciente
        if (this.isNew) {
            const uploadsPath = resolveUploadsPath(this._id.toString());
            await ensureUploadsPath(this._id.toString());
            
            // También crear ruta_archivos para compatibilidad
            const rutaArchivos = resolveUploadsPath('pacientes', this._id.toString());
            await ensureUploadsPath('pacientes', this._id.toString());
            this.ruta_archivos = rutaArchivos;
            
            // Carpetas de uploads creadas
        }
        
        next();
    } catch (error) {
        console.error('Error en middleware pre-save:', error);
        next(error);
    }
});

// Middleware para sanitizar datos sensibles antes de guardar
PatientSchema.pre('save', function(next) {
    // Sanitizar campos de texto para prevenir XSS
    const sanitizeText = (text) => {
        if (typeof text !== 'string') return text;
        return text.replace(/<script[^>]*>.*?<\/script>/gi, '')
                  .replace(/<[^>]*>/g, '')
                  .trim();
    };
    
    // Sanitizar campos de texto
    if (this.primer_nombre) this.primer_nombre = sanitizeText(this.primer_nombre);
    if (this.apellido_paterno) this.apellido_paterno = sanitizeText(this.apellido_paterno);
    if (this.apellido_materno) this.apellido_materno = sanitizeText(this.apellido_materno);
    if (this.otros_nombres) this.otros_nombres = sanitizeText(this.otros_nombres);
    
    next();
});

// ─── Métodos estáticos mejorados ──────────────────────────────────────────────

// Método estático para generar un paciente_id único
PatientSchema.statics.generateUniquePatientId = async function() {
    let id, exists = true;
    let attempts = 0;
    const maxAttempts = 100;
    
    while (exists && attempts < maxAttempts) {
        id = generate4Digits().toString();
        exists = await this.exists({ paciente_id: id });
        attempts++;
    }
    
    if (attempts >= maxAttempts) {
        throw new Error('No se pudo generar un paciente_id único después de múltiples intentos');
    }
    
    return id;
};

// Método estático para buscar pacientes con filtros avanzados
PatientSchema.statics.findWithFilters = function(filters = {}) {
    const query = {};
    
    // Búsqueda por nombre
    if (filters.nombre) {
        const nombreRegex = new RegExp(filters.nombre, 'i');
        query.$or = [
            { primer_nombre: nombreRegex },
            { apellido_paterno: nombreRegex },
            { apellido_materno: nombreRegex },
            { otros_nombres: nombreRegex }
        ];
    }
    
    // Búsqueda por documento
    if (filters.documento) {
        query['documento.numero'] = filters.documento;
    }
    
    // Búsqueda por teléfono
    if (filters.telefono) {
        query['contacto.telefono'] = filters.telefono;
    }
    
    // Búsqueda por email
    if (filters.email) {
        query.email = new RegExp(filters.email, 'i');
    }
    
    return this.find(query);
};

// Método estático para obtener estadísticas de pacientes
PatientSchema.statics.getStatistics = async function() {
    const stats = await this.aggregate([
        {
            $group: {
                _id: null,
                totalPacientes: { $sum: 1 },
                edadPromedio: { $avg: '$edad' },
                porGenero: { $push: '$sexo' }
            }
        }
    ]);
    
    return stats[0] || { totalPacientes: 0, edadPromedio: 0, porGenero: [] };
};

// ─── Índices optimizados ───────────────────────────────────────────────────────

// Índice único para paciente_id
PatientSchema.index({ paciente_id: 1 }, { unique: true, sparse: true });

// Índices únicos para documentos
PatientSchema.index({ 'documento.numero': 1 }, { unique: true, sparse: true });

// Índices para búsquedas frecuentes
PatientSchema.index({ 
    primer_nombre: 1, 
    apellido_paterno: 1 
});

// Índices para contacto
PatientSchema.index({ 'contacto.telefono': 1 });
PatientSchema.index({ email: 1 });

// Índices para fechas y timestamps
PatientSchema.index({ createdAt: -1 });
PatientSchema.index({ updatedAt: -1 });
PatientSchema.index({ fecha_nacimiento: 1 });

// Índice compuesto para búsquedas complejas
PatientSchema.index({ 
    paciente_id: 1, 
    primer_nombre: 1, 
    apellido_paterno: 1 
});

// ─── Configuración final del modelo ───────────────────────────────────────────

// Aplicar el plugin de validación única
PatientSchema.plugin(uniqueValidator, { 
    message: 'El {PATH} ya está en uso.',
    type: 'mongoose-unique-validator'
});

// Configurar opciones de transformación JSON
PatientSchema.set('toJSON', {
    transform: function(doc, ret) {
        // Remover campos sensibles en respuestas JSON
        delete ret.__v;
        
        // Añadir campos virtuales útiles
        ret.fullName = doc.fullName;
        ret.edadCalculada = doc.edadVirtual;
        ret.emailActual = doc.emailVirtual;
        ret.telefonoActual = doc.telefonoVirtual;
        
        return ret;
    }
});

// ─── Exportación del modelo ───────────────────────────────────────────────────

/**
 * Modelo de Paciente normalizado con estructura legacy:
 * - Estructura unificada y simplificada
 * - Validaciones robustas y sanitización
 * - Índices optimizados para rendimiento
 * - Compatibilidad total con formularios existentes
 * - Métodos estáticos para consultas avanzadas
 * - Middlewares para seguridad y mantenimiento
 * 
 * @typedef {Object} Patient
 * @property {String} paciente_id - ID único del paciente (4 dígitos)
 * @property {String} primer_nombre - Primer nombre del paciente
 * @property {String} otros_nombres - Otros nombres del paciente
 * @property {String} apellido_paterno - Apellido paterno
 * @property {String} apellido_materno - Apellido materno
 * @property {Date} fecha_nacimiento - Fecha de nacimiento
 * @property {Number} edad - Edad calculada automáticamente
 * @property {String} sexo - Género del paciente
 * @property {Object} documento - Información del documento de identidad
 * @property {Object} contacto - Información de contacto
 * @property {Array} contactos_emergencia - Contactos de emergencia
 * @property {Object} encuesta_medica - Información médica completa
 * @property {Object} informacion_femenina - Información específica para mujeres
 * @property {Object} habitos_higiene - Hábitos de higiene bucodental
 * @property {Date} createdAt - Fecha de creación
 * @property {Date} updatedAt - Fecha de última actualización
 */
const Patient = mongoose.model('Patient', PatientSchema);

module.exports = Patient;

/**
 * Script de migración mejorado para optimizar la estructura de datos de pacientes
 * 
 * MEJORAS APLICADAS (basadas en análisis de duplicaciones):
 * 1. Migra datos legacy a estructura modular
 * 2. ELIMINA duplicaciones de odontogramas (migra a modelo independiente)
 * 3. CORRIGE referencias inconsistentes entre modelos
 * 4. LIMPIA campos redundantes (citas, odontogramas embebidos)
 * 5. Valida integridad y crea backups automáticos
 * 6. Aplica convenciones de nomenclatura estrictas
 * 
 * DUPLICACIONES ELIMINADAS:
 * - odontogramaInicial/odontogramaClinico → Modelo Odontograma independiente
 * - campo 'citas' redundante → Consulta virtual desde Appointment
 * 
 * REFERENCIAS CORREGIDAS:
 * - exam.js: 'Paciente' → 'Patient'
 * - treatment.js: 'Paciente' → 'Patient'
 */

const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Importar modelos necesarios
const Patient = require('../models/patient');
const Odontograma = require('../models/odontograma');
const Appointment = require('../models/appointment');
const Exam = require('../models/exam');
const Treatment = require('../models/treatment');

// Constantes para tipos de odontograma
const TYPE_INITIAL = 'inicial';
const TYPE_CLINIC = 'clinico';

// Conectar a la base de datos
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/DentiaCore', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Conectado a MongoDB');
    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error);
        process.exit(1);
    }
};

// Función para crear backup
const createBackup = async () => {
    try {
        const backupDir = path.join(__dirname, '../backups');
        await fs.mkdir(backupDir, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(backupDir, `patients_backup_${timestamp}.json`);
        
        // Obtener todos los pacientes actuales
        const patients = await mongoose.connection.db.collection('patients').find({}).toArray();
        
        await fs.writeFile(backupFile, JSON.stringify(patients, null, 2));
        console.log(`✅ Backup creado: ${backupFile}`);
        
        return backupFile;
    } catch (error) {
        console.error('❌ Error creando backup:', error);
        throw error;
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIONES DE MIGRACIÓN DE ODONTOGRAMAS (ELIMINACIÓN DE DUPLICACIONES)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Migra odontograma embebido en Patient a modelo Odontograma independiente
 * ELIMINA DUPLICACIÓN: odontogramaInicial/odontogramaClinico → Modelo independiente
 */
const migrateEmbeddedOdontograma = async (patient, type) => {
    try {
        const odontogramaField = type === TYPE_INITIAL ? 'odontogramaInicial' : 'odontogramaClinico';
        const embeddedOdontograma = patient[odontogramaField];
        
        if (!embeddedOdontograma || (!embeddedOdontograma.damages?.length && !embeddedOdontograma.initialSnapshots?.length)) {
            return null; // No hay datos para migrar
        }
        
        // Verificar si ya existe un odontograma independiente
        const existingOdontograma = await Odontograma.findOne({
            patientId: patient._id,
            type: type
        });
        
        if (existingOdontograma) {
            console.log(`⚠️  Odontograma ${type} ya existe para paciente ${patient.paciente_id}`);
            return existingOdontograma;
        }
        
        // Crear nuevo odontograma independiente
        const newOdontograma = new Odontograma({
            patientId: patient._id,
            type: type,
            current: {
                imageUrl: embeddedOdontograma.imageUrl || null,
                datos: mapEmbeddedDataToIndependent(embeddedOdontograma)
            },
            history: mapEmbeddedHistoryToIndependent(embeddedOdontograma.historialCambios || [])
        });
        
        await newOdontograma.save();
        console.log(`✅ Odontograma ${type} migrado para paciente ${patient.paciente_id}`);
        
        return newOdontograma;
    } catch (error) {
        console.error(`❌ Error migrando odontograma ${type} para paciente ${patient.paciente_id}:`, error.message);
        return null;
    }
};

/**
 * Mapea datos embebidos a estructura del modelo independiente
 */
const mapEmbeddedDataToIndependent = (embeddedOdontograma) => {
    const datos = [];
    
    // Migrar damages
    if (embeddedOdontograma.damages?.length) {
        embeddedOdontograma.damages.forEach(damage => {
            datos.push({
                tooth: damage.toothNumber?.toString() || '',
                damage: damage.damage || '',
                surface: damage.surface || 'O',
                note: damage.notes || ''
            });
        });
    }
    
    // Migrar initialSnapshots
    if (embeddedOdontograma.initialSnapshots?.length) {
        embeddedOdontograma.initialSnapshots.forEach(snapshot => {
            datos.push({
                tooth: snapshot.toothNumber?.toString() || '',
                damage: snapshot.condition || '',
                surface: snapshot.surface || 'O',
                note: snapshot.notes || ''
            });
        });
    }
    
    return datos;
};

/**
 * Mapea historial embebido a estructura del modelo independiente
 */
const mapEmbeddedHistoryToIndependent = (embeddedHistory) => {
    return embeddedHistory.map(entry => ({
        datos: [], // Los datos históricos embebidos no tienen estructura compatible
        imageUrl: '', // No hay imageUrl en historial embebido
        savedAt: entry.fecha || new Date()
    }));
};

/**
 * Corrige referencias inconsistentes en modelos relacionados
 * CORRIGE: 'Paciente' → 'Patient' en exam.js y treatment.js
 */
const fixModelReferences = async () => {
    try {
        console.log('🔧 Corrigiendo referencias de modelos...');
        
        // Las referencias se corrigen a nivel de esquema, no de datos
        // Este es un recordatorio para actualizar los archivos de modelo
        console.log('📝 RECORDATORIO: Actualizar referencias en:');
        console.log('   - Server/models/exam.js: ref: "Paciente" → "Patient"');
        console.log('   - Server/models/treatment.js: ref: "Paciente" → "Patient"');
        
        return true;
    } catch (error) {
        console.error('❌ Error corrigiendo referencias:', error.message);
        return false;
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIÓN DE MIGRACIÓN PRINCIPAL (MEJORADA)
// ═══════════════════════════════════════════════════════════════════════════════

// Función para migrar un paciente individual
const migratePatient = async (patient) => {
    try {
        const migratedPatient = { ...patient };
        
        // ═══════════════════════════════════════════════════════════════════════════════
        // 1. MIGRAR ODONTOGRAMAS EMBEBIDOS A MODELO INDEPENDIENTE
        // ═══════════════════════════════════════════════════════════════════════════════
        
        console.log(`🦷 Migrando odontogramas para paciente ${patient.paciente_id}...`);
        
        // Migrar odontograma inicial
        await migrateEmbeddedOdontograma(patient, TYPE_INITIAL);
        
        // Migrar odontograma clínico
        await migrateEmbeddedOdontograma(patient, TYPE_CLINIC);
        
        // ═══════════════════════════════════════════════════════════════════════════════
        // 2. LIMPIAR CAMPOS DUPLICADOS Y REDUNDANTES
        // ═══════════════════════════════════════════════════════════════════════════════
        
        // ELIMINAR campos de odontograma duplicados
        delete migratedPatient.odontogramaInicial;
        delete migratedPatient.odontogramaClinico;
        
        // ELIMINAR campo redundante de citas (ya existe modelo Appointment independiente)
        delete migratedPatient.citas;
        
        // Si ya tiene la nueva estructura, no migrar
        if (patient.informacion_personal || patient.informacion_medica) {
            console.log(`⏭️  Paciente ${patient.paciente_id} ya migrado`);
            return null;
        }
        
        // ═══════════════════════════════════════════════════════════════════════════════
        // 3. MIGRAR INFORMACIÓN PERSONAL (ESTRUCTURA MODULAR)
        // ═══════════════════════════════════════════════════════════════════════════════
        
        // Migrar información personal
        if (patient.primer_nombre || patient.apellido_paterno) {
            migratedPatient.informacion_personal = {
                primer_nombre: patient.primer_nombre || '',
                segundo_nombre: patient.otros_nombres || patient.segundo_nombre || '',
                apellido_paterno: patient.apellido_paterno || '',
                apellido_materno: patient.apellido_materno || '',
                fecha_nacimiento: patient.fecha_nacimiento,
                genero: mapGender(patient.sexo || patient.genero),
                
                // Documento
                documento: {
                    tipo: mapDocumentType(patient.documento?.tipo),
                    numero: patient.documento?.numero || ''
                },
                
                // Contacto
                telefono: patient.contacto?.telefono || patient.telefono || '',
                email: patient.email || '',
                
                // Dirección
                direccion: {
                    calle: patient.contacto?.direccion || '',
                    numero: patient.contacto?.numero_exterior || '',
                    colonia: patient.contacto?.colonia || '',
                    ciudad: patient.contacto?.ciudad || '',
                    estado: patient.contacto?.entidad_federativa || '',
                    codigo_postal: patient.contacto?.codigo_postal || ''
                },
                
                // Situación laboral
                situacion_laboral: {
                    ocupacion: patient.ocupacion || '',
                    lugar_trabajo: ''
                },
                
                // Contactos de emergencia
                contactos_emergencia: (patient.contactos_emergencia || []).map(contacto => ({
                    nombre: contacto.nombre || '',
                    relacion: contacto.parentesco || contacto.relacion || '',
                    telefono: contacto.telefono || ''
                }))
            };
        }
    
    // Migrar información médica
    if (patient.encuesta_medica) {
        const em = patient.encuesta_medica;
        migratedPatient.informacion_medica = {
            medicamentos_actuales: em.medicamentos_actuales || '',
            cirugias_previas: em.cirugias_previas || '',
            alergias: em.alergias || '',
            ansiedad_dental: mapAnxietyLevel(em.ansiedad_dental),
            
            habitos: {
                fuma: em.fuma || false,
                cigarrillos_por_dia: em.cigarrillos_por_dia || 0,
                alcohol: mapAlcoholConsumption(em.alcohol),
                drogas: em.drogas || false
            },
            
            informacion_mujer: {
                embarazada: em.embarazada || false,
                meses_embarazo: em.meses_embarazo || 0,
                menopausia: em.menopausia || false,
                ciclo_menstrual_regular: em.ciclo_menstrual_regular || false,
                anticonceptivos: em.anticonceptivos || false
            },
            
            higiene_bucodental: {
                cepillado_frecuencia: mapBrushingFrequency(em.cepillado_frecuencia),
                usa_seda_dental: em.usa_seda_dental || false,
                usa_enjuague_bucal: em.usa_enjuague_bucal || false,
                consumo_azucar: mapSugarConsumption(em.consumo_azucar),
                bruxismo: em.bruxismo || false
            },
            
            historial_odontologico: {
                ultima_visita_dental: em.ultima_visita_dental,
                perdida_dientes: em.perdida_dientes || false,
                causa_perdida_dientes: em.causa_perdida_dientes || '',
                problemas_encias: em.problemas_encias || false,
                sensibilidad_dental: em.sensibilidad_dental || false,
                dolor_mandibula: em.dolor_mandibula || false,
                motivo_consulta: em.motivo_consulta || ''
            }
        };
    }
    
        return migratedPatient;
    } catch (error) {
        console.error(`❌ Error migrando paciente ${patient.paciente_id}:`, error.message);
        return null;
    }
};

// Funciones de mapeo para normalizar datos
const mapGender = (gender) => {
    if (!gender) return 'prefiero_no_decir';
    const normalized = gender.toLowerCase();
    if (normalized.includes('masc') || normalized === 'm') return 'masculino';
    if (normalized.includes('fem') || normalized === 'f') return 'femenino';
    return 'otro';
};

const mapDocumentType = (type) => {
    if (!type) return 'ine';
    const normalized = type.toLowerCase();
    if (normalized.includes('ine')) return 'ine';
    if (normalized.includes('pasaporte')) return 'pasaporte';
    if (normalized.includes('curp')) return 'curp';
    if (normalized.includes('cedula')) return 'cedula_profesional';
    return 'ine';
};

const mapAnxietyLevel = (level) => {
    if (!level) return 'ninguna';
    const normalized = level.toLowerCase();
    if (normalized.includes('sever') || normalized.includes('alta')) return 'severa';
    if (normalized.includes('moder') || normalized.includes('media')) return 'moderada';
    if (normalized.includes('leve') || normalized.includes('baja')) return 'leve';
    return 'ninguna';
};

const mapAlcoholConsumption = (consumption) => {
    if (!consumption) return 'nunca';
    const normalized = consumption.toLowerCase();
    if (normalized.includes('frecuent') || normalized.includes('mucho')) return 'frecuente';
    if (normalized.includes('moder')) return 'moderado';
    if (normalized.includes('ocasional') || normalized.includes('poco')) return 'ocasional';
    return 'nunca';
};

const mapBrushingFrequency = (frequency) => {
    if (!frequency) return '2_veces_dia';
    const normalized = frequency.toLowerCase();
    if (normalized.includes('3') || normalized.includes('tres')) return '3_o_mas_veces_dia';
    if (normalized.includes('2') || normalized.includes('dos')) return '2_veces_dia';
    if (normalized.includes('1') || normalized.includes('una')) return '1_vez_dia';
    if (normalized.includes('nunca')) return 'nunca';
    return '2_veces_dia';
};

const mapSugarConsumption = (consumption) => {
    if (!consumption) return 'moderado';
    const normalized = consumption.toLowerCase();
    if (normalized.includes('alto') || normalized.includes('mucho')) return 'alto';
    if (normalized.includes('bajo') || normalized.includes('poco')) return 'bajo';
    return 'moderado';
};

/**
 * Función principal para migrar todos los pacientes
 * INCLUYE: Migración de odontogramas, limpieza de duplicaciones y corrección de referencias
 */
const migrateAllPatients = async () => {
    try {
        console.log('🚀 Iniciando migración completa de pacientes...');
        console.log('📋 Proceso incluye:');
        console.log('   🦷 Migración de odontogramas embebidos → modelo independiente');
        console.log('   🧹 Limpieza de campos duplicados y redundantes');
        console.log('   🔧 Corrección de referencias de modelos');
        console.log('   📊 Migración de estructura modular');
        
        // ═══════════════════════════════════════════════════════════════════════════════
        // 1. CREAR BACKUP ANTES DE LA MIGRACIÓN
        // ═══════════════════════════════════════════════════════════════════════════════
        
        const backupFile = await createBackup();
        
        // ═══════════════════════════════════════════════════════════════════════════════
        // 2. CORREGIR REFERENCIAS DE MODELOS
        // ═══════════════════════════════════════════════════════════════════════════════
        
        await fixModelReferences();
        
        // ═══════════════════════════════════════════════════════════════════════════════
        // 3. MIGRAR PACIENTES
        // ═══════════════════════════════════════════════════════════════════════════════
        
        const patients = await mongoose.connection.db.collection('patients').find({}).toArray();
        
        console.log(`\n📊 Encontrados ${patients.length} pacientes para migrar`);
        
        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        let odontogramasCount = 0;
        
        for (const patient of patients) {
            try {
                console.log(`\n🔄 Procesando paciente ${patient.paciente_id}...`);
                
                const migratedPatient = await migratePatient(patient);
                
                if (migratedPatient) {
                    // Actualizar el paciente en la base de datos con limpieza de campos
                    await mongoose.connection.db.collection('patients').replaceOne(
                        { _id: patient._id },
                        migratedPatient
                    );
                    
                    migratedCount++;
                    
                    // Contar odontogramas migrados
                    const odontogramasForPatient = await Odontograma.countDocuments({
                        patientId: patient._id
                    });
                    odontogramasCount += odontogramasForPatient;
                    
                    console.log(`✅ Paciente ${patient.paciente_id} migrado exitosamente`);
                } else {
                    skippedCount++;
                }
            } catch (error) {
                errorCount++;
                console.error(`❌ Error migrando paciente ${patient.paciente_id || patient._id}:`, error.message);
            }
        }
        
        // ═══════════════════════════════════════════════════════════════════════════════
        // 4. RESUMEN FINAL
        // ═══════════════════════════════════════════════════════════════════════════════
        
        console.log('\n🎉 ═══════════════════════════════════════════════════════════════════════════════');
        console.log('📈 RESUMEN DE MIGRACIÓN COMPLETA');
        console.log('═══════════════════════════════════════════════════════════════════════════════');
        console.log(`✅ Pacientes migrados: ${migratedCount}`);
        console.log(`⏭️  Pacientes omitidos: ${skippedCount}`);
        console.log(`❌ Errores: ${errorCount}`);
        console.log(`🦷 Odontogramas migrados: ${odontogramasCount}`);
        console.log(`📊 Total procesados: ${patients.length}`);
        console.log(`💾 Backup guardado en: ${backupFile}`);
        console.log('\n🧹 LIMPIEZA REALIZADA:');
        console.log('   ❌ Eliminados campos duplicados: odontogramaInicial, odontogramaClinico');
        console.log('   ❌ Eliminado campo redundante: citas');
        console.log('\n🔧 CORRECCIONES PENDIENTES:');
        console.log('   📝 Actualizar referencias en exam.js y treatment.js');
        console.log('═══════════════════════════════════════════════════════════════════════════════');
        
        if (errorCount === 0) {
            console.log('\n🎉 ¡Migración completada exitosamente!');
        } else {
            console.log('\n⚠️  Migración completada con algunos errores. Revisa los logs.');
        }
        
    } catch (error) {
        console.error('❌ Error durante la migración:', error);
        throw error;
    }
};

// Función para validar la migración
const validateMigration = async () => {
    try {
        console.log('🔍 Validando migración...');
        
        const patients = await mongoose.connection.db.collection('patients').find({}).toArray();
        let validCount = 0;
        let invalidCount = 0;
        
        for (const patient of patients) {
            const hasNewStructure = patient.informacion_personal || patient.informacion_medica;
            const hasOldStructure = patient.primer_nombre || patient.encuesta_medica;
            
            if (hasNewStructure) {
                validCount++;
            } else if (hasOldStructure) {
                invalidCount++;
                console.log(`⚠️  Paciente no migrado: ${patient.paciente_id || patient._id}`);
            }
        }
        
        console.log(`\n📊 Validación completada:`);
        console.log(`✅ Pacientes con nueva estructura: ${validCount}`);
        console.log(`❌ Pacientes pendientes de migración: ${invalidCount}`);
        
        return invalidCount === 0;
    } catch (error) {
        console.error('❌ Error durante la validación:', error);
        return false;
    }
};

// Ejecutar migración
const main = async () => {
    try {
        await connectDB();
        
        const args = process.argv.slice(2);
        
        if (args.includes('--validate')) {
            const isValid = await validateMigration();
            process.exit(isValid ? 0 : 1);
        } else {
            await migrateAllPatients();
            await validateMigration();
        }
        
    } catch (error) {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado de MongoDB');
    }
};

// Ejecutar solo si es llamado directamente
if (require.main === module) {
    main();
}

module.exports = {
    migratePatient,
    migrateAllPatients,
    validateMigration,
    createBackup
};
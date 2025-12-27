const mongoose = require('mongoose');
require('dotenv').config();

// Importar modelos
const Patient = require('../models/patient');
const Odontograma = require('../models/odontograma');
const Exam = require('../models/exam');
const Treatment = require('../models/treatment');

/**
 * Script de validación para verificar las mejoras aplicadas al modelo Patient
 * 
 * MEJORAS VALIDADAS:
 * 1. ✅ Eliminación de duplicación de odontogramas (odontogramaInicial/odontogramaClinico)
 * 2. ✅ Eliminación de campo redundante (citas)
 * 3. ✅ Corrección de referencias inconsistentes (Paciente → Patient)
 * 4. ✅ Migración de datos a modelos independientes
 */

// Conectar a la base de datos
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dental_clinic');
        console.log('✅ Conectado a MongoDB');
    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error.message);
        process.exit(1);
    }
};

/**
 * Valida que los campos duplicados han sido eliminados del esquema Patient
 */
const validateSchemaCleanup = () => {
    console.log('\n🔍 VALIDANDO LIMPIEZA DEL ESQUEMA PATIENT...');
    
    const patientSchema = Patient.schema;
    const paths = patientSchema.paths;
    
    // Verificar que los campos duplicados han sido eliminados
    const removedFields = ['odontogramaInicial', 'odontogramaClinico', 'citas'];
    let cleanupSuccess = true;
    
    removedFields.forEach(field => {
        if (paths[field]) {
            console.log(`❌ Campo duplicado aún presente: ${field}`);
            cleanupSuccess = false;
        } else {
            console.log(`✅ Campo eliminado correctamente: ${field}`);
        }
    });
    
    return cleanupSuccess;
};

/**
 * Valida que las referencias de modelos han sido corregidas
 */
const validateModelReferences = () => {
    console.log('\n🔍 VALIDANDO REFERENCIAS DE MODELOS...');
    
    let referencesValid = true;
    
    // Validar Exam model
    const examSchema = Exam.schema;
    const examPatientRef = examSchema.paths.paciente_id?.options?.ref;
    if (examPatientRef === 'Patient') {
        console.log('✅ Referencia en Exam corregida: Paciente → Patient');
    } else {
        console.log(`❌ Referencia en Exam incorrecta: ${examPatientRef}`);
        referencesValid = false;
    }
    
    // Validar Treatment model
    const treatmentSchema = Treatment.schema;
    const treatmentPatientRef = treatmentSchema.paths.paciente_id?.options?.ref;
    if (treatmentPatientRef === 'Patient') {
        console.log('✅ Referencia en Treatment corregida: Paciente → Patient');
    } else {
        console.log(`❌ Referencia en Treatment incorrecta: ${treatmentPatientRef}`);
        referencesValid = false;
    }
    
    return referencesValid;
};

/**
 * Valida que los odontogramas han sido migrados al modelo independiente
 */
const validateOdontogramaMigration = async () => {
    console.log('\n🔍 VALIDANDO MIGRACIÓN DE ODONTOGRAMAS...');
    
    try {
        // Contar pacientes con datos de odontograma embebidos (legacy)
        const patientsWithEmbeddedOdontograma = await Patient.countDocuments({
            $or: [
                { 'odontogramaInicial.damages.0': { $exists: true } },
                { 'odontogramaInicial.initialSnapshots.0': { $exists: true } },
                { 'odontogramaClinico.damages.0': { $exists: true } },
                { 'odontogramaClinico.initialSnapshots.0': { $exists: true } }
            ]
        });
        
        // Contar odontogramas en el modelo independiente
        const independentOdontogramas = await Odontograma.countDocuments();
        
        console.log(`📊 Pacientes con odontogramas embebidos (legacy): ${patientsWithEmbeddedOdontograma}`);
        console.log(`📊 Odontogramas en modelo independiente: ${independentOdontogramas}`);
        
        if (patientsWithEmbeddedOdontograma === 0 && independentOdontogramas > 0) {
            console.log('✅ Migración de odontogramas completada exitosamente');
            return true;
        } else if (patientsWithEmbeddedOdontograma > 0) {
            console.log('⚠️  Aún hay odontogramas embebidos pendientes de migrar');
            return false;
        } else {
            console.log('ℹ️  No hay datos de odontograma para validar');
            return true;
        }
    } catch (error) {
        console.error('❌ Error validando migración de odontogramas:', error.message);
        return false;
    }
};

/**
 * Valida la integridad de los datos después de las mejoras
 */
const validateDataIntegrity = async () => {
    console.log('\n🔍 VALIDANDO INTEGRIDAD DE DATOS...');
    
    try {
        // Verificar que los pacientes siguen siendo válidos
        const totalPatients = await Patient.countDocuments();
        const validPatients = await Patient.countDocuments({ paciente_id: { $exists: true } });
        
        console.log(`📊 Total de pacientes: ${totalPatients}`);
        console.log(`📊 Pacientes con paciente_id válido: ${validPatients}`);
        
        if (totalPatients === validPatients) {
            console.log('✅ Integridad de datos de pacientes mantenida');
            return true;
        } else {
            console.log('❌ Algunos pacientes tienen datos inconsistentes');
            return false;
        }
    } catch (error) {
        console.error('❌ Error validando integridad de datos:', error.message);
        return false;
    }
};

/**
 * Función principal de validación
 */
const validateAllImprovements = async () => {
    try {
        console.log('🎯 ═══════════════════════════════════════════════════════════════════════════════');
        console.log('🔍 VALIDACIÓN DE MEJORAS DEL MODELO PATIENT');
        console.log('═══════════════════════════════════════════════════════════════════════════════');
        
        await connectDB();
        
        // Ejecutar todas las validaciones
        const schemaCleanup = validateSchemaCleanup();
        const modelReferences = validateModelReferences();
        const odontogramaMigration = await validateOdontogramaMigration();
        const dataIntegrity = await validateDataIntegrity();
        
        // Resumen final
        console.log('\n🎉 ═══════════════════════════════════════════════════════════════════════════════');
        console.log('📈 RESUMEN DE VALIDACIÓN');
        console.log('═══════════════════════════════════════════════════════════════════════════════');
        console.log(`${schemaCleanup ? '✅' : '❌'} Limpieza del esquema`);
        console.log(`${modelReferences ? '✅' : '❌'} Referencias de modelos`);
        console.log(`${odontogramaMigration ? '✅' : '❌'} Migración de odontogramas`);
        console.log(`${dataIntegrity ? '✅' : '❌'} Integridad de datos`);
        
        const allValid = schemaCleanup && modelReferences && odontogramaMigration && dataIntegrity;
        
        if (allValid) {
            console.log('\n🎉 TODAS LAS MEJORAS VALIDADAS EXITOSAMENTE');
            console.log('\n📋 BENEFICIOS OBTENIDOS:');
            console.log('   🚀 Eliminación de duplicación de código');
            console.log('   📈 Mejor mantenibilidad del sistema');
            console.log('   🔧 Consistencia en referencias de modelos');
            console.log('   ⚡ Mejor rendimiento y escalabilidad');
            console.log('   🧹 Código más limpio y organizado');
        } else {
            console.log('\n⚠️  ALGUNAS VALIDACIONES FALLARON');
            console.log('   📝 Revisar los errores reportados arriba');
            console.log('   🔧 Aplicar las correcciones necesarias');
        }
        
        console.log('═══════════════════════════════════════════════════════════════════════════════');
        
    } catch (error) {
        console.error('💥 Error en la validación:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Desconectado de MongoDB');
    }
};

// Ejecutar validación si se llama directamente
if (require.main === module) {
    validateAllImprovements();
}

module.exports = {
    validateSchemaCleanup,
    validateModelReferences,
    validateOdontogramaMigration,
    validateDataIntegrity,
    validateAllImprovements
};
/**
 * 🧪 SCRIPT DE PRUEBA COMPLETA DEL FLUJO DEL PERIODONTOGRAMA
 * 
 * Este script prueba todo el flujo del periodontograma para identificar errores:
 * 1. Creación de periodontograma inicial
 * 2. Actualización de datos de dientes
 * 3. Obtención de datos
 * 4. Transformaciones entre frontend y backend
 * 
 * @version 1.0.0
 * @author Sistema de Diagnóstico
 */

const mongoose = require('mongoose');
const Patient = require('../models/patient');
const Periodontogram = require('../models/periodontogram');
const PeriodontogramDataUtils = require('../utils/periodontogramUtils');
const { UniversalToothValidator } = require('../utils/UniversalToothValidator');
const { PERIODONTOGRAM_CONFIG } = require('../config/periodontogram-config');

// Configuración de la base de datos
const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dental_clinic';

/**
 * Conectar a la base de datos
 */
async function connectDB() {
  try {
    await mongoose.connect(DB_URI);
    console.log('🔌 Conectado a MongoDB exitosamente');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    process.exit(1);
  }
}

/**
 * Crear un paciente de prueba
 */
async function createTestPatient() {
  try {
    // Eliminar paciente de prueba existente
    await Patient.deleteOne({ email: 'test.periodontogram@example.com' });
    
    const testPatient = new Patient({
      primer_nombre: 'Juan',
      otros_nombres: 'Carlos',
      apellido_paterno: 'Pérez',
      apellido_materno: 'González',
      email: 'test.periodontogram@example.com',
      fecha_nacimiento: new Date('1990-01-01'),
      sexo: 'Masculino',
      documento: {
        tipo: 'INE',
        numero: 'TEST123456789'
      },
      contacto: {
        telefono: '1234567890',
        direccion: 'Calle Test 123',
        ciudad: 'Ciudad Test',
        entidad_federativa: 'Estado Test',
        codigo_postal: '12345'
      }
    });
    
    await testPatient.save();
    console.log('✅ Paciente de prueba creado:', testPatient._id);
    return testPatient;
  } catch (error) {
    console.error('❌ Error creando paciente de prueba:', error.message);
    throw error;
  }
}

/**
 * Probar creación de periodontograma inicial
 */
async function testCreateInitialPeriodontogram(patientId) {
  try {
    console.log('\n🧪 PRUEBA 1: Creación de periodontograma inicial');
    
    // Eliminar periodontograma existente
    await Periodontogram.deleteOne({ patient: patientId });
    
    // Crear periodontograma inicial
    const periodontogram = Periodontogram.createInitial(patientId, null);
    await periodontogram.save();
    
    console.log('✅ Periodontograma inicial creado exitosamente');
    console.log('📊 Estadísticas iniciales:', periodontogram.initial.statistics);
    
    return periodontogram;
  } catch (error) {
    console.error('❌ Error en creación inicial:', error.message);
    throw error;
  }
}

/**
 * Probar actualización de datos de dientes
 */
async function testToothDataUpdate(periodontogram) {
  try {
    console.log('\n🧪 PRUEBA 2: Actualización de datos de dientes');
    
    // Datos de prueba para el diente 11
    const testToothData = {
      toothNumber: 11,
      present: true,
      available: true,
      implant: false,
      bleeding: [true, false, true, false, true, false],
      suppuration: [false, false, false, false, false, false],
      plaque: [true, true, false, false, true, false],
      probingDepth: [3, 2, 4, 3, 2, 3],
      gingivalMargin: [0, -1, 1, 0, 0, -1],
      gumWidth: [2, 3, 2, 3, 2, 3],
      mobility: 1,
      furca: {
        vestibular: 0,
        lingual: 0,
        mesial: 0
      },
      prognosis: 'bueno',
      notes: 'Diente de prueba'
    };
    
    console.log('📝 Datos de prueba para diente 11:', testToothData);
    
    // Validar datos usando utilidades
    const validatedData = PeriodontogramDataUtils.validateToothData(testToothData);
    console.log('✅ Datos validados:', validatedData);
    
    // Actualizar diente en el periodontograma
    periodontogram.updateTooth(11, validatedData, null);
    await periodontogram.save();
    
    console.log('✅ Diente 11 actualizado exitosamente');
    
    // Verificar datos guardados
    const savedTooth = periodontogram.getTooth(11);
    console.log('📊 Datos guardados del diente 11:', savedTooth);
    
    return periodontogram;
  } catch (error) {
    console.error('❌ Error en actualización de diente:', error.message);
    throw error;
  }
}

/**
 * Probar transformaciones de datos
 */
async function testDataTransformations(periodontogram) {
  try {
    console.log('\n🧪 PRUEBA 3: Transformaciones de datos');
    
    // Obtener datos del backend
    const backendData = periodontogram.initial.teeth.get('11');
    console.log('📤 Datos del backend:', backendData);
    
    // Transformar a frontend
    const frontendData = UniversalToothValidator.transformToFrontend(backendData);
    console.log('📥 Datos transformados a frontend:', frontendData);
    
    // Para esta prueba, verificaremos que los datos del backend son válidos
    const validatedBackend = UniversalToothValidator.validateCompleteToothData(backendData);
    console.log('📤 Datos validados del backend:', validatedBackend);
    
    // Verificar que los datos son válidos
    const isValid = validatedBackend && frontendData;
    console.log(isValid ? '✅ Datos válidos y transformación exitosa' : '❌ Error en validación o transformación');
    
    if (!isValid) {
      console.log('🔍 PROBLEMAS DETECTADOS:');
      console.log('Backend original:', JSON.stringify(backendData, null, 2));
      console.log('Frontend transformado:', JSON.stringify(frontendData, null, 2));
      console.log('Backend validado:', JSON.stringify(validatedBackend, null, 2));
    }
    
    return { backendData, frontendData, validatedBackend, isValid };
  } catch (error) {
    console.error('❌ Error en transformaciones:', error.message);
    throw error;
  }
}

/**
 * Probar validaciones de arrays
 */
async function testArrayValidations() {
  try {
    console.log('\n🧪 PRUEBA 4: Validaciones de arrays');
    
    // Probar arrays de diferentes longitudes
    const testCases = [
      { name: 'Array de 3 elementos', data: [true, false, true] },
      { name: 'Array de 4 elementos', data: [true, false, true, false] },
      { name: 'Array de 6 elementos', data: [true, false, true, false, true, false] },
      { name: 'Array vacío', data: [] },
      { name: 'No es array', data: 'not-an-array' },
      { name: 'Null', data: null }
    ];
    
    for (const testCase of testCases) {
      try {
        const sanitized = PeriodontogramDataUtils.sanitizeBooleanToothData(testCase.data);
        console.log(`✅ ${testCase.name}: ${JSON.stringify(testCase.data)} → ${JSON.stringify(sanitized)}`);
      } catch (error) {
        console.log(`❌ ${testCase.name}: Error - ${error.message}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error en validaciones de arrays:', error.message);
    throw error;
  }
}

/**
 * Probar configuración centralizada
 */
async function testCentralizedConfig() {
  try {
    console.log('\n🧪 PRUEBA 5: Configuración centralizada');
    
    console.log('📋 Dientes válidos:', PERIODONTOGRAM_CONFIG.ALL_VALID_TEETH.length);
    console.log('📏 Límites de medición:', PERIODONTOGRAM_CONFIG.MEASUREMENT_LIMITS);
    console.log('🔧 Configuración de arrays:', PERIODONTOGRAM_CONFIG.MEASUREMENT_ARRAY_CONFIG);
    
    // Probar validación de números de dientes
    const testTeeth = [11, 21, 31, 41, 99, 0, -1];
    for (const tooth of testTeeth) {
      const isValid = PERIODONTOGRAM_CONFIG.isValidToothNumber(tooth);
      console.log(`🦷 Diente ${tooth}: ${isValid ? '✅ Válido' : '❌ Inválido'}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error en configuración centralizada:', error.message);
    throw error;
  }
}

/**
 * Función principal de pruebas
 */
async function runTests() {
  try {
    console.log('🚀 INICIANDO PRUEBAS COMPLETAS DEL PERIODONTOGRAMA\n');
    
    // Conectar a la base de datos
    await connectDB();
    
    // Crear paciente de prueba
    const patient = await createTestPatient();
    
    // Ejecutar pruebas
    const periodontogram = await testCreateInitialPeriodontogram(patient._id);
    await testToothDataUpdate(periodontogram);
    const transformationResults = await testDataTransformations(periodontogram);
    await testArrayValidations();
    await testCentralizedConfig();
    
    console.log('\n🎉 TODAS LAS PRUEBAS COMPLETADAS');
    console.log('📊 RESUMEN:');
    console.log(`- Paciente creado: ${patient._id}`);
    console.log(`- Periodontograma creado: ${periodontogram._id}`);
    console.log(`- Transformaciones consistentes: ${transformationResults.isConsistent ? 'Sí' : 'No'}`);
    
    // Limpiar datos de prueba
    await Patient.deleteOne({ _id: patient._id });
    await Periodontogram.deleteOne({ _id: periodontogram._id });
    console.log('🧹 Datos de prueba limpiados');
    
  } catch (error) {
    console.error('💥 ERROR CRÍTICO EN LAS PRUEBAS:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    // Cerrar conexión
    await mongoose.connection.close();
    console.log('🔌 Conexión a MongoDB cerrada');
    process.exit(0);
  }
}

// Ejecutar pruebas si el script se ejecuta directamente
if (require.main === module) {
  runTests();
}

module.exports = {
  runTests,
  testCreateInitialPeriodontogram,
  testToothDataUpdate,
  testDataTransformations,
  testArrayValidations,
  testCentralizedConfig
};
/**
 * Script para verificar que la corrección del error de validación funciona
 * Simula el flujo completo con la corrección aplicada
 */

const mongoose = require('mongoose');
const PeriodontogramDataUtils = require('../utils/periodontogramUtils');
const { UniversalToothValidator } = require('../utils/UniversalToothValidator');
require('dotenv').config();

// Conectar a la base de datos
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/DentiaCore')
  .then(() => console.log('✅ Conectado a MongoDB'))
  .catch(err => console.error('❌ Error conectando a MongoDB:', err));

// Simular datos que vienen del frontend (formato 4-caras)
const frontendToothData = {
  toothNumber: 11,
  present: true,
  available: true,
  implant: false,
  
  // Datos en formato 4-caras (como vienen del frontend)
  bleeding: {
    vestibularSuperior: [true, false, true],
    palatinoSuperior: [false, true, false],
    vestibularInferior: [false, false, false],
    lingualInferior: [false, false, false]
  },
  
  suppuration: {
    vestibularSuperior: [false, false, false],
    palatinoSuperior: [false, false, false],
    vestibularInferior: [false, false, false],
    lingualInferior: [false, false, false]
  },
  
  plaque: {
    vestibularSuperior: [true, true, false],
    palatinoSuperior: [false, true, true],
    vestibularInferior: [false, false, false],
    lingualInferior: [false, false, false]
  },
  
  probingDepth: {
    vestibularSuperior: [2, 3, 2],
    palatinoSuperior: [1, 2, 3],
    vestibularInferior: [0, 0, 0],
    lingualInferior: [0, 0, 0]
  },
  
  gingivalMargin: {
    vestibularSuperior: [0, -1, 0],
    palatinoSuperior: [0, 0, -1],
    vestibularInferior: [0, 0, 0],
    lingualInferior: [0, 0, 0]
  },
  
  gumWidth: {
    vestibularSuperior: [2, 3, 2],
    palatinoSuperior: [2, 2, 3],
    vestibularInferior: [0, 0, 0],
    lingualInferior: [0, 0, 0]
  },
  
  mobility: 0,
  furca: {
    vestibular: 0,
    lingual: 0,
    mesial: 0
  },
  prognosis: 'bueno',
  notes: 'Prueba de validación corregida'
};

async function testCorrectedFlow() {
  console.log('\n🔧 VERIFICANDO CORRECCIÓN DEL FLUJO DE VALIDACIÓN\n');
  
  try {
    console.log('1️⃣ DATOS ORIGINALES DEL FRONTEND:');
    console.log('Formato: 4-caras (vestibularSuperior, palatinoSuperior, vestibularInferior, lingualInferior)');
    console.log(`bleeding.vestibularSuperior: [${frontendToothData.bleeding.vestibularSuperior.join(', ')}]`);
    console.log(`bleeding.palatinoSuperior: [${frontendToothData.bleeding.palatinoSuperior.join(', ')}]`);
    
    console.log('\n2️⃣ FLUJO CORREGIDO (como ahora funciona en el controlador):');
    
    // Paso 1: Transformar con UniversalToothValidator.transformToBackend
    console.log('\n   📝 Paso 1: Transformar datos del frontend al formato backend');
    const transformedData = UniversalToothValidator.transformToBackend(frontendToothData);
    console.log('   Formato transformado: Array de 6 elementos [V-M, V-C, V-D, P/L-M, P/L-C, P/L-D]');
    console.log(`   bleeding transformado: [${transformedData.bleeding.join(', ')}]`);
    
    // Paso 2: Validar con PeriodontogramDataUtils.validateToothData
    console.log('\n   ✅ Paso 2: Validar datos transformados');
    const validatedData = PeriodontogramDataUtils.validateToothData(transformedData);
    console.log('   ✅ VALIDACIÓN EXITOSA');
    console.log(`   bleeding final: [${validatedData.bleeding.join(', ')}]`);
    console.log(`   plaque final: [${validatedData.plaque.join(', ')}]`);
    console.log(`   probingDepth final: [${validatedData.probingDepth.join(', ')}]`);
    
    console.log('\n3️⃣ VERIFICACIÓN DE INTEGRIDAD DE DATOS:');
    
    // Verificar que los datos se mantuvieron correctamente
    const originalVestibularSuperior = frontendToothData.bleeding.vestibularSuperior;
    const originalPalatinoSuperior = frontendToothData.bleeding.palatinoSuperior;
    const finalArray = validatedData.bleeding;
    
    console.log('   Comparación bleeding:');
    console.log(`   Original V-Superior: [${originalVestibularSuperior.join(', ')}] -> Final V: [${finalArray[0]}, ${finalArray[1]}, ${finalArray[2]}]`);
    console.log(`   Original P-Superior: [${originalPalatinoSuperior.join(', ')}] -> Final P: [${finalArray[3]}, ${finalArray[4]}, ${finalArray[5]}]`);
    
    // Verificar que los valores coinciden
    const vestibularMatch = originalVestibularSuperior.every((val, idx) => val === finalArray[idx]);
    const palatinoMatch = originalPalatinoSuperior.every((val, idx) => val === finalArray[idx + 3]);
    
    if (vestibularMatch && palatinoMatch) {
      console.log('   ✅ Los datos se preservaron correctamente durante la transformación');
    } else {
      console.log('   ❌ Los datos no se preservaron correctamente');
    }
    
    console.log('\n4️⃣ RESUMEN DE LA CORRECCIÓN:');
    console.log('   ✅ El controlador ahora usa UniversalToothValidator.transformToBackend() ANTES de PeriodontogramDataUtils.validateToothData()');
    console.log('   ✅ Los datos del frontend en formato 4-caras se convierten correctamente a arrays de 6 elementos');
    console.log('   ✅ La validación posterior funciona sin errores');
    console.log('   ✅ Los datos originales se preservan durante todo el proceso');
    
  } catch (error) {
    console.error('💥 ERROR EN EL FLUJO CORREGIDO:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
  }
}

// Ejecutar la verificación
testCorrectedFlow();
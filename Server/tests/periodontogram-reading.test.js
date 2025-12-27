/**
 * Test para verificar que la función de lectura de periodontogramas
 * funciona correctamente con los datos de 3 elementos guardados
 */

const { readPeriodontogramJson, savePeriodontogramJson } = require('../utils/periodontogramData');
const { UniversalToothValidator } = require('../utils/UniversalToothValidator');
const fs = require('fs');
const path = require('path');

// Datos de prueba con estructura canónica (4 caras, 5 bloques)
const testPeriodontogramData = {
  patientId: 'TEST_PATIENT_READ',
  versionName: 'test-reading-v1',
  timestamp: new Date().toISOString(),
  statistics: {
    totalTeeth: 2,
    presentTeeth: 2,
    absentTeeth: 0,
    averageDepth: 2.5,
    bleedingPercentage: 33.3,
    plaquePercentage: 66.7
  },
  teeth: {
    '11': {
      absent: false,
      plaque: {
        vestibularSuperior: [1, 1, 0],
        palatinoSuperior: [0, 1, 0],
        vestibularInferior: [1, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      suppuration: {
        vestibularSuperior: [0, 0, 0],
        palatinoSuperior: [0, 0, 0],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      bleeding: {
        vestibularSuperior: [0, 1, 0],
        palatinoSuperior: [0, 0, 0],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      gingivalMargin: {
        vestibularSuperior: [0, -1, 0],
        palatinoSuperior: [0, 0, 0],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      probingDepth: {
        vestibularSuperior: [2, 3, 2],
        palatinoSuperior: [1, 2, 1],
        vestibularInferior: [2, 2, 2],
        lingualInferior: [1, 1, 1]
      }
    },
    '21': {
      absent: false,
      plaque: {
        vestibularSuperior: [1, 1, 1],
        palatinoSuperior: [0, 0, 1],
        vestibularInferior: [1, 1, 0],
        lingualInferior: [0, 0, 0]
      },
      suppuration: {
        vestibularSuperior: [0, 0, 0],
        palatinoSuperior: [0, 0, 0],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      bleeding: {
        vestibularSuperior: [1, 1, 0],
        palatinoSuperior: [0, 1, 0],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      gingivalMargin: {
        vestibularSuperior: [-1, -2, -1],
        palatinoSuperior: [0, -1, 0],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      probingDepth: {
        vestibularSuperior: [3, 4, 3],
        palatinoSuperior: [2, 3, 2],
        vestibularInferior: [3, 3, 3],
        lingualInferior: [2, 2, 2]
      }
    }
  }
};

async function runReadingTests() {
  console.log('🧪 Iniciando tests de lectura de periodontogramas...');
  
  try {
    // Test 1: Guardar datos de prueba
    console.log('\n📝 Test 1: Guardando datos de prueba...');
    const saveResult = await savePeriodontogramJson(
      testPeriodontogramData.patientId,
      testPeriodontogramData
    );
    console.log('✅ Datos guardados correctamente:', saveResult.filePath);
    
    // Test 2: Leer datos guardados
    console.log('\n📖 Test 2: Leyendo datos guardados...');
    const readResult = await readPeriodontogramJson(
      testPeriodontogramData.patientId,
      testPeriodontogramData.versionName
    );
    console.log('✅ Datos leídos correctamente');
    
    // Test 3: Verificar estructura de datos leídos
    console.log('\n🔍 Test 3: Verificando estructura de datos leídos...');
    
    // Verificar que los datos tienen la estructura correcta
    if (!readResult.teeth) {
      throw new Error('Los datos leídos no contienen la propiedad "teeth"');
    }
    
    // Verificar diente 11
    const tooth11 = readResult.teeth['11'];
    if (!tooth11) {
      throw new Error('Diente 11 no encontrado en los datos leídos');
    }
    
    // Verificar arrays de 3 elementos en probingDepth.vestibularSuperior
    const probingDepth11 = tooth11.probingDepth;
    if (!Array.isArray(probingDepth11.vestibularSuperior) || probingDepth11.vestibularSuperior.length !== 3) {
      throw new Error(`probingDepth.vestibularSuperior debe ser array de 3 elementos, recibido: ${JSON.stringify(probingDepth11 && probingDepth11.vestibularSuperior)}`);
    }
    
    console.log('✅ Estructura de arrays de 3 elementos verificada correctamente');
    
    // Test 4: Verificar valores específicos
    console.log('\n🎯 Test 4: Verificando valores específicos...');
    
    // Verificar valores de profundidad del diente 11 vestibularSuperior
    const expectedProfundidad = [2, 3, 2];
    const actualProfundidad = probingDepth11.vestibularSuperior;
    
    if (JSON.stringify(actualProfundidad) !== JSON.stringify(expectedProfundidad)) {
      throw new Error(`Profundidad no coincide. Esperado: ${JSON.stringify(expectedProfundidad)}, Actual: ${JSON.stringify(actualProfundidad)}`);
    }
    
    console.log('✅ Valores específicos verificados correctamente');
    
    // Test 5: Verificar compatibilidad con UniversalToothValidator
    console.log('\n🔧 Test 5: Verificando compatibilidad con UniversalToothValidator...');
    
    const validationResult = UniversalToothValidator.validatePeriodontogramStructure(readResult);
    if (!validationResult.isValid) {
      throw new Error(`Validación falló: ${validationResult.errors.join(', ')}`);
    }
    
    console.log('✅ Compatibilidad con UniversalToothValidator verificada');
    
    // Test 6: Verificar que se pueden leer múltiples dientes
    console.log('\n🦷 Test 6: Verificando lectura de múltiples dientes...');
    
    const tooth21 = readResult.teeth['21'];
    if (!tooth21) {
      throw new Error('Diente 21 no encontrado en los datos leídos');
    }
    
    // Verificar que el diente 21 también tiene arrays de 3 elementos
    const probingDepth21 = tooth21.probingDepth;
    if (!Array.isArray(probingDepth21.palatinoSuperior) || probingDepth21.palatinoSuperior.length !== 3) {
      throw new Error('Profundidad palatinoSuperior del diente 21 debe ser array de 3 elementos');
    }
    
    console.log('✅ Lectura de múltiples dientes verificada');
    
    // Test 7: Verificar metadatos
    console.log('\n📋 Test 7: Verificando metadatos...');
    
    if (readResult.patientId !== testPeriodontogramData.patientId) {
      throw new Error(`PatientId no coincide. Esperado: ${testPeriodontogramData.patientId}, Actual: ${readResult.patientId}`);
    }
    
    if (readResult.versionName !== testPeriodontogramData.versionName) {
      throw new Error(`Version no coincide. Esperado: ${testPeriodontogramData.versionName}, Actual: ${readResult.versionName}`);
    }
    
    console.log('✅ Metadatos verificados correctamente');
    
    console.log('\n🎉 TODOS LOS TESTS DE LECTURA PASARON EXITOSAMENTE');
    console.log('\n📊 Resumen:');
    console.log('- ✅ Guardado de datos con arrays de 3 elementos');
    console.log('- ✅ Lectura de datos guardados');
    console.log('- ✅ Verificación de estructura de arrays de 3 elementos');
    console.log('- ✅ Verificación de valores específicos');
    console.log('- ✅ Compatibilidad con UniversalToothValidator');
    console.log('- ✅ Lectura de múltiples dientes');
    console.log('- ✅ Verificación de metadatos');
    
  } catch (error) {
    console.error('❌ Error en tests de lectura:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    // Limpiar archivos de prueba
    try {
      const testDir = path.join(
        __dirname,
        '..',
        'uploads',
        'pacientes',
        testPeriodontogramData.patientId,
        'periodontograma'
      );
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
        console.log('\n🧹 Archivos de prueba limpiados');
      }
    } catch (cleanupError) {
      console.warn('⚠️ Error al limpiar archivos de prueba:', cleanupError.message);
    }
  }
}

// Ejecutar tests si el archivo se ejecuta directamente
if (require.main === module) {
  runReadingTests();
}

module.exports = { runReadingTests };
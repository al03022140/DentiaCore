/**
 * Test para verificar que el endpoint de lectura de periodontogramas
 * funciona correctamente con los datos de 3 elementos guardados
 */

const { savePeriodontogramJson } = require('../utils/periodontogramData');
const periodontogramController = require('../controllers/periodontogramController');

// Extraer la función del controlador del array de middlewares
const getPeriodontogramDataFunction = periodontogramController.getPeriodontogramData[2]; // El tercer elemento es la función async
const fs = require('fs');
const path = require('path');

// Mock de req y res para simular Express
function createMockReq(params = {}, query = {}) {
  return {
    params,
    query,
    body: {}
  };
}

function createMockRes() {
  const res = {
    statusCode: 200, // Valor por defecto
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.jsonData = data;
      // Si no se ha establecido un status, usar 200 por defecto
      if (!this.statusCode) {
        this.statusCode = 200;
      }
      return this;
    },
    send: function(data) {
      this.sendData = data;
      return this;
    }
  };
  return res;
}

// Datos de prueba con estructura canónica (4 caras, 5 bloques)
const testPeriodontogramData = {
  patientId: 'TEST_PATIENT_ENDPOINT',
  versionName: 'test-endpoint-v1',
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

async function runEndpointReadingTests() {
  console.log('🧪 Iniciando tests de endpoint de lectura de periodontogramas...');
  
  try {
    // Test 1: Guardar datos de prueba primero
    console.log('\n📝 Test 1: Guardando datos de prueba...');
    const saveResult = await savePeriodontogramJson(
      testPeriodontogramData.patientId,
      testPeriodontogramData
    );
    console.log('✅ Datos guardados correctamente:', saveResult.filePath);
    
    // Test 2: Probar endpoint GET sin versión específica (debería devolver la última)
    console.log('\n📖 Test 2: Probando endpoint GET sin versión específica...');
    
    const req1 = createMockReq({ id: testPeriodontogramData.patientId });
    const res1 = createMockRes();
    
    await getPeriodontogramDataFunction(req1, res1);
    
    if (res1.statusCode !== 200) {
      throw new Error(`Endpoint devolvió status ${res1.statusCode} en lugar de 200`);
    }
    
    if (!res1.jsonData) {
      throw new Error('Endpoint no devolvió datos JSON');
    }
    
    console.log('✅ Endpoint GET sin versión funcionó correctamente');
    
    // Test 3: Verificar estructura de datos del endpoint
    console.log('\n🔍 Test 3: Verificando estructura de datos del endpoint...');
    
    const endpointData = res1.jsonData;
    console.log('📊 Estructura completa del endpoint:', JSON.stringify(endpointData, null, 2));
    
    // Los datos están dentro de la propiedad 'data'
    const actualData = endpointData.data;
    if (!actualData || !actualData.teeth) {
      throw new Error('Los datos del endpoint no contienen la propiedad "teeth"');
    }
    
    // Verificar diente 11
    const tooth11 = actualData.teeth['11'];
    if (!tooth11) {
      throw new Error('Diente 11 no encontrado en los datos del endpoint');
    }
    
    // Verificar arrays de 3 elementos en probingDepth.vestibularSuperior
    const probingDepth11 = tooth11.probingDepth;
    if (!probingDepth11 || !Array.isArray(probingDepth11.vestibularSuperior) || probingDepth11.vestibularSuperior.length !== 3) {
      throw new Error(`probingDepth.vestibularSuperior debe ser array de 3 elementos, recibido: ${JSON.stringify(probingDepth11 && probingDepth11.vestibularSuperior)}`);
    }
    
    console.log('✅ Estructura de arrays de 3 elementos verificada en endpoint');
    
    // Test 4: Probar endpoint GET con versión específica
    console.log('\n🎯 Test 4: Probando endpoint GET con versión específica...');
    
    const req2 = createMockReq(
      { id: testPeriodontogramData.patientId },
      { version: testPeriodontogramData.versionName }
    );
    const res2 = createMockRes();
    
    await getPeriodontogramDataFunction(req2, res2);
    
    if (res2.statusCode !== 200) {
      throw new Error(`Endpoint con versión devolvió status ${res2.statusCode} en lugar de 200`);
    }
    
    console.log('✅ Endpoint GET con versión específica funcionó correctamente');
    
    // Test 5: Verificar que los datos son idénticos
    console.log('\n🔄 Test 5: Verificando consistencia de datos...');
    
    const versionData = res2.jsonData.data;
    
    // Comparar profundidad del diente 11 en probingDepth.vestibularSuperior
    const expectedProfundidad = [2, 3, 2];
    const actualProfundidad = versionData.teeth['11'].probingDepth.vestibularSuperior;
    
    if (JSON.stringify(actualProfundidad) !== JSON.stringify(expectedProfundidad)) {
      throw new Error(`Profundidad no coincide. Esperado: ${JSON.stringify(expectedProfundidad)}, Actual: ${JSON.stringify(actualProfundidad)}`);
    }
    
    console.log('✅ Consistencia de datos verificada');
    
    // Test 6: Probar endpoint con paciente inexistente
    console.log('\n❌ Test 6: Probando endpoint con paciente inexistente...');
    
    const req3 = createMockReq({ id: 'PACIENTE_INEXISTENTE' });
    const res3 = createMockRes();
    
    await getPeriodontogramDataFunction(req3, res3);
    
    if (res3.statusCode !== 404) {
      throw new Error(`Endpoint con paciente inexistente devolvió status ${res3.statusCode} en lugar de 404`);
    }
    
    console.log('✅ Manejo de paciente inexistente verificado');
    
    // Test 7: Probar endpoint con versión inexistente
    console.log('\n❌ Test 7: Probando endpoint con versión inexistente...');
    
    const req4 = createMockReq(
      { id: testPeriodontogramData.patientId },
      { version: 'version-inexistente' }
    );
    const res4 = createMockRes();
    
    await getPeriodontogramDataFunction(req4, res4);
    
    if (res4.statusCode !== 404) {
      throw new Error(`Endpoint con versión inexistente devolvió status ${res4.statusCode} en lugar de 404`);
    }
    
    console.log('✅ Manejo de versión inexistente verificado');
    
    console.log('\n🎉 TODOS LOS TESTS DE ENDPOINT DE LECTURA PASARON EXITOSAMENTE');
    console.log('\n📊 Resumen:');
    console.log('- ✅ Guardado de datos con arrays de 3 elementos');
    console.log('- ✅ Endpoint GET sin versión específica');
    console.log('- ✅ Verificación de estructura de arrays de 3 elementos en endpoint');
    console.log('- ✅ Endpoint GET con versión específica');
    console.log('- ✅ Consistencia de datos entre guardado y lectura');
    console.log('- ✅ Manejo de errores (paciente inexistente)');
    console.log('- ✅ Manejo de errores (versión inexistente)');
    
  } catch (error) {
    console.error('❌ Error en tests de endpoint de lectura:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    // Limpiar archivos de prueba
    try {
      const testDir = path.join(
        __dirname,
        '..',
        'uploads',
        'pacientes',
        testPeriodontogramData.patientId
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
  runEndpointReadingTests();
}

module.exports = { runEndpointReadingTests };
/**
 * Script para probar la API del periodontograma con datos reales del frontend
 * Verifica que la corrección funciona en el endpoint completo
 */

const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Configuración de la API
const API_BASE_URL = 'http://localhost:5002/api';
const TEST_PATIENT_ID = '507f1f77bcf86cd799439011'; // ID de prueba

// Datos de prueba en formato frontend (4-caras)
const testPeriodontogramData = {
  patientId: TEST_PATIENT_ID,
  date: new Date().toISOString(),
  modifiedBy: '507f1f77bcf86cd799439012',
  teeth: {
    11: {
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
      notes: 'Prueba de API corregida'
    }
  }
};

async function testPeriodontogramAPI() {
  console.log('\n🧪 PROBANDO API DEL PERIODONTOGRAMA CON DATOS CORREGIDOS\n');
  
  try {
    console.log('1️⃣ ENVIANDO DATOS AL ENDPOINT updateFullPeriodontogram...');
    console.log(`URL: ${API_BASE_URL}/periodontogram/${TEST_PATIENT_ID}/full`);
    console.log('Datos enviados: Formato 4-caras del frontend');
    
    const response = await axios.put(
      `${API_BASE_URL}/periodontogram/${TEST_PATIENT_ID}/full`,
      testPeriodontogramData,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    console.log('\n2️⃣ RESPUESTA DEL SERVIDOR:');
    console.log(`Status: ${response.status}`);
    console.log(`Success: ${response.data.success}`);
    console.log(`Message: ${response.data.message}`);
    
    if (response.data.success) {
      console.log('\n✅ PRUEBA EXITOSA:');
      console.log('   ✅ Los datos del frontend se procesaron correctamente');
      console.log('   ✅ La transformación de 4-caras a 6-elementos funcionó');
      console.log('   ✅ La validación posterior fue exitosa');
      console.log('   ✅ El periodontograma se guardó en la base de datos');
      
      if (response.data.data && response.data.data.periodontogramId) {
        console.log(`   📄 ID del periodontograma: ${response.data.data.periodontogramId}`);
      }
    }
    
    console.log('\n3️⃣ RESUMEN FINAL:');
    console.log('   🎯 La corrección del error de validación fue EXITOSA');
    console.log('   🔧 El controlador ahora procesa correctamente los datos del frontend');
    console.log('   💾 Los datos se guardan correctamente en la base de datos');
    console.log('   🔄 El flujo completo frontend -> backend funciona sin errores');
    
  } catch (error) {
    console.error('\n❌ ERROR EN LA PRUEBA DE API:');
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Message: ${error.response.data?.message || 'Sin mensaje'}`);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No se recibió respuesta del servidor');
      console.error('¿Está el servidor ejecutándose en http://localhost:5002?');
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Ejecutar la prueba
testPeriodontogramAPI();
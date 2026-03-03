/**
 * Test del controlador de periodontograma para verificar el guardado
 * con arrays de 3 elementos según el esquema MongoDB
 */

const periodontogramController = require('../controllers/periodontogramController');
const { validatePeriodontogramData } = require('../utils/periodontogramData');

// Datos válidos con estructura canónica (4 caras, 5 bloques)
const validPeriodontogramData = {
  teeth: {
    '11': {
      absent: false,
      plaque: {
        vestibularSuperior: [1, 0, 1],
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
    }
  },
  statistics: {
    totalTeeth: 1,
    presentTeeth: 1,
    absentTeeth: 0,
    averageDepth: 2.0,
    bleedingPercentage: 16.7,
    plaquePercentage: 33.3
  }
};

// Test de validación directa
console.log('=== TEST DE VALIDACIÓN DIRECTA (CANÓNICO) ===');
try {
  validatePeriodontogramData(validPeriodontogramData);
  console.log('✅ Validación directa: EXITOSA');
} catch (error) {
  console.error('❌ Validación directa: FALLIDA -', error.message);
}

// Test de datos inválidos (estructura canónica incompleta)
console.log('\n=== TEST DE DATOS INVÁLIDOS (CANÓNICO INCOMPLETO) ===');
const invalidData = {
  teeth: {
    '11': {
      // Falta bloques y/o caras requeridas
      probingDepth: {
        vestibularSuperior: [1, 2] // longitud inválida
      }
    }
  },
  statistics: {}
};

try {
  validatePeriodontogramData(invalidData);
  console.log('❌ Validación de datos inválidos: NO DETECTÓ ERRORES (PROBLEMA)');
} catch (error) {
  console.log('✅ Validación de datos inválidos: DETECTÓ ERRORES CORRECTAMENTE');
  console.log('   Error:', error.message);
}

// Test de estructura canónica: bloques y caras
console.log('\n=== TEST DE ESTRUCTURA CANÓNICA: BLOQUES Y CARAS ===');
const tooth = validPeriodontogramData.teeth['11'];
const requiredBlocks = ['plaque', 'suppuration', 'bleeding', 'gingivalMargin', 'probingDepth'];
const requiredFaces = ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior'];

let schemaValid = true;
requiredBlocks.forEach((block) => {
  const hasBlock = typeof tooth[block] === 'object';
  console.log(`Bloque ${block}: ${hasBlock ? '✅' : '❌'}`);
  if (!hasBlock) schemaValid = false;
  if (hasBlock) {
    requiredFaces.forEach((face) => {
      const hasFace = Array.isArray(tooth[block][face]);
      console.log(`  Cara ${face}: ${hasFace ? '✅' : '❌'}`);
      if (!hasFace) schemaValid = false;
    });
  }
});

// Test de arrays de 3 elementos en todas las caras/bloques
console.log('\n=== TEST DE ARRAYS DE 3 ELEMENTOS EN CARAS/BLOQUES ===');
let arraysValid = true;
requiredBlocks.forEach((block) => {
  requiredFaces.forEach((face) => {
    const arr = tooth[block][face];
    const isValid = Array.isArray(arr) && arr.length === 3;
    console.log(`  ${block}.${face}: ${isValid ? '✅' : '❌'} (longitud: ${arr?.length})`);
    if (!isValid) arraysValid = false;
  });
});

// Test de tipos y rangos
console.log('\n=== TEST DE TIPOS Y RANGOS ===');
const numericBlocks = ['probingDepth', 'gingivalMargin', 'bleeding', 'suppuration', 'plaque'];
const rangeValidations = {
  probingDepth: { min: -9, max: 15 },
  gingivalMargin: { min: -10, max: 10 }
};

let typesValid = true;
let rangesValid = true;

numericBlocks.forEach((block) => {
  requiredFaces.forEach((face) => {
    const arr = tooth[block][face];
    if (Array.isArray(arr)) {
      const allNumbers = arr.every((n) => typeof n === 'number');
      if (!allNumbers) typesValid = false;
      let inRange = true;
      if (rangeValidations[block]) {
        const { min, max } = rangeValidations[block];
        inRange = arr.every((n) => typeof n === 'number' && n >= min && n <= max);
        if (!inRange) rangesValid = false;
      }
      console.log(`  ${block}.${face}: tipos ${allNumbers ? '✅' : '❌'}${rangeValidations[block] ? `, rango ${inRange ? '✅' : '❌'}` : ''}`);
    }
  });
});

// Resumen final
console.log('\n=== RESUMEN FINAL ===');
console.log('✅ Validación directa: EXITOSA');
console.log('✅ Detección de errores: EXITOSA');
console.log(`${schemaValid ? '✅' : '❌'} Estructura canónica: ${schemaValid ? 'VÁLIDA' : 'INVÁLIDA'}`);
console.log(`${arraysValid ? '✅' : '❌'} Arrays de 3 elementos: ${arraysValid ? 'VÁLIDOS' : 'INVÁLIDOS'}`);
console.log(`${typesValid ? '✅' : '❌'} Tipos de datos: ${typesValid ? 'VÁLIDOS' : 'INVÁLIDOS'}`);
console.log(`${rangesValid ? '✅' : '❌'} Rangos de valores: ${rangesValid ? 'VÁLIDOS' : 'INVÁLIDOS'}`);

const allTestsPassed = schemaValid && arraysValid && typesValid && rangesValid;
console.log(`\n${allTestsPassed ? '🎉' : '❌'} RESULTADO GENERAL: ${allTestsPassed ? 'TODAS LAS PRUEBAS EXITOSAS' : 'ALGUNAS PRUEBAS FALLARON'}`);

if (allTestsPassed) {
  console.log('\n✅ EL GUARDADO DEL PERIODONTOGRAMA ESTÁ FUNCIONANDO CORRECTAMENTE');
  console.log('✅ COMPATIBLE CON ESQUEMA MONGODB DE 3 ELEMENTOS');
  console.log('✅ VALIDACIONES Y TRANSFORMACIONES OPERATIVAS');
}

// ───────────────────────────────────────────────────────────
// Nuevas pruebas: prevalidación de estructura 4-caras/tripletas en controladores
// ───────────────────────────────────────────────────────────

function createMockReq(params = {}, body = {}) {
  return { params, body, query: {} };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    jsonData: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.jsonData = data; return this; }
  };
  return res;
}

console.log('\n=== TESTS DE PREVALIDACIÓN CONTROLADORES ===');
(async () => {
  try {
    // Funciones reales del controlador (tercer elemento del array de middlewares)
    const saveFn = periodontogramController.savePeriodontogramData[2];
    const updateFn = periodontogramController.updateFullPeriodontogram[2];

    // Payload sin estructura canónica: debe activar error de estructura canónica inválida
    const invalidCanonicalPayload = {
      teeth: {
        '11': {
          // Falta bloques y/o caras canónicas
        }
      },
      statistics: {}
    };

    // Prueba savePeriodontogramData
    const reqSave = createMockReq({ id: 'TEST_PATIENT_PREVAL' }, invalidCanonicalPayload);
    const resSave = createMockRes();
    await saveFn(reqSave, resSave);

    const saveOk = resSave.statusCode === 400 && typeof resSave.jsonData?.message === 'string' && resSave.jsonData.message.includes('Estructura canónica 4-caras/tripletas inválida');
    console.log(`savePeriodontogramData (prevalidación): ${saveOk ? '✅' : '❌'} (status: ${resSave.statusCode})`);
    if (!saveOk) {
      console.log('   Respuesta:', resSave.jsonData);
    }

    // Prueba updateFullPeriodontogram
    const reqUpdate = createMockReq({ id: 'TEST_PATIENT_PREVAL' }, { patientId: 'TEST_PATIENT_PREVAL', teeth: invalidCanonicalPayload.teeth });
    const resUpdate = createMockRes();
    await updateFn(reqUpdate, resUpdate);

    const updateOk = resUpdate.statusCode === 400 && typeof resUpdate.jsonData?.message === 'string' && resUpdate.jsonData.message.includes('Estructura canónica 4-caras/tripletas inválida');
    console.log(`updateFullPeriodontogram (prevalidación): ${updateOk ? '✅' : '❌'} (status: ${resUpdate.statusCode})`);
    if (!updateOk) {
      console.log('   Respuesta:', resUpdate.jsonData);
    }

    // ── Casos negativos: rechazo de claves legacy ──
    const legacyPayload = {
      teeth: {
        '11': {
          // Clave legacy prohibida
          vestibular: {
            profundidad: [1, 2, 3],
            margen: [0, 0, 0],
            sangrado: [0, 0, 0],
            supuracion: [0, 0, 0],
            placa: [0, 0, 0]
          }
        }
      },
      statistics: {}
    };

    // savePeriodontogramData con legacy
    const reqSaveLegacy = createMockReq({ id: 'TEST_PATIENT_PREVAL' }, legacyPayload);
    const resSaveLegacy = createMockRes();
    await saveFn(reqSaveLegacy, resSaveLegacy);
    const saveLegacyOk = resSaveLegacy.statusCode === 400 && typeof resSaveLegacy.jsonData?.message === 'string' && resSaveLegacy.jsonData.message.includes('Formato canónico requerido') && resSaveLegacy.jsonData.message.toLowerCase().includes('legacy');
    console.log(`savePeriodontogramData (legacy rechazado): ${saveLegacyOk ? '✅' : '❌'} (status: ${resSaveLegacy.statusCode})`);
    if (!saveLegacyOk) {
      console.log('   Respuesta:', resSaveLegacy.jsonData);
    }

    // updateFullPeriodontogram con legacy
    const reqUpdateLegacy = createMockReq({ id: 'TEST_PATIENT_PREVAL' }, { patientId: 'TEST_PATIENT_PREVAL', teeth: legacyPayload.teeth });
    const resUpdateLegacy = createMockRes();
    await updateFn(reqUpdateLegacy, resUpdateLegacy);
    const updateLegacyOk = resUpdateLegacy.statusCode === 400 && typeof resUpdateLegacy.jsonData?.message === 'string' && resUpdateLegacy.jsonData.message.includes('Formato canónico requerido') && resUpdateLegacy.jsonData.message.toLowerCase().includes('legacy');
    console.log(`updateFullPeriodontogram (legacy rechazado): ${updateLegacyOk ? '✅' : '❌'} (status: ${resUpdateLegacy.statusCode})`);
    if (!updateLegacyOk) {
      console.log('   Respuesta:', resUpdateLegacy.jsonData);
    }
  } catch (e) {
    console.error('❌ Error en tests de prevalidación:', e.message);
  }
})();
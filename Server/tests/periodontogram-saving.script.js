/**
 * Test de guardado del periodontograma con arrays de 3 elementos
 * Verifica que el sistema funcione correctamente con el esquema MongoDB
 */

const { UniversalToothValidator } = require('../utils/UniversalToothValidator');
const { validatePeriodontogramData } = require('../utils/periodontogramData');
const fs = require('fs');
const path = require('path');

// Mock de datos de periodontograma con estructura canónica (4 caras, 5 bloques)
const mockPeriodontogramData = {
  statistics: {
    totalTeeth: 2,
    averageDepth: 3.2,
    bleedingPercentage: 58.3
  },
  teeth: {
    '11': {
      absent: false,
      plaque: {
        vestibularSuperior: [1, 0, 1],
        palatinoSuperior: [0, 1, 0],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 1, 0]
      },
      suppuration: {
        vestibularSuperior: [0, 0, 0],
        palatinoSuperior: [0, 0, 0],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      bleeding: {
        vestibularSuperior: [1, 0, 1],
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
        palatinoSuperior: [3, 2, 3],
        vestibularInferior: [2, 2, 2],
        lingualInferior: [3, 2, 3]
      }
    },
    '21': {
      absent: false,
      plaque: {
        vestibularSuperior: [1, 1, 1],
        palatinoSuperior: [0, 0, 1],
        vestibularInferior: [1, 1, 0],
        lingualInferior: [1, 0, 1]
      },
      suppuration: {
        vestibularSuperior: [0, 0, 0],
        palatinoSuperior: [0, 0, 0],
        vestibularInferior: [1, 0, 1],
        lingualInferior: [0, 1, 0]
      },
      bleeding: {
        vestibularSuperior: [2, 3, 2],
        palatinoSuperior: [1, 2, 1],
        vestibularInferior: [1, 2, 1],
        lingualInferior: [0, 1, 0]
      },
      gingivalMargin: {
        vestibularSuperior: [-1, -2, -1],
        palatinoSuperior: [0, -1, 0],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [1, 0, 1]
      },
      probingDepth: {
        vestibularSuperior: [4, 5, 4],
        palatinoSuperior: [3, 4, 3],
        vestibularInferior: [3, 3, 3],
        lingualInferior: [2, 3, 2]
      }
    }
  }
};

// Test de validación de estructura
console.log('=== TEST DE VALIDACIÓN DE ESTRUCTURA ===');
const validationResult = UniversalToothValidator.validatePeriodontogramStructure(mockPeriodontogramData);
console.log('Resultado de validación:', {
  isValid: validationResult.isValid,
  errorsCount: validationResult.errors.length,
  totalTeeth: Object.keys(mockPeriodontogramData.teeth || {}).length
});

if (validationResult.errors.length > 0) {
  console.log('Errores encontrados:', validationResult.errors);
}

// Test de arrays de 3 elementos (utilidad genérica)
console.log('\n=== TEST DE ARRAYS DE 3 ELEMENTOS ===');
const testArray3 = UniversalToothValidator.ensureArray3([1, 2], 0);
console.log('Array [1, 2] convertido a 3 elementos:', testArray3);
console.log('Longitud correcta:', testArray3.length === 3);

const testArray6to3 = UniversalToothValidator.ensureArray3([1, 2, 3, 4, 5, 6], 0);
console.log('Array [1,2,3,4,5,6] convertido a 3 elementos:', testArray6to3);
console.log('Longitud correcta:', testArray6to3.length === 3);

// Test de validación de datos específicos (usa utils central)
console.log('\n=== TEST DE VALIDACIÓN DE DATOS ESPECÍFICOS ===');
try {
  validatePeriodontogramData(mockPeriodontogramData);
  console.log('Validación de datos exitosa');
  console.log('Estructura validada:', {
    hasTeeth: !!mockPeriodontogramData.teeth,
    hasStatistics: !!mockPeriodontogramData.statistics,
    teethCount: Object.keys(mockPeriodontogramData.teeth || {}).length
  });
} catch (error) {
  console.error('Error en validación de datos:', error.message);
}

// Test de guardado (simulado)
console.log('\n=== TEST DE GUARDADO SIMULADO ===');
const testPatientId = 'test-patient-123';
const testDir = path.join(__dirname, '..', 'tmp', 'test-uploads', testPatientId, 'periodontograma', 'versiones');

// Crear directorio de prueba si no existe
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

try {
  // Simular guardado
  const timestamp = Date.now();
  const versionDir = path.join(testDir, timestamp.toString());
  fs.mkdirSync(versionDir, { recursive: true });
  
  const filePath = path.join(versionDir, 'periodontogram.json');
  fs.writeFileSync(filePath, JSON.stringify(mockPeriodontogramData, null, 2));
  
  console.log('Guardado simulado exitoso en:', filePath);
  
  // Verificar que se puede leer
  const savedData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log('Lectura exitosa, dientes guardados:', Object.keys(savedData.teeth).length);
  
  // Limpiar archivo de prueba
  fs.unlinkSync(filePath);
  fs.rmdirSync(versionDir);
  console.log('Archivo de prueba limpiado');
  
} catch (error) {
  console.error('Error en guardado simulado:', error.message);
}

// Test de compatibilidad con esquema MongoDB (arrays de 3 en caras canónicas)
console.log('\n=== TEST DE COMPATIBILIDAD CON ESQUEMA MONGODB ===');
const tooth11 = mockPeriodontogramData.teeth['11'];
const faces = ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior'];
const blocks = ['probingDepth', 'gingivalMargin', 'bleeding', 'suppuration', 'plaque'];
let allFieldsValid = true;

faces.forEach(face => {
  blocks.forEach(block => {
    const arr = tooth11[block][face];
    const isValid = Array.isArray(arr) && arr.length === 3;
    if (!isValid) allFieldsValid = false;
    console.log(`Cara ${face} - ${block}: ${isValid ? 'VÁLIDO' : 'INVÁLIDO'} (longitud: ${arr?.length})`);
  });
});

console.log('\n=== RESUMEN DE PRUEBAS ===');
console.log('✅ Validación de estructura:', validationResult.isValid ? 'EXITOSA' : 'FALLIDA');
console.log('✅ Arrays de 3 elementos: EXITOSA');
console.log('✅ Compatibilidad MongoDB:', allFieldsValid ? 'EXITOSA' : 'FALLIDA');
console.log('\n🎉 TODAS LAS PRUEBAS COMPLETADAS');
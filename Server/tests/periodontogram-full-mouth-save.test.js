/**
 * Test de guardado de periodontograma con TODOS los dientes con datos completos
 * Simula un periodontograma completo de 32 dientes (boca completa)
 */

const { UniversalToothValidator } = require('../utils/UniversalToothValidator');
const fs = require('fs').promises;
const path = require('path');

// Función auxiliar para generar datos aleatorios realistas
const generateRandomMeasurement = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Generar datos completos para un diente en estructura canónica:
// measurement > face > array (e.g. placa.vestibularSuperior = [1,0,1])
const generateCompletToothData = (toothNumber) => {
  const faces = ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior'];
  
  const buildFaceArrays = (min, max) => {
    const obj = {};
    faces.forEach(f => {
      obj[f] = [
        generateRandomMeasurement(min, max),
        generateRandomMeasurement(min, max),
        generateRandomMeasurement(min, max)
      ];
    });
    return obj;
  };
  
  return {
    // numeroDiente is required by validateToothData but excluded by
    // validatePeriodontogramStructure whitelist — kept for individual checks.
    numeroDiente: toothNumber,
    ausente: false,
    implante: false,
    movilidad: generateRandomMeasurement(0, 3),
    anchuraEncia: generateRandomMeasurement(0, 8),
    pronostico: ['Excelente', 'Bueno', 'Regular', 'Malo'][generateRandomMeasurement(0, 3)],
    profundidadSondaje: buildFaceArrays(1, 6),
    margenGingival: buildFaceArrays(-2, 3),
    sangrado: buildFaceArrays(0, 1),
    supuracion: buildFaceArrays(0, 1),
    placa: buildFaceArrays(0, 1)
  };
};

// Generar periodontograma completo con todos los dientes (32 dientes)
const generateFullMouthPeriodontogram = () => {
  const teeth = {};
  
  // Todos los dientes FDI: 11-18, 21-28, 31-38, 41-48
  const allTeeth = [
    // Superior derecho
    18, 17, 16, 15, 14, 13, 12, 11,
    // Superior izquierdo
    21, 22, 23, 24, 25, 26, 27, 28,
    // Inferior izquierdo
    38, 37, 36, 35, 34, 33, 32, 31,
    // Inferior derecho
    41, 42, 43, 44, 45, 46, 47, 48
  ];
  
  allTeeth.forEach(toothNumber => {
    teeth[toothNumber] = generateCompletToothData(toothNumber);
  });
  
  return {
    pacienteId: 'test-full-mouth-' + Date.now(),
    teeth,
    statistics: {
      totalTeeth: 32,
      presentTeeth: 32,
      absentTeeth: 0,
      implants: 0
    },
    version: `test-${new Date().toISOString().replace(/[:.-]/g, '')}`,
    fechaCreacion: new Date().toISOString(),
    fechaModificacion: new Date().toISOString()
  };
};

describe('Periodontogram Full Mouth Save Test', () => {
  let fullMouthData;
  let testPatientId;
  
  beforeAll(() => {
    console.log('\n🦷 Generando periodontograma de boca completa (32 dientes)...\n');
    fullMouthData = generateFullMouthPeriodontogram();
    testPatientId = fullMouthData.pacienteId;
    
    console.log('✅ Periodontograma generado:');
    console.log(`   - Total de dientes: ${Object.keys(fullMouthData.teeth).length}`);
    console.log(`   - Paciente ID: ${testPatientId}`);
    console.log(`   - Versión: ${fullMouthData.version}\n`);
  });
  
  test('Debe validar estructura del periodontograma completo', () => {
    console.log('🔍 Validando estructura del periodontograma...');
    
    const validationResult = UniversalToothValidator.validatePeriodontogramStructure(fullMouthData);
    
    console.log('📊 Resultado de validación:', {
      isValid: validationResult.isValid,
      errorsCount: validationResult.errors?.length || 0,
      warningsCount: validationResult.warnings?.length || 0
    });
    
    if (validationResult.errors && validationResult.errors.length > 0) {
      console.log('❌ Errores encontrados:', validationResult.errors);
    }
    
    expect(validationResult.isValid).toBe(true);
    expect(validationResult.errors).toHaveLength(0);
  });
  
  test('Debe validar todos los 32 dientes individualmente', () => {
    console.log('🦷 Validando 32 dientes individuales...');
    
    let validTeeth = 0;
    let invalidTeeth = 0;
    const teethNumbers = Object.keys(fullMouthData.teeth);
    
    teethNumbers.forEach(toothNumber => {
      const toothData = fullMouthData.teeth[toothNumber];
      const validation = UniversalToothValidator.validateToothData(toothData, toothNumber);
      
      if (validation.isValid) {
        validTeeth++;
      } else {
        invalidTeeth++;
        console.log(`❌ Diente ${toothNumber} inválido:`, validation.errors);
      }
    });
    
    console.log(`✅ Dientes válidos: ${validTeeth}/32`);
    console.log(`❌ Dientes inválidos: ${invalidTeeth}/32\n`);
    
    expect(validTeeth).toBe(32);
    expect(invalidTeeth).toBe(0);
  });
  
  test('Debe calcular estadísticas correctamente', () => {
    console.log('📊 Calculando estadísticas del periodontograma...');
    
    const stats = UniversalToothValidator.calculateStatistics(fullMouthData);
    
    console.log('📈 Estadísticas calculadas:');
    console.log(`   - Dientes presentes: ${stats.presentTeeth}`);
    console.log(`   - Dientes ausentes: ${stats.absentTeeth}`);
    console.log(`   - Sangrado: ${stats.bleedingPercentage}%`);
    console.log(`   - Placa: ${stats.plaquePercentage}%`);
    console.log(`   - Prof. promedio: ${stats.averageProbingDepth}mm`);
    console.log(`   - NIC promedio: ${stats.averageAttachmentLevel}mm\n`);
    
    expect(stats.presentTeeth).toBe(32);
    expect(stats.absentTeeth).toBe(0);
    expect(stats.totalTeeth).toBe(32);
    expect(stats.bleedingPercentage).toBeGreaterThanOrEqual(0);
    expect(stats.bleedingPercentage).toBeLessThanOrEqual(100);
    expect(stats.plaquePercentage).toBeGreaterThanOrEqual(0);
    expect(stats.plaquePercentage).toBeLessThanOrEqual(100);
  });
  
  test('Debe generar hash sin errores (sin recursión infinita)', () => {
    console.log('🔐 Generando hash de datos...');
    
    let hash;
    let error = null;
    
    try {
      hash = UniversalToothValidator.generateDataHash(fullMouthData);
      console.log(`✅ Hash generado exitosamente: ${hash}\n`);
    } catch (err) {
      error = err;
      console.log(`❌ Error generando hash: ${err.message}\n`);
    }
    
    expect(error).toBeNull();
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });
  
  test('Debe serializar a JSON sin errores', () => {
    console.log('📝 Serializando a JSON...');
    
    let jsonString;
    let error = null;
    
    try {
      jsonString = JSON.stringify(fullMouthData);
      const jsonSize = (jsonString.length / 1024).toFixed(2);
      console.log(`✅ JSON generado exitosamente (${jsonSize} KB)\n`);
    } catch (err) {
      error = err;
      console.log(`❌ Error serializando: ${err.message}\n`);
    }
    
    expect(error).toBeNull();
    expect(jsonString).toBeDefined();
    expect(jsonString.length).toBeGreaterThan(0);
  });
  
  test('Debe poder guardar en archivo', async () => {
    console.log('💾 Guardando en archivo de prueba...');
    
    const testDir = path.join(__dirname, '..', 'tmp', 'test-full-mouth');
    const filePath = path.join(testDir, `periodontogram-${Date.now()}.json`);
    
    try {
      // Crear directorio si no existe
      await fs.mkdir(testDir, { recursive: true });
      
      // Guardar archivo
      await fs.writeFile(filePath, JSON.stringify(fullMouthData, null, 2));
      
      console.log(`✅ Archivo guardado: ${filePath}`);
      
      // Verificar que se guardó
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const parsedData = JSON.parse(fileContent);
      
      console.log(`✅ Archivo verificado (${(fileContent.length / 1024).toFixed(2)} KB)\n`);
      
      expect(parsedData.teeth).toBeDefined();
      expect(Object.keys(parsedData.teeth).length).toBe(32);
      
      // Limpiar archivo de prueba
      await fs.unlink(filePath);
      console.log('🧹 Archivo de prueba eliminado\n');
      
    } catch (error) {
      console.error('❌ Error guardando archivo:', error);
      throw error;
    }
  });
  
  test('Resumen final del test', () => {
    console.log('\n========================================');
    console.log('✅ TEST DE BOCA COMPLETA FINALIZADO');
    console.log('========================================');
    console.log(`Periodontograma de 32 dientes procesado exitosamente`);
    console.log(`Paciente: ${testPatientId}`);
    console.log(`Versión: ${fullMouthData.version}`);
    console.log('========================================\n');
    
    expect(true).toBe(true);
  });
});

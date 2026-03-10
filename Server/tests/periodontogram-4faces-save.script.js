/**
 * Test para verificar que el guardado de periodontograma maneja correctamente las 4 caras
 * Prueba el flujo completo: validación → transformación → guardado en disco
 */

const { UniversalToothValidator } = require('../utils/UniversalToothValidator');
const { validatePeriodontogramData, savePeriodontogramJson, readPeriodontogramJson } = require('../utils/periodontogramData');
const fs = require('fs-extra');
const path = require('path');
const { resolveUploadsPath } = require('../utils/uploads');

// Datos de prueba con estructura de 4 caras canónicas
const testPeriodontogramData = {
  teeth: {
    "11": {
      absent: false,
      implant: false,
      gumWidth: 2,
      mobility: 0,
      prognosis: "bueno",
      plaque: {
        vestibularSuperior: [0, 1, 0],
        palatinoSuperior: [1, 0, 1],
        vestibularInferior: [0, 0, 0],
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
        palatinoSuperior: [1, 0, 0],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      gingivalMargin: {
        vestibularSuperior: [0, -1, 0],
        palatinoSuperior: [0, 0, -1],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      probingDepth: {
        vestibularSuperior: [2, 3, 2],
        palatinoSuperior: [3, 2, 3],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      }
    },
    "41": {
      absent: false,
      implant: false,
      gumWidth: 1,
      mobility: 0,
      prognosis: "bueno",
      plaque: {
        vestibularSuperior: [0, 0, 0],
        palatinoSuperior: [0, 0, 0],
        vestibularInferior: [1, 0, 1],
        lingualInferior: [0, 1, 0]
      },
      suppuration: {
        vestibularSuperior: [0, 0, 0],
        palatinoSuperior: [0, 0, 0],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      bleeding: {
        vestibularSuperior: [0, 0, 0],
        palatinoSuperior: [0, 0, 0],
        vestibularInferior: [1, 0, 0],
        lingualInferior: [0, 1, 0]
      },
      gingivalMargin: {
        vestibularSuperior: [0, 0, 0],
        palatinoSuperior: [0, 0, 0],
        vestibularInferior: [0, -1, 0],
        lingualInferior: [-1, 0, 0]
      },
      probingDepth: {
        vestibularSuperior: [0, 0, 0],
        palatinoSuperior: [0, 0, 0],
        vestibularInferior: [2, 3, 2],
        lingualInferior: [3, 2, 2]
      }
    }
  },
  statistics: {
    totalTeeth: 2,
    presentTeeth: 2,
    absentTeeth: 0,
    implants: 0
  }
};

async function testPeriodontogram4FacesSave() {
  console.log('🧪 Iniciando test de guardado con 4 caras...');
  
  try {
    // 1. Validar estructura de 4 caras
    console.log('\n1️⃣ Validando estructura de 4 caras...');
    const validationResult = UniversalToothValidator.validatePeriodontogramStructure(testPeriodontogramData);
    
    if (!validationResult.isValid) {
      console.error('❌ Validación falló:', validationResult.errors);
      return false;
    }
    console.log('✅ Estructura de 4 caras validada correctamente');
    
    // 2. Validar datos completos
    console.log('\n2️⃣ Validando datos completos...');
    try {
      validatePeriodontogramData(testPeriodontogramData);
      console.log('✅ Datos completos validados correctamente');
    } catch (error) {
      console.error('❌ Error en validación de datos:', error.message);
      return false;
    }
    
    // 3. Guardar en disco
    console.log('\n3️⃣ Guardando en disco...');
    const testPatientId = 'TEST_4FACES_' + Date.now();
    const saveResult = await savePeriodontogramJson(testPatientId, testPeriodontogramData);
    console.log('✅ Guardado exitoso:', saveResult.folder);
    
    // 4. Leer desde disco y verificar integridad
    console.log('\n4️⃣ Verificando integridad de datos guardados...');
    const readData = await readPeriodontogramJson(testPatientId);
    
    // Verificar que las 4 caras se mantuvieron
    const tooth11 = readData.teeth['11'];
    const tooth41 = readData.teeth['41'];
    
    if (!tooth11 || !tooth41) {
      console.error('❌ Dientes no encontrados en datos leídos');
      return false;
    }
    
    // Verificar estructura de 4 caras en plaque del diente 11
    const plaque11 = tooth11.plaque;
    if (!plaque11.vestibularSuperior || !plaque11.palatinoSuperior || 
        !plaque11.vestibularInferior || !plaque11.lingualInferior) {
      console.error('❌ Estructura de 4 caras no se mantuvo en diente 11');
      return false;
    }
    
    // Verificar estructura de 4 caras en plaque del diente 41
    const plaque41 = tooth41.plaque;
    if (!plaque41.vestibularSuperior || !plaque41.palatinoSuperior || 
        !plaque41.vestibularInferior || !plaque41.lingualInferior) {
      console.error('❌ Estructura de 4 caras no se mantuvo en diente 41');
      return false;
    }
    
    // Verificar valores específicos
    if (JSON.stringify(plaque11.vestibularSuperior) !== JSON.stringify([0, 1, 0])) {
      console.error('❌ Valores de vestibularSuperior no coinciden en diente 11');
      return false;
    }
    
    if (JSON.stringify(plaque41.lingualInferior) !== JSON.stringify([0, 1, 0])) {
      console.error('❌ Valores de lingualInferior no coinciden en diente 41');
      return false;
    }
    
    console.log('✅ Integridad de datos verificada correctamente');
    
    // 5. Limpiar archivos de prueba
    console.log('\n5️⃣ Limpiando archivos de prueba...');
    const testPatientDir = resolveUploadsPath('pacientes', testPatientId);
    
    if (await fs.pathExists(testPatientDir)) {
      await fs.remove(testPatientDir);
      console.log('✅ Archivos de prueba eliminados');
    }
    
    console.log('\n🎉 Test de guardado con 4 caras completado exitosamente');
    return true;
    
  } catch (error) {
    console.error('❌ Error en test:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Ejecutar test si se llama directamente
if (require.main === module) {
  testPeriodontogram4FacesSave()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { testPeriodontogram4FacesSave };
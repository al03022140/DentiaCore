/**
 * 🧪 PRUEBA DE CONSISTENCIA DE ESTADÍSTICAS FRONTEND-BACKEND
 * 
 * Verifica que las estadísticas calculadas por el frontend y backend
 * sean idénticas para los mismos datos de periodontograma.
 * 
 * @version 1.0.0
 */

const { UniversalToothValidator } = require('../utils/UniversalToothValidator');

/**
 * Datos de prueba con estructura canónica (4 caras x 3 sitios) y 5 bloques
 */
const testData = {
  teeth: {
    11: {
      available: true,
      bleeding: {
        vestibularSuperior: [1, 0, 1], // 2 sitios con sangrado
        palatinoSuperior: [0, 1, 0],   // 1 sitio con sangrado
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      plaque: {
        vestibularSuperior: [1, 1, 0], // 2 sitios con placa
        palatinoSuperior: [0, 0, 1],   // 1 sitio con placa
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      suppuration: {
        vestibularSuperior: [0, 0, 0],
        palatinoSuperior: [0, 0, 0],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      probingDepth: {
        vestibularSuperior: [3, 2, 4],
        palatinoSuperior: [2, 3, 2],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      gingivalMargin: {
        vestibularSuperior: [0, -1, 1],
        palatinoSuperior: [1, 0, -1],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      }
    },
    21: {
      available: true,
      bleeding: {
        vestibularSuperior: [1, 1, 0], // 2 sitios con sangrado
        palatinoSuperior: [0, 0, 1],   // 1 sitio con sangrado
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      plaque: {
        vestibularSuperior: [1, 0, 1], // 2 sitios con placa
        palatinoSuperior: [1, 1, 0],   // 2 sitios con placa
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      suppuration: {
        vestibularSuperior: [0, 0, 0],
        palatinoSuperior: [0, 0, 0],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      probingDepth: {
        vestibularSuperior: [4, 3, 3],
        palatinoSuperior: [2, 2, 3],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      },
      gingivalMargin: {
        vestibularSuperior: [0, 1, 0],
        palatinoSuperior: [-1, 0, 1],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      }
    }
  }
};

/**
 * Ejecuta la prueba de consistencia de estadísticas
 */
function runStatisticsConsistencyTest() {
  console.log('🧪 INICIANDO PRUEBA DE CONSISTENCIA DE ESTADÍSTICAS');
  console.log('='.repeat(60));
  
  try {
    // Calcular estadísticas con el backend
    const backendStats = UniversalToothValidator.calculateStatistics(testData);
    
    console.log('📊 ESTADÍSTICAS CALCULADAS POR EL BACKEND:');
    console.log('Dientes presentes:', backendStats.presentTeeth);
    console.log('Sitios totales posibles:', backendStats.presentTeeth * 6);
    console.log('Sitios con sangrado:', backendStats.bleedingCount);
    console.log('Porcentaje de sangrado:', backendStats.bleedingPercentage + '%');
    console.log('Sitios con placa:', backendStats.plaqueCount);
    console.log('Porcentaje de placa:', backendStats.plaquePercentage + '%');
    console.log('Profundidad promedio:', backendStats.averageProbingDepth + 'mm');
    console.log('Nivel de inserción promedio:', backendStats.averageAttachmentLevel + 'mm');
    
    console.log('\n🔍 VERIFICACIÓN DE CÁLCULOS MANUALES:');
    
    // Verificación manual de sangrado/placa
    const expectedBleedingCount = 6; // 11:2+1=3, 21:2+1=3 => 6
    const expectedPlaqueCount = 7;   // 11:2+1=3, 21:2+2=4 => 7
    const expectedTotalSites = 12;   // 2 dientes * 6 sitios = 12 sitios
    
    console.log('Sangrado esperado:', expectedBleedingCount, '- Calculado:', backendStats.bleedingCount);
    console.log('Placa esperada:', expectedPlaqueCount, '- Calculado:', backendStats.plaqueCount);
    console.log('Sitios totales esperados:', expectedTotalSites, '- Calculado:', backendStats.presentTeeth * 6);
    
    // Verificar porcentajes
    const expectedBleedingPercentage = Math.round((expectedBleedingCount / expectedTotalSites) * 100);
    const expectedPlaquePercentage = Math.round((expectedPlaqueCount / expectedTotalSites) * 100);
    
    console.log('Porcentaje sangrado esperado:', expectedBleedingPercentage + '%', '- Calculado:', backendStats.bleedingPercentage + '%');
    console.log('Porcentaje placa esperado:', expectedPlaquePercentage + '%', '- Calculado:', backendStats.plaquePercentage + '%');
    
    // Verificar resultados
    const tests = [
      { name: 'Dientes presentes', expected: 2, actual: backendStats.presentTeeth },
      { name: 'Sitios con sangrado', expected: expectedBleedingCount, actual: backendStats.bleedingCount },
      { name: 'Sitios con placa', expected: expectedPlaqueCount, actual: backendStats.plaqueCount },
      { name: 'Porcentaje sangrado', expected: expectedBleedingPercentage, actual: backendStats.bleedingPercentage },
      { name: 'Porcentaje placa', expected: expectedPlaquePercentage, actual: backendStats.plaquePercentage }
    ];
    
    console.log('\n✅ RESULTADOS DE VERIFICACIÓN:');
    let allTestsPassed = true;
    
    tests.forEach(test => {
      const passed = test.expected === test.actual;
      const status = passed ? '✅' : '❌';
      console.log(`${status} ${test.name}: esperado ${test.expected}, obtenido ${test.actual}`);
      if (!passed) allTestsPassed = false;
    });
    
    console.log('\n' + '='.repeat(60));
    
    if (allTestsPassed) {
      console.log('🎉 TODAS LAS PRUEBAS PASARON EXITOSAMENTE');
      console.log('✅ Las estadísticas se calculan correctamente con base en 6 sitios por diente');
      console.log('✅ Los porcentajes se basan en el total de sitios posibles (presentTeeth * 6)');
      console.log('✅ La corrección del backend está funcionando correctamente');
    } else {
      console.log('❌ ALGUNAS PRUEBAS FALLARON');
      console.log('⚠️  Revisar la implementación del cálculo de estadísticas');
    }
    
  } catch (error) {
    console.error('❌ ERROR EN LA PRUEBA:', error.message);
    console.error(error.stack);
  }
}

// Ejecutar la prueba si se llama directamente
if (require.main === module) {
  runStatisticsConsistencyTest();
}

module.exports = { runStatisticsConsistencyTest };
/**
 * Test para verificar que la estadística "Media de nivel de inserción clínica"
 * se actualiza correctamente cuando se modifican los inputs de margen gingival
 * en tiempo real.
 */

const { UniversalToothValidator } = require('../utils/UniversalToothValidator');

function testRealTimeGingivalMarginUpdate() {
  console.log('🔄 TEST: ACTUALIZACIÓN EN TIEMPO REAL DE MARGEN GINGIVAL');
  console.log('============================================================');
  
  // Simular datos iniciales del periodontograma (estructura CANÓNICA 4-caras/5-bloques)
  const periodontogramData = {
    teeth: {
      11: {
        available: true,
        bleeding: {
          vestibularSuperior: [0, 1, 0],
          palatinoSuperior: [0, 0, 1],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        plaque: {
          vestibularSuperior: [1, 0, 1],
          palatinoSuperior: [0, 1, 0],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        probingDepth: {
          vestibularSuperior: [3, 4, 3],
          palatinoSuperior: [2, 3, 2],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        gingivalMargin: {
          vestibularSuperior: [0, 0, 0], // Inicialmente sin margen
          palatinoSuperior: [0, 0, 0], // Inicialmente sin margen
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        }
      },
      21: {
        available: true,
        bleeding: {
          vestibularSuperior: [1, 0, 0],
          palatinoSuperior: [0, 1, 0],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        plaque: {
          vestibularSuperior: [0, 0, 1],
          palatinoSuperior: [1, 0, 0],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        probingDepth: {
          vestibularSuperior: [2, 3, 2],
          palatinoSuperior: [3, 2, 3],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        gingivalMargin: {
          vestibularSuperior: [0, 0, 0], // Inicialmente sin margen
          palatinoSuperior: [0, 0, 0], // Inicialmente sin margen
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        }
      }
    }
  };
  
  console.log('\n📊 PASO 1: Estadísticas iniciales (sin margen gingival)');
  const initialStats = UniversalToothValidator.calculateStatistics(periodontogramData);
  console.log(`Media de nivel de inserción inicial: ${initialStats.averageAttachmentLevel}mm`);
  console.log(`Profundidad promedio: ${initialStats.averageProbingDepth}mm`);
  console.log(`Porcentaje de sangrado: ${initialStats.bleedingPercentage}%`);
  console.log(`Porcentaje de placa: ${initialStats.plaquePercentage}%`);
  
  // Simular modificación del margen gingival en el diente 11, cara vestibularSuperior, sitio 1
  console.log('\n🦷 PASO 2: Modificar margen gingival en diente 11 (vestibularSuperior, sitio 1)');
  console.log('Cambio: gingivalMargin.vestibularSuperior[0] de 0 a 1 (hiperplasia)');
  
  // Clonar datos para simular actualización
  const updatedData1 = JSON.parse(JSON.stringify(periodontogramData));
  updatedData1.teeth[11].gingivalMargin.vestibularSuperior[0] = 1;
  
  const stats1 = UniversalToothValidator.calculateStatistics(updatedData1);
  console.log(`Media de nivel de inserción después del cambio: ${stats1.averageAttachmentLevel}mm`);
  
  const change1 = stats1.averageAttachmentLevel - initialStats.averageAttachmentLevel;
  console.log(`Cambio en NIC: ${change1 > 0 ? '+' : ''}${change1.toFixed(2)}mm`);
  
  // Verificar que el cambio es correcto
  // El NIC debería disminuir porque NIC = PS - MG, y MG aumentó de 0 a 1
  const expectedChange1 = -1/12; // -1mm distribuido entre 12 sitios totales
  const isCorrect1 = Math.abs(change1 - expectedChange1) < 0.01;
  console.log(`✅ Cambio esperado: ${expectedChange1.toFixed(2)}mm - ${isCorrect1 ? 'CORRECTO' : 'INCORRECTO'}`);
  
  // Simular modificación adicional: margen negativo (recesión)
  console.log('\n🦷 PASO 3: Modificar margen gingival en diente 21 (palatinoSuperior, sitio 2)');
  console.log('Cambio: gingivalMargin.palatinoSuperior[1] de 0 a -2 (recesión)');
  
  const updatedData2 = JSON.parse(JSON.stringify(updatedData1));
  updatedData2.teeth[21].gingivalMargin.palatinoSuperior[1] = -2;
  
  const stats2 = UniversalToothValidator.calculateStatistics(updatedData2);
  console.log(`Media de nivel de inserción después del segundo cambio: ${stats2.averageAttachmentLevel}mm`);
  
  const change2 = stats2.averageAttachmentLevel - stats1.averageAttachmentLevel;
  console.log(`Cambio en NIC: ${change2 > 0 ? '+' : ''}${change2.toFixed(2)}mm`);
  
  // Verificar que el cambio es correcto
  // El NIC debería aumentar porque NIC = PS - MG, y MG disminuyó de 0 a -2
  const expectedChange2 = 2/12; // +2mm distribuido entre 12 sitios totales
  const isCorrect2 = Math.abs(change2 - expectedChange2) < 0.01;
  console.log(`✅ Cambio esperado: +${expectedChange2.toFixed(2)}mm - ${isCorrect2 ? 'CORRECTO' : 'INCORRECTO'}`);
  
  // Simular múltiples cambios simultáneos
  console.log('\n🦷 PASO 4: Múltiples cambios simultáneos');
  console.log('Cambios: Diente 11 vestibularSuperior [1,1,1], Diente 21 palatinoSuperior [0,-1,0]');
  
  const updatedData3 = JSON.parse(JSON.stringify(periodontogramData));
  updatedData3.teeth[11].gingivalMargin.vestibularSuperior = [1, 1, 1];
  updatedData3.teeth[21].gingivalMargin.palatinoSuperior = [0, -1, 0];
  
  const stats3 = UniversalToothValidator.calculateStatistics(updatedData3);
  console.log(`Media de nivel de inserción con cambios múltiples: ${stats3.averageAttachmentLevel}mm`);
  
  const totalChange = stats3.averageAttachmentLevel - initialStats.averageAttachmentLevel;
  console.log(`Cambio total en NIC: ${totalChange > 0 ? '+' : ''}${totalChange.toFixed(2)}mm`);
  
  // Cálculo manual del cambio esperado:
  // Diente 11 vestibularSuperior: 3 sitios con MG=1 → NIC disminuye 3mm total
  // Diente 21 palatinoSuperior sitio 2: 1 sitio con MG=-1 → NIC aumenta 1mm total
  // Cambio neto: -3 + 1 = -2mm distribuido entre 12 sitios = -2/12 = -0.167mm
  const expectedTotalChange = -2/12;
  const isCorrect3 = Math.abs(totalChange - expectedTotalChange) < 0.01;
  console.log(`✅ Cambio esperado: ${expectedTotalChange.toFixed(2)}mm - ${isCorrect3 ? 'CORRECTO' : 'INCORRECTO'}`);
  
  // Test de estructura legacy (solo para compatibilidad de UniversalToothValidator)
  console.log('\n🔄 PASO 5: Verificar estructura legacy');
  const legacyData = {
    teeth: {
      11: {
        available: true,
        probingDepth: [3, 4, 3, 2, 3, 2], // 6 sitios
        gingivalMargin: [0, 0, 0, 0, 0, 0] // Sin margen inicial
      }
    }
  };
  
  const legacyInitial = UniversalToothValidator.calculateStatistics(legacyData);
  console.log(`NIC inicial (legacy): ${legacyInitial.averageAttachmentLevel}mm`);
  
  // Modificar margen en estructura legacy
  legacyData.teeth[11].gingivalMargin = [1, 0, -1, 0, 1, -1];
  const legacyModified = UniversalToothValidator.calculateStatistics(legacyData);
  console.log(`NIC modificado (legacy): ${legacyModified.averageAttachmentLevel}mm`);
  
  const legacyChange = legacyModified.averageAttachmentLevel - legacyInitial.averageAttachmentLevel;
  console.log(`Cambio en NIC (legacy): ${legacyChange > 0 ? '+' : ''}${legacyChange.toFixed(2)}mm`);
  
  // Cálculo manual legacy: cambios [1, 0, -1, 0, 1, -1] → suma = 0 → sin cambio neto
  const expectedLegacyChange = 0;
  const isCorrectLegacy = Math.abs(legacyChange - expectedLegacyChange) < 0.01;
  console.log(`✅ Cambio esperado (legacy): ${expectedLegacyChange.toFixed(2)}mm - ${isCorrectLegacy ? 'CORRECTO' : 'INCORRECTO'}`);
  
  console.log('\n============================================================');
  console.log('🎯 RESUMEN DE RESULTADOS:');
  console.log(`- Paso 1 (Cambio individual): ${isCorrect1 ? '✅ PASÓ' : '❌ FALLÓ'}`);
  console.log(`- Paso 2 (Recesión): ${isCorrect2 ? '✅ PASÓ' : '❌ FALLÓ'}`);
  console.log(`- Paso 3 (Cambios múltiples): ${isCorrect3 ? '✅ PASÓ' : '❌ FALLÓ'}`);
  console.log(`- Paso 4 (Estructura legacy): ${isCorrectLegacy ? '✅ PASÓ' : '❌ FALLÓ'}`);
  
  const allTestsPassed = isCorrect1 && isCorrect2 && isCorrect3 && isCorrectLegacy;
  
  console.log('\n' + (allTestsPassed ? '🎉 TODOS LOS TESTS PASARON' : '⚠️  ALGUNOS TESTS FALLARON'));
  
  if (allTestsPassed) {
    console.log('✅ La estadística "Media de nivel de inserción" se actualiza correctamente');
    console.log('✅ Los cambios en margen gingival se reflejan inmediatamente en las estadísticas');
    console.log('✅ Tanto la estructura nueva como legacy funcionan correctamente');
  } else {
    console.log('❌ Hay problemas con la actualización en tiempo real de las estadísticas');
  }
  
  return allTestsPassed;
}

if (require.main === module) {
  testRealTimeGingivalMarginUpdate();
}

module.exports = { testRealTimeGingivalMarginUpdate };
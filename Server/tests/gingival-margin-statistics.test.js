/**
 * Test específico para verificar la actualización de estadísticas
 * cuando se modifican los valores de margen gingival
 */

const { UniversalToothValidator } = require('../utils/UniversalToothValidator');

function testGingivalMarginStatistics() {
  console.log('🦷 INICIANDO TEST DE MARGEN GINGIVAL Y ESTADÍSTICAS');
  console.log('============================================================');
  
  // Test 1: Verificar cálculo básico de NIC con margen gingival (estructura CANÓNICA)
  console.log('\n📊 TEST 1: Cálculo básico de NIC con margen gingival');
  
  const testData1 = {
    teeth: {
      11: {
        available: true,
        bleeding: {
          vestibularSuperior: [0, 0, 0],
          palatinoSuperior: [0, 0, 0],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        plaque: {
          vestibularSuperior: [0, 0, 0],
          palatinoSuperior: [0, 0, 0],
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
          vestibularSuperior: [3, 4, 3],
          palatinoSuperior: [2, 3, 2],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        gingivalMargin: {
          vestibularSuperior: [1, 1, 1], // Margen positivo (hiperplasia)
          palatinoSuperior: [0, 0, 0], // Sin margen
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        }
      }
    }
  };
  
  const stats1 = UniversalToothValidator.calculateStatistics(testData1);
  
  // Cálculo manual:
  // Vestibular sup.: (3-1) + (4-1) + (3-1) = 2 + 3 + 2 = 7
  // Palatino sup.: (2-0) + (3-0) + (2-0) = 2 + 3 + 2 = 7
  // Total: 14, Sitios: 6, Media: 2.33
  const expectedNIC1 = 2.33;
  
  console.log(`Nivel de inserción calculado: ${stats1.averageAttachmentLevel}mm`);
  console.log(`Nivel de inserción esperado: ${expectedNIC1}mm`);
  console.log(`✅ Test 1: ${Math.abs(stats1.averageAttachmentLevel - expectedNIC1) < 0.01 ? 'PASÓ' : 'FALLÓ'}`);
  
  // Test 2: Verificar actualización cuando cambia el margen (estructura CANÓNICA)
  console.log('\n🔄 TEST 2: Actualización cuando cambia el margen gingival');
  
  // Estado inicial sin margen
  const testData2 = {
    teeth: {
      11: {
        available: true,
        bleeding: {
          vestibularSuperior: [0, 0, 0],
          palatinoSuperior: [0, 0, 0],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        plaque: {
          vestibularSuperior: [0, 0, 0],
          palatinoSuperior: [0, 0, 0],
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
          vestibularSuperior: [3, 3, 3],
          palatinoSuperior: [3, 3, 3],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        gingivalMargin: {
          vestibularSuperior: [0, 0, 0], // Sin margen inicial
          palatinoSuperior: [0, 0, 0],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        }
      }
    }
  };
  
  const initialStats = UniversalToothValidator.calculateStatistics(testData2);
  console.log(`NIC inicial (sin margen): ${initialStats.averageAttachmentLevel}mm`);
  
  // Modificar margen gingival
  testData2.teeth[11].gingivalMargin.vestibularSuperior = [1, 1, 1];
  testData2.teeth[11].gingivalMargin.palatinoSuperior = [1, 1, 1];
  
  const updatedStats = UniversalToothValidator.calculateStatistics(testData2);
  console.log(`NIC después de agregar margen: ${updatedStats.averageAttachmentLevel}mm`);
  
  const statsChanged = updatedStats.averageAttachmentLevel !== initialStats.averageAttachmentLevel;
  console.log(`✅ Test 2: ${statsChanged ? 'PASÓ - Las estadísticas se actualizaron' : 'FALLÓ - Las estadísticas NO se actualizaron'}`);
  
  // Test 3: Verificar con margen negativo (recesión) - estructura CANÓNICA
  console.log('\n📉 TEST 3: Margen gingival negativo (recesión)');
  
  const testData3 = {
    teeth: {
      11: {
        available: true,
        bleeding: {
          vestibularSuperior: [0, 0, 0],
          palatinoSuperior: [0, 0, 0],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        plaque: {
          vestibularSuperior: [0, 0, 0],
          palatinoSuperior: [0, 0, 0],
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
          vestibularSuperior: [3, 3, 3],
          palatinoSuperior: [3, 3, 3],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        gingivalMargin: {
          vestibularSuperior: [-1, -1, -1], // Recesión
          palatinoSuperior: [-1, -1, -1],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        }
      }
    }
  };
  
  const stats3 = UniversalToothValidator.calculateStatistics(testData3);
  
  // Cálculo manual con recesión:
  // NIC = Profundidad - Margen = 3 - (-1) = 4 para cada sitio
  // Total: 4 * 6 = 24, Media: 4.0
  const expectedNIC3 = 4.0;
  
  console.log(`NIC con recesión: ${stats3.averageAttachmentLevel}mm`);
  console.log(`NIC esperado: ${expectedNIC3}mm`);
  console.log(`✅ Test 3: ${Math.abs(stats3.averageAttachmentLevel - expectedNIC3) < 0.01 ? 'PASÓ' : 'FALLÓ'}`);
  
  // Test 4: Verificar que el margen gingival se incluye en el cálculo (estructura CANÓNICA)
  console.log('\n🔍 TEST 4: Verificar inclusión del margen gingival');
  
  // Datos con profundidad pero sin margen
  const dataWithoutMargin = {
    teeth: {
      11: {
        available: true,
        bleeding: {
          vestibularSuperior: [0, 0, 0],
          palatinoSuperior: [0, 0, 0],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        plaque: {
          vestibularSuperior: [0, 0, 0],
          palatinoSuperior: [0, 0, 0],
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
          vestibularSuperior: [4, 4, 4],
          palatinoSuperior: [4, 4, 4],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        gingivalMargin: {
          vestibularSuperior: [0, 0, 0],
          palatinoSuperior: [0, 0, 0],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        }
      }
    }
  };
  
  // Datos con profundidad y margen
  const dataWithMargin = {
    teeth: {
      11: {
        available: true,
        bleeding: {
          vestibularSuperior: [0, 0, 0],
          palatinoSuperior: [0, 0, 0],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        plaque: {
          vestibularSuperior: [0, 0, 0],
          palatinoSuperior: [0, 0, 0],
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
          vestibularSuperior: [4, 4, 4],
          palatinoSuperior: [4, 4, 4],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        gingivalMargin: {
          vestibularSuperior: [2, 2, 2], // Margen significativo
          palatinoSuperior: [2, 2, 2],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        }
      }
    }
  };
  
  const statsWithoutMargin = UniversalToothValidator.calculateStatistics(dataWithoutMargin);
  const statsWithMargin = UniversalToothValidator.calculateStatistics(dataWithMargin);
  
  console.log(`NIC sin margen: ${statsWithoutMargin.averageAttachmentLevel}mm`);
  console.log(`NIC con margen: ${statsWithMargin.averageAttachmentLevel}mm`);
  
  const marginImpactsNIC = statsWithMargin.averageAttachmentLevel !== statsWithoutMargin.averageAttachmentLevel;
  console.log(`✅ Test 4: ${marginImpactsNIC ? 'PASÓ - El margen gingival afecta el NIC' : 'FALLÓ - El margen gingival NO afecta el NIC'}`);
  
  // Test 5: Verificar estructura legacy (compatibilidad de UniversalToothValidator)
  console.log('\n🔄 TEST 5: Compatibilidad con estructura legacy');
  
  const legacyData = {
    teeth: {
      11: {
        available: true,
        probingDepth: [3, 4, 3, 2, 3, 2], // 6 sitios
        gingivalMargin: [1, 1, 1, 0, 0, 0] // 6 sitios
      }
    }
  };
  
  const legacyStats = UniversalToothValidator.calculateStatistics(legacyData);
  
  // Cálculo manual legacy:
  // NIC = (3-1)+(4-1)+(3-1)+(2-0)+(3-0)+(2-0) = 2+3+2+2+3+2 = 14
  // Media: 14/6 = 2.33
  const expectedLegacyNIC = 2.33;
  
  console.log(`NIC estructura legacy: ${legacyStats.averageAttachmentLevel}mm`);
  console.log(`NIC esperado: ${expectedLegacyNIC}mm`);
  console.log(`✅ Test 5: ${Math.abs(legacyStats.averageAttachmentLevel - expectedLegacyNIC) < 0.01 ? 'PASÓ' : 'FALLÓ'}`);
  
  console.log('\n============================================================');
  console.log('🎯 RESUMEN DE RESULTADOS:');
  console.log('- Test 1 (Cálculo básico): ' + (Math.abs(stats1.averageAttachmentLevel - expectedNIC1) < 0.01 ? '✅ PASÓ' : '❌ FALLÓ'));
  console.log('- Test 2 (Actualización): ' + (statsChanged ? '✅ PASÓ' : '❌ FALLÓ'));
  console.log('- Test 3 (Recesión): ' + (Math.abs(stats3.averageAttachmentLevel - expectedNIC3) < 0.01 ? '✅ PASÓ' : '❌ FALLÓ'));
  console.log('- Test 4 (Inclusión margen): ' + (marginImpactsNIC ? '✅ PASÓ' : '❌ FALLÓ'));
  console.log('- Test 5 (Legacy): ' + (Math.abs(legacyStats.averageAttachmentLevel - expectedLegacyNIC) < 0.01 ? '✅ PASÓ' : '❌ FALLÓ'));
  
  const allTestsPassed = 
    Math.abs(stats1.averageAttachmentLevel - expectedNIC1) < 0.01 &&
    statsChanged &&
    Math.abs(stats3.averageAttachmentLevel - expectedNIC3) < 0.01 &&
    marginImpactsNIC &&
    Math.abs(legacyStats.averageAttachmentLevel - expectedLegacyNIC) < 0.01;
  
  console.log('\n' + (allTestsPassed ? '🎉 TODOS LOS TESTS PASARON' : '⚠️  ALGUNOS TESTS FALLARON'));
  
  if (allTestsPassed) {
    console.log('✅ El margen gingival se está considerando correctamente en las estadísticas');
    console.log('✅ Las estadísticas se actualizan cuando cambia el margen gingival');
  } else {
    console.log('❌ Hay problemas con el cálculo o actualización de estadísticas de margen gingival');
  }
}

if (require.main === module) {
  testGingivalMarginStatistics();
}

module.exports = { testGingivalMarginStatistics };
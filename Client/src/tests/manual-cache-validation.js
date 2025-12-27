/**
 * SCRIPT DE VALIDACIÓN MANUAL PARA CACHÉ DE ESTADÍSTICAS
 * 
 * Este script permite validar manualmente que la solución de normalización
 * de datos del periodontograma funciona correctamente.
 * 
 * Uso:
 * 1. Importar este script en la consola del navegador
 * 2. Ejecutar las funciones de prueba
 * 3. Verificar que las estadísticas se actualicen en tiempo real
 */

import UniversalToothValidator from '../shared/validators/universal-tooth-validator.js';
import PeriodontogramStateManager from '../features/periodontogram/utils/periodontogram-state-manager.js';

// Configuración de pruebas
const TEST_CONFIG = {
  TOOTH_NUMBER: 11,
  DELAY_BETWEEN_TESTS: 1000, // 1 segundo
  EXPECTED_UPDATE_TIME: 100 // 100ms máximo
};

/**
 * Función principal de validación
 */
export async function validateCacheNormalization() {
  console.log('🧪 INICIANDO VALIDACIÓN DE NORMALIZACIÓN DE CACHÉ');
  console.log('================================================');
  
  try {
    // Limpiar caché inicial
    UniversalToothValidator.invalidateCache();
    console.log('✅ Caché limpiado');
    
    // Ejecutar todas las pruebas
    await testHashConsistency();
    await testCacheInvalidation();
    await testRealTimeUpdates();
    await testPerformance();
    
    console.log('\n🎉 TODAS LAS PRUEBAS COMPLETADAS EXITOSAMENTE');
    console.log('===============================================');
    
  } catch (error) {
    console.error('❌ ERROR EN VALIDACIÓN:', error);
    throw error;
  }
}

/**
 * Prueba de consistencia de hash
 */
export async function testHashConsistency() {
  console.log('\n🔍 Prueba 1: Consistencia de Hash');
  console.log('----------------------------------');
  
  const data1 = {
    teeth: {
      11: {
        bleeding: [1, 0, 1],
        plaque: [0, 1, 0],
        probingDepth: [2, 3, 2]
      }
    }
  };
  
  // Mismo datos, diferente orden de propiedades
  const data2 = {
    teeth: {
      11: {
        probingDepth: [2, 3, 2],
        bleeding: [1, 0, 1],
        plaque: [0, 1, 0]
      }
    }
  };
  
  const hash1 = UniversalToothValidator.generateDataHash(data1);
  const hash2 = UniversalToothValidator.generateDataHash(data2);
  
  console.log(`Hash 1: ${hash1}`);
  console.log(`Hash 2: ${hash2}`);
  
  if (hash1 === hash2) {
    console.log('✅ Hashes consistentes para datos idénticos');
  } else {
    throw new Error('❌ Hashes inconsistentes para datos idénticos');
  }
  
  // Probar con datos diferentes
  const data3 = {
    teeth: {
      11: {
        bleeding: [0, 1, 0], // Diferente
        plaque: [0, 1, 0],
        probingDepth: [2, 3, 2]
      }
    }
  };
  
  const hash3 = UniversalToothValidator.generateDataHash(data3);
  
  if (hash1 !== hash3) {
    console.log('✅ Hashes diferentes para datos diferentes');
  } else {
    throw new Error('❌ Hashes iguales para datos diferentes');
  }
}

/**
 * Prueba de invalidación de caché
 */
export async function testCacheInvalidation() {
  console.log('\n🗑️ Prueba 2: Invalidación de Caché');
  console.log('-----------------------------------');
  
  const stateManager = new PeriodontogramStateManager();
  
  // Configurar datos iniciales
  const initialData = {
    teeth: {
      11: {
        bleeding: [0, 0, 0],
        plaque: [0, 0, 0],
        probingDepth: [1, 1, 1],
        available: true
      }
    }
  };
  
  stateManager.loadData(initialData);
  
  // Calcular estadísticas iniciales (crear entrada en caché)
  const initialStats = stateManager.getBasicStatistics();
  const cacheStatsAfterFirst = UniversalToothValidator.getCacheStats();
  
  console.log(`Estadísticas iniciales - Sangrado: ${initialStats.bleedingPercentage}%`);
  console.log(`Tamaño de caché después del primer cálculo: ${cacheStatsAfterFirst.size}`);
  
  // Actualizar datos
  const updateSuccess = stateManager.updateToothData(11, 'bleeding', [1, 1, 1]);
  
  if (!updateSuccess) {
    throw new Error('❌ Falló la actualización de datos');
  }
  
  // Verificar que las estadísticas cambien
  const updatedStats = stateManager.getBasicStatistics();
  
  console.log(`Estadísticas actualizadas - Sangrado: ${updatedStats.bleedingPercentage}%`);
  
  if (updatedStats.bleedingPercentage > initialStats.bleedingPercentage) {
    console.log('✅ Estadísticas actualizadas correctamente');
  } else {
    throw new Error('❌ Las estadísticas no se actualizaron');
  }
  
  console.log('✅ Invalidación de caché funcionando correctamente');
}

/**
 * Prueba de actualizaciones en tiempo real
 */
export async function testRealTimeUpdates() {
  console.log('\n⚡ Prueba 3: Actualizaciones en Tiempo Real');
  console.log('--------------------------------------------');
  
  const stateManager = new PeriodontogramStateManager();
  
  // Configurar datos de prueba
  const testData = {
    teeth: {
      11: {
        bleeding: [0, 0, 0],
        plaque: [0, 0, 0],
        probingDepth: [2, 2, 2],
        available: true
      },
      12: {
        bleeding: [0, 0, 0],
        plaque: [0, 0, 0],
        probingDepth: [2, 2, 2],
        available: true
      }
    }
  };
  
  stateManager.loadData(testData);
  
  // Serie de actualizaciones rápidas
  const updates = [
    { tooth: 11, field: 'bleeding', value: [1, 0, 1] },
    { tooth: 11, field: 'plaque', value: [0, 1, 0] },
    { tooth: 12, field: 'bleeding', value: [1, 1, 0] },
    { tooth: 12, field: 'probingDepth', value: [4, 3, 5] }
  ];
  
  console.log('Ejecutando serie de actualizaciones rápidas...');
  
  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    const startTime = performance.now();
    
    const success = stateManager.updateToothData(update.tooth, update.field, update.value);
    const stats = stateManager.getBasicStatistics();
    
    const endTime = performance.now();
    const updateTime = endTime - startTime;
    
    console.log(`Actualización ${i + 1}: ${update.field} en diente ${update.tooth}`);
    console.log(`  - Tiempo: ${updateTime.toFixed(2)}ms`);
    console.log(`  - Éxito: ${success}`);
    console.log(`  - Sangrado: ${stats.bleedingPercentage}%`);
    console.log(`  - Placa: ${stats.plaquePercentage}%`);
    
    if (updateTime > TEST_CONFIG.EXPECTED_UPDATE_TIME) {
      console.warn(`⚠️ Actualización lenta: ${updateTime.toFixed(2)}ms > ${TEST_CONFIG.EXPECTED_UPDATE_TIME}ms`);
    }
    
    if (!success) {
      throw new Error(`❌ Falló la actualización ${i + 1}`);
    }
    
    // Pequeña pausa entre actualizaciones
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('✅ Todas las actualizaciones en tiempo real funcionaron correctamente');
}

/**
 * Prueba de rendimiento
 */
export async function testPerformance() {
  console.log('\n🚀 Prueba 4: Rendimiento');
  console.log('-------------------------');
  
  const stateManager = new PeriodontogramStateManager();
  
  // Crear datos de prueba con todos los dientes permanentes
  const permanentTeeth = [
    11, 12, 13, 14, 15, 16, 17, 18,
    21, 22, 23, 24, 25, 26, 27, 28,
    31, 32, 33, 34, 35, 36, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48
  ];
  
  const fullPeriodontogramData = { teeth: {} };
  
  permanentTeeth.forEach(toothNumber => {
    fullPeriodontogramData.teeth[toothNumber] = {
      bleeding: [Math.random() > 0.5 ? 1 : 0, Math.random() > 0.5 ? 1 : 0, Math.random() > 0.5 ? 1 : 0],
      plaque: [Math.random() > 0.5 ? 1 : 0, Math.random() > 0.5 ? 1 : 0, Math.random() > 0.5 ? 1 : 0],
      probingDepth: [Math.floor(Math.random() * 5) + 1, Math.floor(Math.random() * 5) + 1, Math.floor(Math.random() * 5) + 1],
      gingivalMargin: [Math.floor(Math.random() * 3), Math.floor(Math.random() * 3), Math.floor(Math.random() * 3)],
      available: true
    };
  });
  
  stateManager.loadData(fullPeriodontogramData);
  
  // Medir tiempo de cálculo de estadísticas
  const iterations = 10;
  const times = [];
  
  console.log(`Midiendo rendimiento con ${permanentTeeth.length} dientes, ${iterations} iteraciones...`);
  
  for (let i = 0; i < iterations; i++) {
    // Limpiar caché para forzar recálculo
    UniversalToothValidator.invalidateCache();
    
    const startTime = performance.now();
    const stats = stateManager.getBasicStatistics();
    const endTime = performance.now();
    
    const calculationTime = endTime - startTime;
    times.push(calculationTime);
    
    console.log(`Iteración ${i + 1}: ${calculationTime.toFixed(2)}ms`);
  }
  
  const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);
  
  console.log(`\nResultados de rendimiento:`);
  console.log(`  - Tiempo promedio: ${averageTime.toFixed(2)}ms`);
  console.log(`  - Tiempo máximo: ${maxTime.toFixed(2)}ms`);
  console.log(`  - Tiempo mínimo: ${minTime.toFixed(2)}ms`);
  
  if (averageTime < TEST_CONFIG.EXPECTED_UPDATE_TIME) {
    console.log('✅ Rendimiento dentro de los límites esperados');
  } else {
    console.warn(`⚠️ Rendimiento por debajo de lo esperado: ${averageTime.toFixed(2)}ms > ${TEST_CONFIG.EXPECTED_UPDATE_TIME}ms`);
  }
}

/**
 * Función de utilidad para mostrar estadísticas del caché
 */
export function showCacheStats() {
  const stats = UniversalToothValidator.getCacheStats();
  console.log('📊 Estadísticas del Caché:');
  console.log(`  - Tamaño actual: ${stats.size}`);
  console.log(`  - Tamaño máximo: ${stats.maxSize}`);
  console.log(`  - TTL: ${stats.ttl}ms`);
  return stats;
}

/**
 * Función de utilidad para limpiar caché
 */
export function clearCache() {
  UniversalToothValidator.invalidateCache();
  console.log('🧹 Caché limpiado');
}

// Exportar configuración para uso externo
export { TEST_CONFIG };

// Función de ayuda para ejecutar todas las pruebas desde la consola
if (typeof window !== 'undefined') {
  window.validatePeriodontogramCache = validateCacheNormalization;
  window.showCacheStats = showCacheStats;
  window.clearCache = clearCache;
  
  console.log('🔧 Funciones de validación disponibles en window:');
  console.log('  - validatePeriodontogramCache()');
  console.log('  - showCacheStats()');
  console.log('  - clearCache()');
}
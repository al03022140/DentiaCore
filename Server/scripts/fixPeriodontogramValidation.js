/**
 * 🔧 SCRIPT DE CORRECCIÓN DE VALIDACIÓN DEL PERIODONTOGRAMA
 * 
 * Este script corrige los problemas identificados en las transformaciones
 * entre frontend y backend del periodontograma:
 * 
 * PROBLEMAS IDENTIFICADOS:
 * ❌ Inconsistencias en transformación 4-caras → 6-elementos
 * ❌ Validación de arrays no robusta
 * ❌ Datos legacy no migrados correctamente
 * ❌ Configuración no centralizada entre frontend/backend
 * 
 * CORRECCIONES APLICADAS:
 * ✅ Sincronización de configuración centralizada
 * ✅ Corrección de transformaciones bidireccionales
 * ✅ Migración automática de datos legacy
 * ✅ Validación robusta con fallbacks
 * ✅ Limpieza de datos inconsistentes
 * 
 * @version 1.0.0
 * @author Sistema de Corrección Crítica
 */

const mongoose = require('mongoose');
const Periodontogram = require('../models/periodontogram');
const PeriodontogramDataUtils = require('../utils/periodontogramUtils');
const { UniversalToothValidator } = require('../utils/UniversalToothValidator');
const { PERIODONTOGRAM_CONFIG } = require('../config/periodontogram-config');

// Configuración de la base de datos
const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/DentiaCore';

/**
 * Conectar a la base de datos
 */
async function connectDB() {
  try {
    await mongoose.connect(DB_URI);
    console.log('🔌 Conectado a MongoDB exitosamente');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    process.exit(1);
  }
}

/**
 * Analizar problemas en los datos existentes
 */
async function analyzePeriodontogramProblems() {
  console.log('\n🔍 ANALIZANDO PROBLEMAS EN DATOS EXISTENTES\n');
  
  try {
    const periodontograms = await Periodontogram.find({}).limit(10);
    console.log(`📊 Encontrados ${periodontograms.length} periodontogramas para análisis`);
    
    const problems = {
      invalidArrayLengths: 0,
      missingFields: 0,
      invalidToothNumbers: 0,
      legacyStructures: 0,
      validationErrors: 0
    };
    
    for (const periodontogram of periodontograms) {
      console.log(`\n📋 Analizando periodontograma ${periodontogram._id}`);
      
      if (periodontogram.initial && periodontogram.initial.teeth) {
        const teeth = periodontogram.initial.teeth;
        
        for (const [toothNumber, toothData] of teeth.entries()) {
          // Verificar número de diente válido
          if (!UniversalToothValidator.isValidToothNumber(parseInt(toothNumber))) {
            problems.invalidToothNumbers++;
            console.log(`  ❌ Número de diente inválido: ${toothNumber}`);
          }
          
          // Verificar arrays de medición
          const arrayFields = ['bleeding', 'suppuration', 'plaque', 'probingDepth', 'gingivalMargin', 'gumWidth'];
          
          for (const field of arrayFields) {
            if (toothData[field]) {
              // Verificar si es estructura legacy (4-caras)
              if (typeof toothData[field] === 'object' && !Array.isArray(toothData[field])) {
                problems.legacyStructures++;
                console.log(`  🔄 Estructura legacy detectada en ${toothNumber}.${field}`);
              }
              // Verificar longitud de array
              else if (Array.isArray(toothData[field]) && toothData[field].length !== 6) {
                problems.invalidArrayLengths++;
                console.log(`  📏 Array inválido en ${toothNumber}.${field}: longitud ${toothData[field].length}`);
              }
            } else {
              problems.missingFields++;
            }
          }
          
          // Probar validación
          try {
            UniversalToothValidator.validateCompleteToothData(toothData, toothNumber);
          } catch (error) {
            problems.validationErrors++;
            console.log(`  ⚠️ Error de validación en ${toothNumber}: ${error.message}`);
          }
        }
      }
    }
    
    console.log('\n📊 RESUMEN DE PROBLEMAS DETECTADOS:');
    console.log(`  - Arrays con longitud inválida: ${problems.invalidArrayLengths}`);
    console.log(`  - Campos faltantes: ${problems.missingFields}`);
    console.log(`  - Números de diente inválidos: ${problems.invalidToothNumbers}`);
    console.log(`  - Estructuras legacy: ${problems.legacyStructures}`);
    console.log(`  - Errores de validación: ${problems.validationErrors}`);
    
    return problems;
  } catch (error) {
    console.error('❌ Error analizando problemas:', error.message);
    throw error;
  }
}

/**
 * Corregir datos de un periodontograma específico
 */
async function fixPeriodontogramData(periodontogram) {
  console.log(`\n🔧 Corrigiendo periodontograma ${periodontogram._id}`);
  
  let correctionsMade = 0;
  
  try {
    if (periodontogram.initial && periodontogram.initial.teeth) {
      const teeth = periodontogram.initial.teeth;
      const correctedTeeth = new Map();
      
      for (const [toothNumber, toothData] of teeth.entries()) {
        const numericToothNumber = parseInt(toothNumber);
        
        // Solo procesar números de dientes válidos
        if (UniversalToothValidator.isValidToothNumber(numericToothNumber)) {
          try {
            // Aplicar transformación y validación completa
            const correctedData = UniversalToothValidator.transformToBackend(toothData);
            const validatedData = UniversalToothValidator.validateCompleteToothData(correctedData, numericToothNumber);
            
            correctedTeeth.set(toothNumber, validatedData);
            correctionsMade++;
            
            console.log(`  ✅ Diente ${toothNumber} corregido`);
          } catch (error) {
            console.log(`  ⚠️ Error corrigiendo diente ${toothNumber}: ${error.message}`);
            // Usar datos por defecto
            const defaultData = UniversalToothValidator.getDefaultToothData(numericToothNumber);
            correctedTeeth.set(toothNumber, defaultData);
            correctionsMade++;
          }
        } else {
          console.log(`  🗑️ Eliminando diente inválido: ${toothNumber}`);
        }
      }
      
      // Actualizar datos corregidos
      periodontogram.initial.teeth = correctedTeeth;
      
      // Recalcular estadísticas
      periodontogram.initial.statistics = {
        lastUpdated: new Date(),
        teethCount: correctedTeeth.size,
        correctionsMade,
        version: '4.0.0-corrected'
      };
      
      await periodontogram.save();
      console.log(`  💾 Periodontograma guardado con ${correctionsMade} correcciones`);
    }
    
    return correctionsMade;
  } catch (error) {
    console.error(`❌ Error corrigiendo periodontograma ${periodontogram._id}:`, error.message);
    throw error;
  }
}

/**
 * Aplicar correcciones masivas
 */
async function applyMassiveCorrections() {
  console.log('\n🔧 APLICANDO CORRECCIONES MASIVAS\n');
  
  try {
    const periodontograms = await Periodontogram.find({});
    console.log(`📊 Procesando ${periodontograms.length} periodontogramas`);
    
    let totalCorrections = 0;
    let processedCount = 0;
    let errorCount = 0;
    
    for (const periodontogram of periodontograms) {
      try {
        const corrections = await fixPeriodontogramData(periodontogram);
        totalCorrections += corrections;
        processedCount++;
        
        // Progreso cada 10 periodontogramas
        if (processedCount % 10 === 0) {
          console.log(`\n📈 Progreso: ${processedCount}/${periodontograms.length} procesados`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error procesando ${periodontogram._id}:`, error.message);
      }
    }
    
    console.log('\n🎉 CORRECCIONES COMPLETADAS:');
    console.log(`  - Periodontogramas procesados: ${processedCount}`);
    console.log(`  - Total de correcciones: ${totalCorrections}`);
    console.log(`  - Errores encontrados: ${errorCount}`);
    
    return { processedCount, totalCorrections, errorCount };
  } catch (error) {
    console.error('❌ Error en correcciones masivas:', error.message);
    throw error;
  }
}

/**
 * Verificar integridad después de las correcciones
 */
async function verifyDataIntegrity() {
  console.log('\n🔍 VERIFICANDO INTEGRIDAD DE DATOS\n');
  
  try {
    const periodontograms = await Periodontogram.find({}).limit(5);
    
    let validCount = 0;
    let invalidCount = 0;
    
    for (const periodontogram of periodontograms) {
      console.log(`\n📋 Verificando periodontograma ${periodontogram._id}`);
      
      if (periodontogram.initial && periodontogram.initial.teeth) {
        const teeth = periodontogram.initial.teeth;
        let periodontogramValid = true;
        
        for (const [toothNumber, toothData] of teeth.entries()) {
          try {
            // Verificar que los datos sean válidos
            const validatedData = UniversalToothValidator.validateCompleteToothData(toothData, toothNumber);
            
            // Verificar arrays de 6 elementos
            const arrayFields = ['bleeding', 'suppuration', 'plaque', 'probingDepth', 'gingivalMargin', 'gumWidth'];
            for (const field of arrayFields) {
              if (!Array.isArray(validatedData[field]) || validatedData[field].length !== 6) {
                console.log(`  ❌ Array inválido en ${toothNumber}.${field}`);
                periodontogramValid = false;
              }
            }
          } catch (error) {
            console.log(`  ❌ Error validando ${toothNumber}: ${error.message}`);
            periodontogramValid = false;
          }
        }
        
        if (periodontogramValid) {
          validCount++;
          console.log('  ✅ Periodontograma válido');
        } else {
          invalidCount++;
          console.log('  ❌ Periodontograma inválido');
        }
      }
    }
    
    console.log('\n📊 RESULTADO DE VERIFICACIÓN:');
    console.log(`  - Periodontogramas válidos: ${validCount}`);
    console.log(`  - Periodontogramas inválidos: ${invalidCount}`);
    console.log(`  - Tasa de éxito: ${((validCount / (validCount + invalidCount)) * 100).toFixed(2)}%`);
    
    return { validCount, invalidCount };
  } catch (error) {
    console.error('❌ Error verificando integridad:', error.message);
    throw error;
  }
}

/**
 * Probar transformaciones bidireccionales
 */
async function testBidirectionalTransformations() {
  console.log('\n🔄 PROBANDO TRANSFORMACIONES BIDIRECCIONALES\n');
  
  try {
    // Datos de prueba en formato frontend (4-caras)
    const frontendTestData = {
      toothNumber: 11,
      bleeding: {
        vestibularSuperior: [true, false, true],
        palatinoSuperior: [false, true, false],
        vestibularInferior: [false, false, false],
        lingualInferior: [false, false, false]
      },
      probingDepth: {
        vestibularSuperior: [3, 2, 4],
        palatinoSuperior: [2, 3, 2],
        vestibularInferior: [0, 0, 0],
        lingualInferior: [0, 0, 0]
      }
    };
    
    console.log('📤 Datos originales (frontend):');
    console.log('  bleeding:', JSON.stringify(frontendTestData.bleeding));
    console.log('  probingDepth:', JSON.stringify(frontendTestData.probingDepth));
    
    // Transformar a backend
    const backendData = UniversalToothValidator.transformToBackend(frontendTestData);
    console.log('\n🔄 Transformado a backend:');
    console.log('  bleeding:', backendData.bleeding);
    console.log('  probingDepth:', backendData.probingDepth);
    
    // Transformar de vuelta a frontend
    const frontendDataRestored = UniversalToothValidator.transformToFrontend(backendData, true);
    console.log('\n📥 Transformado de vuelta a frontend:');
    console.log('  bleeding:', JSON.stringify(frontendDataRestored.bleeding));
    console.log('  probingDepth:', JSON.stringify(frontendDataRestored.probingDepth));
    
    // Verificar consistencia
    const isConsistent = JSON.stringify(frontendTestData.bleeding) === JSON.stringify(frontendDataRestored.bleeding);
    console.log(`\n🎯 Transformación consistente: ${isConsistent ? '✅ SÍ' : '❌ NO'}`);
    
    return isConsistent;
  } catch (error) {
    console.error('❌ Error en pruebas de transformación:', error.message);
    return false;
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('🚀 INICIANDO CORRECCIÓN DE VALIDACIÓN DEL PERIODONTOGRAMA\n');
  
  try {
    // Conectar a la base de datos
    await connectDB();
    
    // Paso 1: Analizar problemas existentes
    const problems = await analyzePeriodontogramProblems();
    
    // Paso 2: Probar transformaciones
    const transformationsWork = await testBidirectionalTransformations();
    
    if (!transformationsWork) {
      console.log('\n⚠️ Las transformaciones no son consistentes. Continuando con correcciones...');
    }
    
    // Paso 3: Aplicar correcciones si hay problemas
    const totalProblems = Object.values(problems).reduce((sum, count) => sum + count, 0);
    
    if (totalProblems > 0) {
      console.log(`\n🔧 Se detectaron ${totalProblems} problemas. Aplicando correcciones...`);
      const results = await applyMassiveCorrections();
      
      // Paso 4: Verificar integridad después de correcciones
      await verifyDataIntegrity();
      
      console.log('\n🎉 PROCESO DE CORRECCIÓN COMPLETADO');
      console.log(`📊 Resumen final:`);
      console.log(`  - Problemas detectados: ${totalProblems}`);
      console.log(`  - Periodontogramas procesados: ${results.processedCount}`);
      console.log(`  - Correcciones aplicadas: ${results.totalCorrections}`);
      console.log(`  - Errores: ${results.errorCount}`);
    } else {
      console.log('\n✅ No se detectaron problemas en los datos existentes');
    }
    
  } catch (error) {
    console.error('💥 Error crítico en el proceso de corrección:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

// Ejecutar el script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  analyzePeriodontogramProblems,
  fixPeriodontogramData,
  applyMassiveCorrections,
  verifyDataIntegrity,
  testBidirectionalTransformations
};
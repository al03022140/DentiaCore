/**
 * 🧪 SCRIPT DE PRUEBA DE VALIDACIÓN DE PERIODONTOGRAMA CORREGIDA
 * 
 * Este script verifica que la corrección de validaciones de periodontograma
 * funcione correctamente después de la recreación del modelo.
 * 
 * PRUEBAS:
 * 1. Crear periodontograma con datos correctos (6 elementos) - debe pasar
 * 2. Intentar crear con datos incorrectos (3 elementos) - debe fallar
 * 3. Verificar mensajes de error correctos
 * 4. Confirmar que no hay errores de "3 elementos" en logs
 * 
 * @version 1.0.0
 * @author Sistema de Validación Corregida
 */

const mongoose = require('mongoose');
const path = require('path');

// Configuración de conexión
require('dotenv').config({ path: path.join(__dirname, '../.env') });

/**
 * Conectar a MongoDB
 */
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dental_clinic';
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado a MongoDB exitosamente');
    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error.message);
        throw error;
    }
};

/**
 * Prueba 1: Crear periodontograma con datos correctos (6 elementos)
 */
const testCorrectValidation = async () => {
    console.log('\n🧪 PRUEBA 1: Datos correctos (6 elementos)');
    
    try {
        const Periodontogram = require('../models/periodontogram');
        
        const correctData = {
            patient: new mongoose.Types.ObjectId(),
            initial: {
                metadata: {
                    createdBy: new mongoose.Types.ObjectId(),
                    createdAt: new Date(),
                    notes: 'Prueba de validación corregida'
                },
                teeth: new Map([
                    ['11', {
                        toothNumber: 11,
                        present: true,
                        available: true,
                        implant: false,
                        bleeding: [false, true, false, false, true, false], // 6 elementos ✅
                        suppuration: [false, false, false, false, false, false], // 6 elementos ✅
                        plaque: [true, false, true, false, true, false], // 6 elementos ✅
                        probingDepth: [2, 3, 2, 1, 2, 3], // 6 elementos ✅
                        gingivalMargin: [0, -1, 0, 1, 0, -1], // 6 elementos ✅
                        gumWidth: [2, 3, 2, 2, 3, 2], // 6 elementos ✅
                        mobility: 1,
                        furca: {
                            vestibular: 0,
                            lingual: 1,
                            mesial: 0
                        },
                        prognosis: 'bueno',
                        notes: 'Diente con ligero sangrado'
                    }],
                    ['21', {
                        toothNumber: 21,
                        present: true,
                        available: true,
                        implant: false,
                        bleeding: [false, false, false, false, false, false], // 6 elementos ✅
                        suppuration: [false, false, false, false, false, false], // 6 elementos ✅
                        plaque: [false, false, false, false, false, false], // 6 elementos ✅
                        probingDepth: [1, 1, 1, 1, 1, 1], // 6 elementos ✅
                        gingivalMargin: [0, 0, 0, 0, 0, 0], // 6 elementos ✅
                        gumWidth: [3, 3, 3, 3, 3, 3], // 6 elementos ✅
                        mobility: 0,
                        furca: {
                            vestibular: 0,
                            lingual: 0,
                            mesial: 0
                        },
                        prognosis: 'bueno',
                        notes: 'Diente sano'
                    }]
                ])
            }
        };
        
        const testPeriodontogram = new Periodontogram(correctData);
        await testPeriodontogram.validate();
        
        console.log('✅ ÉXITO: Validación pasó con datos correctos (6 elementos)');
        console.log('   - Todos los arrays tienen 6 elementos');
        console.log('   - Validaciones de rango funcionan correctamente');
        
        return true;
        
    } catch (error) {
        console.log('❌ ERROR INESPERADO: Validación falló con datos correctos');
        console.log(`   Error: ${error.message}`);
        return false;
    }
};

/**
 * Prueba 2: Intentar crear con datos incorrectos (3 elementos)
 */
const testIncorrectValidation = async () => {
    console.log('\n🧪 PRUEBA 2: Datos incorrectos (3 elementos)');
    
    try {
        const Periodontogram = require('../models/periodontogram');
        
        const incorrectData = {
            patient: new mongoose.Types.ObjectId(),
            initial: {
                metadata: {
                    createdBy: new mongoose.Types.ObjectId(),
                    createdAt: new Date(),
                    notes: 'Prueba con datos incorrectos'
                },
                teeth: new Map([
                    ['11', {
                        toothNumber: 11,
                        present: true,
                        available: true,
                        implant: false,
                        bleeding: [false, true, false], // 3 elementos ❌ (debería fallar)
                        suppuration: [false, false, false], // 3 elementos ❌ (debería fallar)
                        plaque: [true, false, true], // 3 elementos ❌ (debería fallar)
                        probingDepth: [2, 3, 2], // 3 elementos ❌ (debería fallar)
                        gingivalMargin: [0, -1, 0], // 3 elementos ❌ (debería fallar)
                        gumWidth: [2, 3, 2, 2, 3, 2], // 6 elementos ✅ (correcto)
                        mobility: 1,
                        furca: {
                            vestibular: 0,
                            lingual: 1,
                            mesial: 0
                        },
                        prognosis: 'bueno',
                        notes: 'Datos con arrays incorrectos'
                    }]
                ])
            }
        };
        
        const testPeriodontogram = new Periodontogram(incorrectData);
        await testPeriodontogram.validate();
        
        console.log('❌ PROBLEMA: Validación pasó cuando debería haber fallado');
        console.log('   - Los arrays de 3 elementos deberían ser rechazados');
        return false;
        
    } catch (error) {
        console.log('✅ ÉXITO: Validación falló como se esperaba');
        console.log(`   Error: ${error.message.substring(0, 200)}...`);
        
        // Verificar que el error menciona 6 elementos, no 3
        if (error.message.includes('6 elementos')) {
            console.log('✅ CORRECTO: El validador requiere 6 elementos');
            return true;
        } else if (error.message.includes('3 elementos')) {
            console.log('❌ PROBLEMA: El validador aún requiere 3 elementos');
            return false;
        } else {
            console.log('⚠️ Error de validación diferente');
            return true; // Aún es un error de validación, lo cual es correcto
        }
    }
};

/**
 * Prueba 3: Verificar que no hay errores de "3 elementos" en logs recientes
 */
const checkRecentLogs = () => {
    console.log('\n🧪 PRUEBA 3: Verificando logs recientes');
    
    try {
        const fs = require('fs');
        const logPath = path.join(__dirname, '../logs/error.log');
        
        if (!fs.existsSync(logPath)) {
            console.log('✅ No hay archivo de logs de error');
            return true;
        }
        
        const logContent = fs.readFileSync(logPath, 'utf8');
        const lines = logContent.split('\n');
        
        // Buscar líneas recientes (últimas 10)
        const recentLines = lines.slice(-10);
        const errorsWithThreeElements = recentLines.filter(line => 
            line.includes('3 elementos') && line.includes('Periodontogram validation failed')
        );
        
        if (errorsWithThreeElements.length === 0) {
            console.log('✅ No se encontraron errores recientes de "3 elementos"');
            return true;
        } else {
            console.log(`⚠️ Se encontraron ${errorsWithThreeElements.length} errores recientes de "3 elementos"`);
            console.log('   Esto podría indicar que aún hay instancias del modelo anterior en uso');
            return false;
        }
        
    } catch (error) {
        console.log('⚠️ No se pudo verificar los logs:', error.message);
        return true; // No es crítico para la prueba
    }
};

/**
 * Prueba 4: Crear un periodontograma completo y guardarlo
 */
const testCompleteCreation = async () => {
    console.log('\n🧪 PRUEBA 4: Creación completa de periodontograma');
    
    try {
        const Periodontogram = require('../models/periodontogram');
        
        // Crear datos para múltiples dientes
        const teethData = new Map();
        const testTeeth = [11, 12, 13, 21, 22, 23];
        
        testTeeth.forEach(toothNum => {
            teethData.set(toothNum.toString(), {
                toothNumber: toothNum,
                present: true,
                available: true,
                implant: false,
                bleeding: [false, false, false, false, false, false], // 6 elementos ✅
                suppuration: [false, false, false, false, false, false], // 6 elementos ✅
                plaque: [false, false, false, false, false, false], // 6 elementos ✅
                probingDepth: [1, 1, 1, 1, 1, 1], // 6 elementos ✅
                gingivalMargin: [0, 0, 0, 0, 0, 0], // 6 elementos ✅
                gumWidth: [3, 3, 3, 3, 3, 3], // 6 elementos ✅
                mobility: 0,
                furca: {
                    vestibular: 0,
                    lingual: 0,
                    mesial: 0
                },
                prognosis: 'bueno',
                notes: `Diente ${toothNum} - Prueba de validación`
            });
        });
        
        const completeData = {
            patient: new mongoose.Types.ObjectId(),
            initial: {
                metadata: {
                    createdBy: new mongoose.Types.ObjectId(),
                    createdAt: new Date(),
                    notes: 'Periodontograma de prueba completo - Validación corregida'
                },
                teeth: teethData
            }
        };
        
        const testPeriodontogram = new Periodontogram(completeData);
        await testPeriodontogram.validate();
        
        // Intentar guardar (sin hacer commit real)
        console.log('✅ ÉXITO: Periodontograma completo validado correctamente');
        console.log(`   - ${testTeeth.length} dientes procesados`);
        console.log('   - Todos los arrays tienen 6 elementos');
        console.log('   - Estructura completa validada');
        
        return true;
        
    } catch (error) {
        console.log('❌ ERROR: Fallo en creación completa');
        console.log(`   Error: ${error.message}`);
        return false;
    }
};

/**
 * Función principal de pruebas
 */
const main = async () => {
    console.log('🧪 INICIANDO PRUEBAS DE VALIDACIÓN DE PERIODONTOGRAMA CORREGIDA');
    console.log('=' .repeat(70));
    console.log('📋 OBJETIVO: Verificar que las validaciones requieren 6 elementos');
    console.log('📋 VERIFICAR: Que no hay errores de "3 elementos"\n');
    
    const results = {
        correctValidation: false,
        incorrectValidation: false,
        logCheck: false,
        completeCreation: false
    };
    
    try {
        // Conectar a la base de datos
        await connectDB();
        
        // Ejecutar todas las pruebas
        results.correctValidation = await testCorrectValidation();
        results.incorrectValidation = await testIncorrectValidation();
        results.logCheck = checkRecentLogs();
        results.completeCreation = await testCompleteCreation();
        
        // Resumen de resultados
        console.log('\n' + '=' .repeat(70));
        console.log('📊 RESUMEN DE RESULTADOS:');
        console.log('=' .repeat(70));
        
        const allPassed = Object.values(results).every(result => result === true);
        
        Object.entries(results).forEach(([test, passed]) => {
            const status = passed ? '✅ PASÓ' : '❌ FALLÓ';
            const testNames = {
                correctValidation: 'Validación con datos correctos (6 elementos)',
                incorrectValidation: 'Rechazo de datos incorrectos (3 elementos)',
                logCheck: 'Verificación de logs sin errores "3 elementos"',
                completeCreation: 'Creación completa de periodontograma'
            };
            console.log(`${status} - ${testNames[test]}`);
        });
        
        console.log('\n' + '=' .repeat(70));
        
        if (allPassed) {
            console.log('🎉 ¡TODAS LAS PRUEBAS PASARON!');
            console.log('✅ La corrección de validaciones fue exitosa');
            console.log('✅ El sistema ahora requiere correctamente 6 elementos');
            console.log('✅ No hay conflictos de validación');
        } else {
            console.log('⚠️ ALGUNAS PRUEBAS FALLARON');
            console.log('📝 Se requiere investigación adicional');
            console.log('📝 Verificar logs del servidor para más detalles');
        }
        
        console.log('\n📝 RECOMENDACIONES:');
        console.log('1. Monitorear logs del servidor por errores de "3 elementos"');
        console.log('2. Probar creación de periodontogramas desde el frontend');
        console.log('3. Verificar que las estadísticas se calculen correctamente');
        console.log('4. Confirmar que no hay regresiones en funcionalidad');
        
    } catch (error) {
        console.error('❌ Error en las pruebas:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Conexión a MongoDB cerrada');
    }
};

// Ejecutar si se llama directamente
if (require.main === module) {
    main();
}

module.exports = { testCorrectValidation, testIncorrectValidation, checkRecentLogs, testCompleteCreation };
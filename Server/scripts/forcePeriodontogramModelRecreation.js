/**
 * 🔧 SCRIPT DE RECREACIÓN FORZADA DEL MODELO PERIODONTOGRAM
 * 
 * Este script fuerza la recreación completa del modelo Periodontogram
 * para resolver el conflicto entre validaciones de 3 y 6 elementos.
 * 
 * PROBLEMA IDENTIFICADO:
 * - El esquema actual requiere 6 elementos
 * - Los logs muestran errores de "3 elementos"
 * - Hay una versión anterior del modelo en caché
 * 
 * SOLUCIÓN:
 * 1. Eliminar completamente el modelo de Mongoose
 * 2. Limpiar caché de Node.js
 * 3. Recrear el modelo desde cero
 * 4. Verificar que las validaciones sean correctas
 * 
 * @version 1.0.0
 * @author Sistema de Corrección de Validaciones
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
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/DentiaCore';
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado a MongoDB exitosamente');
    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error.message);
        throw error;
    }
};

/**
 * Limpiar completamente el modelo Periodontogram
 */
const forceModelCleanup = () => {
    console.log('🧹 Limpiando modelo Periodontogram completamente...');
    
    // 1. Eliminar del registro de modelos de Mongoose
    if (mongoose.models.Periodontogram) {
        delete mongoose.models.Periodontogram;
        console.log('✅ Modelo eliminado de mongoose.models');
    }
    
    // 2. Eliminar del registro de conexión
    if (mongoose.connection.models.Periodontogram) {
        delete mongoose.connection.models.Periodontogram;
        console.log('✅ Modelo eliminado de mongoose.connection.models');
    }
    
    // 3. Eliminar esquemas compilados
    if (mongoose.modelSchemas && mongoose.modelSchemas.Periodontogram) {
        delete mongoose.modelSchemas.Periodontogram;
        console.log('✅ Esquema eliminado de mongoose.modelSchemas');
    }
    
    // 4. Limpiar caché de require de Node.js
    const modelPath = path.resolve(__dirname, '../models/periodontogram.js');
    if (require.cache[modelPath]) {
        delete require.cache[modelPath];
        console.log('✅ Caché de require limpiado');
    }
    
    // 5. Limpiar cualquier referencia en el registro de esquemas
    Object.keys(require.cache).forEach(key => {
        if (key.includes('periodontogram')) {
            delete require.cache[key];
            console.log(`✅ Caché limpiado: ${key}`);
        }
    });
};

/**
 * Recrear el modelo desde cero
 */
const recreateModel = () => {
    console.log('🔄 Recreando modelo Periodontogram desde cero...');
    
    try {
        // Importar el modelo fresco
        const Periodontogram = require('../models/periodontogram');
        console.log('✅ Modelo Periodontogram recreado exitosamente');
        return Periodontogram;
    } catch (error) {
        console.error('❌ Error recreando modelo:', error.message);
        throw error;
    }
};

/**
 * Verificar las validaciones del modelo recreado
 */
const verifyRecreatedModel = async (Periodontogram) => {
    console.log('🔍 Verificando validaciones del modelo recreado...');
    
    try {
        // Crear datos de prueba con arrays de 3 elementos (debería fallar)
        const testData = {
            patient: new mongoose.Types.ObjectId(),
            initial: {
                metadata: {
                    createdBy: new mongoose.Types.ObjectId()
                },
                teeth: new Map([
                    ['11', {
                        toothNumber: 11,
                        present: true,
                        available: true,
                        implant: false,
                        bleeding: [false, false, false], // 3 elementos - debería fallar
                        suppuration: [false, false, false], // 3 elementos - debería fallar
                        plaque: [false, false, false], // 3 elementos - debería fallar
                        probingDepth: [1, 2, 3], // 3 elementos - debería fallar
                        gingivalMargin: [0, 1, 2], // 3 elementos - debería fallar
                        gumWidth: [0, 0, 0, 0, 0, 0], // 6 elementos - correcto
                        mobility: 0,
                        furca: {
                            vestibular: 0,
                            lingual: 0,
                            mesial: 0
                        },
                        prognosis: 'bueno',
                        notes: ''
                    }]
                ])
            }
        };
        
        const testPeriodontogram = new Periodontogram(testData);
        
        // Intentar validar
        await testPeriodontogram.validate();
        console.log('⚠️ PROBLEMA: Validación pasó cuando debería haber fallado (arrays de 3 elementos)');
        return false;
        
    } catch (error) {
        console.log('✅ Validación falló como se esperaba:');
        console.log(`   Error: ${error.message}`);
        
        // Verificar si el error menciona 6 elementos (correcto)
        if (error.message.includes('6 elementos')) {
            console.log('✅ ÉXITO: El validador está requiriendo 6 elementos correctamente');
            return true;
        } else if (error.message.includes('3 elementos')) {
            console.log('❌ PROBLEMA PERSISTE: El validador sigue requiriendo 3 elementos');
            return false;
        } else {
            console.log('⚠️ Error de validación diferente:', error.message);
            return false;
        }
    }
};

/**
 * Probar con datos correctos (6 elementos)
 */
const testCorrectData = async (Periodontogram) => {
    console.log('🧪 Probando con datos correctos (6 elementos)...');
    
    try {
        const correctData = {
            patient: new mongoose.Types.ObjectId(),
            initial: {
                metadata: {
                    createdBy: new mongoose.Types.ObjectId()
                },
                teeth: new Map([
                    ['11', {
                        toothNumber: 11,
                        present: true,
                        available: true,
                        implant: false,
                        bleeding: [false, false, false, false, false, false], // 6 elementos - correcto
                        suppuration: [false, false, false, false, false, false], // 6 elementos - correcto
                        plaque: [false, false, false, false, false, false], // 6 elementos - correcto
                        probingDepth: [1, 2, 3, 1, 2, 3], // 6 elementos - correcto
                        gingivalMargin: [0, 1, 2, 0, 1, 2], // 6 elementos - correcto
                        gumWidth: [0, 0, 0, 0, 0, 0], // 6 elementos - correcto
                        mobility: 0,
                        furca: {
                            vestibular: 0,
                            lingual: 0,
                            mesial: 0
                        },
                        prognosis: 'bueno',
                        notes: ''
                    }]
                ])
            }
        };
        
        const testPeriodontogram = new Periodontogram(correctData);
        await testPeriodontogram.validate();
        console.log('✅ Validación exitosa con datos correctos (6 elementos)');
        return true;
        
    } catch (error) {
        console.log('❌ Error inesperado con datos correctos:', error.message);
        return false;
    }
};

/**
 * Función principal
 */
const main = async () => {
    console.log('🚀 Iniciando recreación forzada del modelo Periodontogram...');
    console.log('📋 OBJETIVO: Resolver conflicto entre validaciones de 3 y 6 elementos\n');
    
    try {
        // 1. Conectar a la base de datos
        await connectDB();
        
        // 2. Limpiar completamente el modelo
        forceModelCleanup();
        
        // 3. Recrear el modelo desde cero
        const Periodontogram = recreateModel();
        
        // 4. Verificar validaciones con datos incorrectos
        const incorrectValidation = await verifyRecreatedModel(Periodontogram);
        
        // 5. Verificar validaciones con datos correctos
        const correctValidation = await testCorrectData(Periodontogram);
        
        // 6. Resultado final
        if (incorrectValidation && correctValidation) {
            console.log('\n🎉 ¡ÉXITO COMPLETO!');
            console.log('✅ El modelo ha sido recreado correctamente');
            console.log('✅ Las validaciones funcionan como se esperaba');
            console.log('✅ Requiere 6 elementos para arrays de mediciones');
        } else {
            console.log('\n⚠️ RECREACIÓN PARCIAL');
            console.log('❌ Algunas validaciones no funcionan correctamente');
            console.log('📝 Se requiere investigación adicional');
        }
        
        console.log('\n📝 PRÓXIMOS PASOS:');
        console.log('1. Reiniciar el servidor Node.js completamente');
        console.log('2. Probar la creación/actualización de periodontogramas');
        console.log('3. Verificar que los errores de "3 elementos" hayan desaparecido');
        console.log('4. Monitorear los logs para confirmar la corrección');
        
    } catch (error) {
        console.error('❌ Error en el proceso de recreación:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Conexión a MongoDB cerrada');
    }
};

// Ejecutar si se llama directamente
if (require.main === module) {
    main();
}

module.exports = { forceModelCleanup, recreateModel, verifyRecreatedModel, testCorrectData };
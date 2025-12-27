const mongoose = require('mongoose');
const logger = require('../utils/logger');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// Espera utilitaria (promesa)
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const connectDB = async (options = {}) => {
    if (options.skip) {
        logger.info('⏭️  Conexión a MongoDB omitida por configuración de pruebas');
        return;
    }

    const uri = options.uri || process.env.MONGODB_URI;
    const maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : 5;
    const baseDelayMs = Number.isInteger(options.baseDelayMs) ? options.baseDelayMs : 1000; // 1s base
    const exitOnFail = options.exitOnFail !== undefined ? options.exitOnFail : true;

    // Configurar timeouts para evitar cuelgues
    const mongooseOptions = {
        serverSelectionTimeoutMS: 10000, // 10 segundos para seleccionar servidor
        socketTimeoutMS: 20000, // 20 segundos para operaciones de socket
        connectTimeoutMS: 10000, // 10 segundos para conectar
        maxPoolSize: 10, // Máximo 10 conexiones en el pool
        minPoolSize: 2, // Mínimo 2 conexiones en el pool
        maxIdleTimeMS: 30000, // 30 segundos antes de cerrar conexiones inactivas
        bufferCommands: false // Deshabilitar buffering de comandos
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logger.info('🔄 Intentando conectar a MongoDB (intento %d/%d)...', attempt, maxRetries);
            await mongoose.connect(uri, mongooseOptions);
            logger.info('✅ Conectado a MongoDB');
            return mongoose.connection;
        } catch (error) {
            logger.error('❌ Error al conectar con MongoDB (intento %d/%d)', attempt, maxRetries, { error });
            if (attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt - 1); // backoff exponencial
                logger.warn('⏳ Reintentando en %d ms...', delay);
                await wait(delay);
                continue;
            }

            logger.error('🛑 No se pudo conectar a MongoDB después de %d intentos', maxRetries, { uri });
            if (exitOnFail) {
                process.exit(1);
            } else {
                throw error;
            }
        }
    }
};

module.exports = connectDB;


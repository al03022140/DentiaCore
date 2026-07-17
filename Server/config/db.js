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

    // Fail-fast si falta la URI: sin esto, mongoose.connect(undefined) falla con
    // un error críptico del driver y se reintenta 5x (~31s) antes de rendirse.
    if (!uri) {
        logger.error('🛑 MONGODB_URI no está definido; no se puede conectar a MongoDB');
        if (exitOnFail) process.exit(1);
        throw new Error('MONGODB_URI no definido');
    }

    // Configurar timeouts para evitar cuelgues
    const mongooseOptions = {
        // 5s (antes 10s): si mongod no responde (p. ej. la laptop volvió de
        // suspensión y la conexión del pool murió, o el disco está saturado por
        // antivirus), cada operación falla en ~5s y el controlador devuelve un
        // error claro ANTES de que el cliente (axios) corte a los 10s. Antes
        // ambos valían 10000ms, así que el navegador abortaba justo cuando el
        // server iba a fallar y el usuario solo veía "timeout" sin causa.
        serverSelectionTimeoutMS: 5000, // 5 segundos para seleccionar servidor
        // Cada cuánto el driver sondea la salud de mongod. Bajarlo de 10s a 5s
        // acelera la RE-detección del servidor tras una suspensión/reconexión,
        // para que el primer guardado tras "despertar" no espere un ciclo largo.
        heartbeatFrequencyMS: 5000,
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

            // Asegurar los índices únicos críticos del modelo Patient.
            // `autoIndex` está deshabilitado en producción (ver patient.js), así
            // que sin esto los índices `unique` de `paciente_id` y
            // `documento.numero` pueden NO existir en una BD de producción: se
            // colarían pacientes/documentos duplicados en silencio y el manejo
            // de E11000 → 409 del controller nunca dispararía. createIndexes()
            // SOLO crea los índices que falten (no borra otros, a diferencia de
            // syncIndexes), y es best-effort: si ya hubiera duplicados
            // preexistentes la construcción del índice único fallará — lo
            // registramos de forma prominente pero NO abortamos el arranque,
            // para que la clínica pueda seguir operando mientras se depura.
            try {
                const Patient = require('../models/patient');
                await Patient.createIndexes();
                logger.info('✅ Índices únicos de Patient asegurados');
            } catch (indexError) {
                logger.error(
                    '⚠️  No se pudieron crear los índices de Patient. Si es por duplicados preexistentes en paciente_id o documento.numero, la unicidad NO queda garantizada hasta resolverlos.',
                    { error: indexError }
                );
            }

            return mongoose.connection;
        } catch (error) {
            logger.error('❌ Error al conectar con MongoDB (intento %d/%d)', attempt, maxRetries, { error });
            if (attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt - 1); // backoff exponencial
                logger.warn('⏳ Reintentando en %d ms...', delay);
                await wait(delay);
                continue;
            }

            // Redacta credenciales (mongodb://user:pass@host) antes de loggear:
            // el log rota con retención de 14 días y el password no debe quedar en claro.
            const safeUri = String(uri).replace(/\/\/[^@]+@/, '//***@');
            logger.error('🛑 No se pudo conectar a MongoDB después de %d intentos', maxRetries, { uri: safeUri });
            if (exitOnFail) {
                process.exit(1);
            } else {
                throw error;
            }
        }
    }
};

module.exports = connectDB;


// Cargar variables de entorno priorizando Server/.env y usando root .env como respaldo
const path = require('path');
const dotenv = require('dotenv');
// Cargar primero Server/.env y luego sobreescribir con el .env raíz para asegurar credenciales de Google
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

// Importaciones principales
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const fsExtra = require('fs-extra');
const logger = require('../utils/logger');
const { getUploadsBase } = require('../utils/uploads');

// Importaciones de configuración
const connectDB = require('../config/db');
const configureRoutes = require('../config/routes');
const googleRouter = require('../routes/googleRoutes');

// 1) Inicializar Express
const app = express();

// 2) Middlewares globales
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            // Política CSP más estricta - sin unsafe-inline
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            styleSrcAttr: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: [
                "'self'",
                "http://localhost:*",
                "http://127.0.0.1:*",
                "https://accounts.google.com",
                "https://www.googleapis.com",
                "https://www.gstatic.com",
                "data:"
            ],
            fontSrc: ["'self'", "data:", 'https://fonts.gstatic.com'],
            mediaSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"]
        }
    },
    frameguard: { action: 'deny' }
}));
// Helmet 8 elimina middlewares heredados como xssFilter/noSniff/hidePoweredBy.
// Aplicamos equivalentes modernos explicitamente donde es necesario.
app.disable('x-powered-by');

// CORS configurado según necesidades reales
app.use(cors({
    origin: function(origin, callback) {
        // Lista de orígenes permitidos
        const allowedOrigins = [
            'http://localhost:5173',  // Vite dev server
            'http://localhost:5174',  // Vite dev server alternativo
            'http://localhost:5002',  // Backend (para peticiones del mismo origen)
            process.env.CLIENT_URL    // URL del cliente desde .env
        ].filter(Boolean); // Eliminar valores undefined/null
        
        // Permitir peticiones sin origen (como Postman, curl, etc.)
        if (!origin) return callback(null, true);
        
        // Verificar si el origen está en la lista permitida
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            logger.warn(`⚠️ Origen bloqueado por CORS: ${origin}`);
            callback(new Error('No permitido por CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', { stream: logger.stream }));

// Middleware urlencoded condicional aplicado después de morgan
app.use((req, res, next) => {
  logger.debug('🔍 Checking Content-Type: %s', req.headers['content-type']);
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    logger.debug('✅ Skipping urlencoded for multipart/form-data');
    return next();
  }
  logger.debug('📝 Applying urlencoded middleware');
  express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
});

// 3) Servir archivos estáticos
const uploadsBase = getUploadsBase();
fsExtra.ensureDirSync(uploadsBase);
app.use('/uploads', express.static(uploadsBase));
app.use(express.static(path.join(__dirname, '../../Client/dist')));

// 5) Endpoints de debug (async/await) - ANTES del router principal
app.get('/api/debug/uploads/:id/odontograma-inicial', async (req, res, next) => {
    const dir = path.join(uploadsBase, 'pacientes', req.params.id, 'odontograma-inicial');
    const staticPath = uploadsBase;
    
    try {
        const exists = await fsExtra.pathExists(dir);
        if (!exists) {
            return res.status(404).json({ 
                error: 'Directorio no encontrado', 
                dir, 
                staticPath, 
                __dirname 
            });
        }

        const files = await fsExtra.readdir(dir);
        const fileDetails = await Promise.all(files.map(async file => {
            const filePath = path.join(dir, file);
            const stat = await fsExtra.stat(filePath);
            return {
                name: file,
                path: filePath,
                exists: true,
                size: stat.size,
                url: `/uploads/pacientes/${req.params.id}/odontograma-inicial/${file}`
            };
        }));

        res.json({ 
            dir, 
            staticPath, 
            exists: true, 
            files: fileDetails, 
            __dirname, 
            serverPath: __dirname 
        });
    } catch (error) {
        next(error);
    }
});

// Debug endpoint para verificar estructura de carpetas del periodontograma
app.get('/api/debug/uploads/:id/periodontograma', async (req, res, next) => {
    const baseDir = path.join(uploadsBase, 'pacientes', req.params.id, 'periodontograma');
    const staticPath = uploadsBase;
    
    try {
        const result = {
            baseDir,
            staticPath,
            __dirname,
            serverPath: __dirname,
            structure: {}
        };

        // Verificar directorio base
        const baseDirExists = await fsExtra.pathExists(baseDir);
        result.structure.base = {
            path: baseDir,
            exists: baseDirExists,
            files: []
        };

        if (baseDirExists) {
            const baseFiles = await fsExtra.readdir(baseDir);
            result.structure.base.files = baseFiles;
        }

        // Verificar subdirectorios superior e inferior (estructura legacy)
        for (const section of ['superior', 'inferior']) {
            const sectionDir = path.join(baseDir, section);
            const sectionExists = await fsExtra.pathExists(sectionDir);
            
            result.structure[section] = {
                path: sectionDir,
                exists: sectionExists,
                files: [],
                type: 'legacy'
            };

            if (sectionExists) {
                const sectionFiles = await fsExtra.readdir(sectionDir);
                const fileDetails = await Promise.all(sectionFiles.map(async file => {
                    const filePath = path.join(sectionDir, file);
                    const stat = await fsExtra.stat(filePath);
                    return {
                        name: file,
                        path: filePath,
                        size: stat.size,
                        url: `/uploads/pacientes/${req.params.id}/periodontograma/${section}/${file}`
                    };
                }));
                result.structure[section].files = fileDetails;
            }
        }

        // Verificar directorio de versiones (nueva estructura)
        const versionesDir = path.join(baseDir, 'versiones');
        const versionesExists = await fsExtra.pathExists(versionesDir);
        
        result.structure.versiones = {
            path: versionesDir,
            exists: versionesExists,
            versions: [],
            type: 'versioned'
        };

        if (versionesExists) {
            const versionFolders = await fsExtra.readdir(versionesDir);
            const versionDetails = await Promise.all(versionFolders.map(async folder => {
                const versionPath = path.join(versionesDir, folder);
                const stat = await fsExtra.stat(versionPath);
                
                if (stat.isDirectory()) {
                    const versionFiles = await fsExtra.readdir(versionPath);
                    const fileDetails = await Promise.all(versionFiles.map(async file => {
                        const filePath = path.join(versionPath, file);
                        const fileStat = await fsExtra.stat(filePath);
                        return {
                            name: file,
                            path: filePath,
                            size: fileStat.size,
                            url: `/uploads/pacientes/${req.params.id}/periodontograma/versiones/${folder}/${file}`
                        };
                    }));
                    
                    return {
                        folder,
                        path: versionPath,
                        files: fileDetails,
                        createdAt: stat.birthtime
                    };
                }
                return null;
            }));
            
            result.structure.versiones.versions = versionDetails.filter(v => v !== null);
        }

        res.json(result);
    } catch (error) {
        next(error);
    }
});

// 7) Rutas API
// Importante: montar primero las rutas específicas (Google) antes del router principal con catch-all
logger.debug('🔍 DEBUG: Montando rutas de Google en /api/google');
app.use('/api/google', googleRouter);
logger.debug('✅ DEBUG: Rutas de Google montadas correctamente');

// Montar router principal bajo /api (incluye health, patients, etc.)
app.use('/api', configureRoutes());

// 8) Manejo de errores (después de todas las rutas)
app.use((err, req, res, next) => {
    logger.error('❌ Error interno', { err });
    res.status(500).json({
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
});

// 9) SPA fallback (debe ir después del error handler)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../Client/dist/index.html'));
});

// 10) Conectar DB y arrancar servidor (omitido en tests)
let server;
if (process.env.NODE_ENV !== 'test') {
    (async () => {
        try {
            // Esperar a que la DB esté conectada ANTES de arrancar el servidor
            const dbConnection = await connectDB();
            
            // Health check simple de la conexión
            if (dbConnection.readyState !== 1) {
                throw new Error('La base de datos no está en estado "Connected"');
            }
            logger.info('✅ Auditoría de DB: Conexión establecida y lista para escritura.');
        } catch (err) {
            logger.error('🛑 Falló la conexión a MongoDB al inicio', { err });
            process.exit(1);
        }

        // Definir puerto del servidor con preferencia a PORT del entorno
        const envPort = Number(process.env.PORT);
        const PORT = Number.isInteger(envPort) && envPort > 0 ? envPort : 5002;
        const host = process.env.HOST || '0.0.0.0';
        const displayHost = host === '0.0.0.0' ? 'localhost' : host;

        server = app.listen(PORT, host, () => {
            logger.info('🔥 Servidor corriendo en http://%s:%d', displayHost, PORT);
            logger.info(`🔗 API accesible en ${process.env.API_URL || `http://localhost:${PORT}`}`);
        });

        // 11) Graceful shutdown
        const gracefulShutdown = () => {
            logger.info('🛑 Cerrando servidor...');
            server.close(() => {
                logger.info('✅ Servidor cerrado');
                process.exit(0);
            });
        };

        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
        process.on('uncaughtException', (err) => {
            logger.error('❌ Excepción no controlada', { err });
            gracefulShutdown();
        });
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('⚠️ Promesa rechazada no manejada', {
                reason: reason instanceof Error ? {
                    message: reason.message,
                    stack: reason.stack,
                    name: reason.name
                } : reason,
                promise
            });
            // Solo cerrar en producción
            if (process.env.NODE_ENV === 'production') {
                gracefulShutdown();
            }
        });
    })();
} else {
    logger.info('🧪 Entorno de pruebas detectado: se omite app.listen');
}

module.exports = app;
module.exports.closeServer = () => new Promise((resolve) => {
    if (server) {
        server.close(() => resolve());
    } else {
        resolve();
    }
});
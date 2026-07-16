// Cargar variables de entorno priorizando Server/.env y usando root .env como respaldo
const path = require('path');
const dotenv = require('dotenv');
// Cargar primero Server/.env y luego sobreescribir con el .env raíz para asegurar credenciales de Google
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

// O-2: fijar TZ del proceso — sin esto, los cortes de caja y timestamps de
// auditoría dependen de la TZ del SO donde corra el server (silencioso si
// difiere de la de la clínica). Respeta un TZ explícito del .env si existe.
process.env.TZ = process.env.TZ || 'America/Mexico_City';

// Importaciones principales
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const fsExtra = require('fs-extra');
const logger = require('../utils/logger');
const { getUploadsBase } = require('../utils/uploads');
const { sendAlert } = require('../utils/alerts');

// Importaciones de configuración
const connectDB = require('../config/db');
const { ensureCriticalIndexes } = require('../utils/ensureIndexes');
const configureRoutes = require('../config/routes');
const googleRouter = require('../routes/googleRoutes');
const { getJwtSecret } = require('../utils/crypto');
const { getAuditHmacSecret } = require('../utils/integrity');
const { globalLimiter, botGuard } = require('../middlewares/rateLimiter');

// Validar secretos críticos al arranque — fail fast si son inseguros.
// En producción, getJwtSecret/getAuditHmacSecret lanzan si faltan o son débiles
// (<32 chars), evitando arrancar con una configuración insegura.
try {
  getJwtSecret();
  getAuditHmacSecret(); // NOM-024: protege la integridad/no-repudio del audit log
} catch (err) {
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
}

// 1) Inicializar Express
const app = express();

// trust proxy: por defecto OFF (la app corre mono-máquina sin proxy, así que
// req.ip = IP del socket, correcto para el rate limiting por IP). Si se
// despliega DETRÁS de un reverse-proxy (nginx/Caddy con HTTPS), poner
// TRUST_PROXY=1 (o el nº de saltos) para que req.ip lea X-Forwarded-For y el
// rate limiting no agrupe a todos los usuarios bajo la IP del proxy.
if (process.env.TRUST_PROXY) {
    const tp = process.env.TRUST_PROXY;
    app.set('trust proxy', /^\d+$/.test(tp) ? parseInt(tp, 10) : tp);
}

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
        
        // Permitir peticiones sin origen (Postman, curl, mismo origen). Con
        // credentials:true las cookies de sesión siguen exigiendo auth, así que
        // esto no abre la API: solo evita bloquear clientes que no envían Origin.
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

// BE-01 (Logging): redactar valores de query params sensibles antes de que
// morgan escriba la línea de acceso a disco. `GET /patients/search?q=<nombre>`
// y `/audit?q=<nombre>` filtraban el nombre buscado (PII) en texto plano al log
// rotado (retención 14 días). Token `urlSafe` = :url con esos valores ocultos.
const REDACTED_QUERY_KEYS = new Set(['q', 'search', 'nombre', 'documento', 'query']);
morgan.token('urlSafe', (req) => {
  const raw = req.originalUrl || req.url || '';
  const qIdx = raw.indexOf('?');
  if (qIdx === -1) return raw;
  const path = raw.slice(0, qIdx);
  const params = new URLSearchParams(raw.slice(qIdx + 1));
  for (const key of params.keys()) {
    if (REDACTED_QUERY_KEYS.has(key)) params.set(key, 'REDACTED');
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
});
const morganFormat = process.env.NODE_ENV === 'production'
  ? ':remote-addr - :remote-user [:date[clf]] ":method :urlSafe HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
  : ':method :urlSafe :status :response-time ms - :res[content-length]';
app.use(morgan(morganFormat, { stream: logger.stream }));

// Abuse protection: bot guard + global rate limit
app.use(botGuard);
app.use(globalLimiter);

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

// SEC-04: saneamiento global de operadores Mongo (`$…`) en body/query/params.
// Va DESPUÉS de los parsers y ANTES de cualquier ruta para cubrir /api,
// /api/google y /uploads. `qs` con extended:true permite `?x[$ne]=y`.
const mongoSanitize = require('../middlewares/mongoSanitize');
app.use(mongoSanitize);

// 3) Servir archivos estáticos
const uploadsBase = getUploadsBase();
fsExtra.ensureDirSync(uploadsBase);
// C-1: /uploads contiene PHI (adjuntos, odontogramas, fotos de pacientes).
// Exigir una sesión válida (Bearer o cookie httpOnly) antes del estático.
const uploadsAuth = require('../middlewares/uploadsAuth');
// PHI: no cachear en proxies/disco compartido. `private, no-store` evita que
// una foto/odontograma/firma quede en cachés intermedias con `public` (default).
app.use('/uploads', uploadsAuth, express.static(uploadsBase, {
  setHeaders: (res) => res.set('Cache-Control', 'private, no-store')
}));
app.use(express.static(path.join(__dirname, '../../Client/dist')));

// 5) Endpoints de debug (async/await) - SOLO EN DESARROLLO
if (process.env.NODE_ENV !== 'production') {
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
} // end of development-only debug endpoints

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

            // Construir los índices declarados (incl. los ÚNICOS de paciente_id
            // y documento.numero). En producción `autoIndex` está apagado, así
            // que sin esto los índices nunca se crean en una BD legacy. Es
            // legacy-safe: si un índice único choca con duplicados preexistentes
            // se avisa y se continúa (NO se tumba el arranque). Ver
            // utils/ensureIndexes.js y scripts/findPatientDuplicates.js.
            try {
                // DB-IDX-01: incluir Examen — su índice {paciente_id, deletedAt}
                // no se construye solo en prod (autoIndex off) y el acceso por
                // paciente sin él es COLLSCAN.
                const Patient = require('../models/patient');
                const Exam = require('../models/exam');
                await ensureCriticalIndexes([Patient, Exam]);
            } catch (idxErr) {
                logger.warn('No se pudieron asegurar los índices al inicio: %s', idxErr?.message || idxErr);
            }
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
        // BKP-03: cerrar también la conexión a Mongo y garantizar la salida con
        // un timeout de respaldo. Antes solo hacía server.close(): si una request
        // en vuelo quedaba bloqueada (p. ej. Mongo colgado tras suspender la
        // laptop), el callback nunca llegaba y el proceso se quedaba pegado ante
        // SIGTERM, forzando un SIGKILL que corta escrituras a la mitad. Guard de
        // doble invocación por si llegan SIGINT y SIGTERM juntos.
        let shuttingDown = false;
        const gracefulShutdown = () => {
            if (shuttingDown) return;
            shuttingDown = true;
            logger.info('🛑 Cerrando servidor...');
            // Respaldo: si el drenado no completa en 10s, salir de todos modos.
            const forceExit = setTimeout(() => {
                logger.warn('⏱️ Cierre forzado tras timeout de drenado');
                process.exit(1);
            }, 10_000);
            forceExit.unref();
            server.close(async () => {
                try {
                    const mongoose = require('mongoose');
                    await mongoose.connection.close(false);
                    logger.info('✅ Conexión a MongoDB cerrada');
                } catch (e) {
                    logger.warn('No se pudo cerrar MongoDB limpiamente: %s', e?.message || e);
                }
                logger.info('✅ Servidor cerrado');
                process.exit(0);
            });
        };

        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
        // ⚠️ IMPORTANTE — Resiliencia en producción (app de escritorio clínica):
        // Antes, cualquier excepción no controlada o promesa rechazada suelta
        // disparaba gracefulShutdown() en producción → pm2 reiniciaba el server.
        // Como el cliente corre la app instalada (NODE_ENV=production vía pm2),
        // un error async POST-respuesta (p. ej. una escritura de auditoría que
        // rechaza después de enviar el 201 al guardar/firmar una nota) tumbaba
        // todo el programa: "al guardar, el programa se reinicia".
        //
        // Para un sistema mono-usuario de escritorio, mantener el server vivo y
        // registrar el error con detalle es mucho mejor que reiniciar a mitad de
        // una operación clínica. Por eso NO cerramos el proceso aquí; solo
        // registramos el detalle completo para poder diagnosticar la causa raíz.
        const describeError = (e) => (e instanceof Error
            ? { name: e.name, message: e.message, stack: e.stack }
            : e);

        // D-1: el proceso sigue vivo (ver razón arriba), pero eso no debe
        // significar que el degradado quede invisible — se alerta además de
        // loguear (O-1, ver Server/utils/alerts.js). sendAlert nunca lanza.
        process.on('uncaughtException', (err) => {
            logger.error('❌ Excepción no controlada (el server sigue activo)', {
                err: describeError(err)
            });
            sendAlert('Excepción no controlada (server sigue activo)', { message: err?.message });
        });
        process.on('unhandledRejection', (reason) => {
            logger.error('⚠️ Promesa rechazada no manejada (el server sigue activo)', {
                reason: describeError(reason)
            });
            sendAlert('Promesa rechazada no manejada (server sigue activo)', {
                message: reason instanceof Error ? reason.message : String(reason)
            });
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
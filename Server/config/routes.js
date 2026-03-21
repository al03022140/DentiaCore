const express = require('express');
const mongoose = require('mongoose');
const patientRoutes = require('../routes/patientRoutes');
const periodontogramRoutes = require('../routes/periodontogramRoutes');
const cashRoutes = require('../routes/cashRoutes');
const authRoutes = require('../routes/authRoutes');
const userRoutes = require('../routes/userRoutes');
const statsRoutes = require('../routes/statsRoutes');
const appointmentRoutes = require('../routes/appointmentRoutes');
const examRoutes = require('../routes/examRoutes');
const draftRoutes = require('../routes/draftRoutes');
const googleRoutes = require('../routes/googleRoutes');
const settingsRoutes = require('../routes/settingsRoutes');
const noteTemplateRoutes = require('../routes/noteTemplateRoutes');
const patientChargeRoutes = require('../routes/patientChargeRoutes');
const auditRoutes = require('../routes/auditRoutes');
const signingRoutes = require('../routes/signingRoutes');
const authenticate = require('../middlewares/authenticate');
const auditLogger = require('../middlewares/auditLogger');
const snapshotCapture = require('../middlewares/snapshotCapture');
const validarCapturaExtemporanea = require('../middlewares/capturaExtemporanea');

// Configuración de rutas
const configureRoutes = () => {
  const router = express.Router();

  // Montar rutas públicas
  router.use('/auth', authRoutes);
  router.use('/google', googleRoutes);

  // Ruta de estado de salud (incluye estado de conexión a DB)
  router.get('/health', (req, res) => {
    const stateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    const readyState = mongoose.connection?.readyState ?? 0;
    const dbStatus = stateMap[readyState] || `unknown(${readyState})`;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: {
        readyState,
        status: dbStatus
      }
    });
  });

  // Ruta de métricas (solo en desarrollo)
  if (process.env.NODE_ENV === 'development') {
    router.get('/metrics', (req, res) => {
      res.json({
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        uptime: process.uptime()
      });
    });
  }

  // Autenticación para el resto de rutas
  router.use(authenticate);

  // Middleware de auditoría automática para escrituras (NOM-024)
  router.use(auditLogger());

  // Captura de snapshot antes de escrituras para diff en audit trail
  router.use(snapshotCapture);

  // Validación de captura extemporánea en escrituras clínicas (roles.MD §9.5)
  router.use(validarCapturaExtemporanea);

  // Montar rutas protegidas - las subrutas se manejan dentro
  router.use('/patients', patientRoutes);
  router.use('/periodontograms', periodontogramRoutes);
  router.use('/cash', cashRoutes);
  router.use('/users', userRoutes);
  router.use('/stats', statsRoutes);
  router.use('/appointments', appointmentRoutes);
  router.use('/exams', examRoutes);
  router.use('/drafts', draftRoutes);
  router.use('/settings', settingsRoutes);
  router.use('/note-templates', noteTemplateRoutes);
  router.use('/patient-charges', patientChargeRoutes);
  router.use('/audit', auditRoutes);
  router.use('/sign', signingRoutes);

  // Capturar rutas no encontradas
  router.use('*', (req, res) => {
    res.status(404).json({ 
      error: 'Ruta no encontrada',
      path: req.originalUrl,
      method: req.method
    });
  });

  // Manejador global de errores — captura rechazos de promesas y excepciones no controladas
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, _next) => {
    const statusCode = err.statusCode || err.status || 500;
    const message = statusCode === 500 ? 'Error interno del servidor' : err.message;
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
    if (!res.headersSent) {
      res.status(statusCode).json({ error: message });
    }
  });

  return router;
};

module.exports = configureRoutes;
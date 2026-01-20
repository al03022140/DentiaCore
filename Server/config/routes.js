const express = require('express');
const mongoose = require('mongoose');
const patientRoutes = require('../routes/patientRoutes');
const periodontogramRoutes = require('../routes/periodontogramRoutes');
const cashRoutes = require('../routes/cashRoutes');
const authRoutes = require('../routes/authRoutes');
const userRoutes = require('../routes/userRoutes');
const authenticate = require('../middlewares/authenticate');

// Configuración de rutas
const configureRoutes = () => {
  const router = express.Router();

  // Debug: Log de configuración de rutas
  console.log('🔍 DEBUG: Configurando rutas principales');
  console.log('  - Montando /patients');
  console.log('  - Montando /periodontograms');
  console.log('  - Montando /cash');
  console.log('  - Montando /auth');
  console.log('  - Montando /users');

  // Montar rutas públicas
  router.use('/auth', authRoutes);

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

  // Montar rutas protegidas - las subrutas se manejan dentro
  router.use('/patients', patientRoutes);
  router.use('/periodontograms', periodontogramRoutes);
  router.use('/cash', cashRoutes);
  router.use('/users', userRoutes);

  // Capturar rutas no encontradas
  router.use('*', (req, res) => {
    res.status(404).json({ 
      error: 'Ruta no encontrada',
      path: req.originalUrl,
      method: req.method
    });
  });

  return router;
};

module.exports = configureRoutes;
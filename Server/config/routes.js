const express = require('express');
const mongoose = require('mongoose');
const patientRoutes = require('../routes/patientRoutes');
const periodontogramRoutes = require('../routes/periodontogramRoutes');

// Configuración de rutas
const configureRoutes = () => {
  const router = express.Router();

  // Debug: Log de configuración de rutas
  console.log('🔍 DEBUG: Configurando rutas principales');
  console.log('  - Montando /patients');
  console.log('  - Montando /periodontograms');

  // Montar rutas - las subrutas se manejan dentro
  router.use('/patients', patientRoutes);
  router.use('/periodontograms', periodontogramRoutes);

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
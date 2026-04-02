const express = require('express');
const router = express.Router({ mergeParams: true });
const checkPatient = require('../middlewares/checkPatient');
const { authorize, requireClinicalRole } = require('../middlewares/authorize');
const { writeLimiter, readLimiter } = require('../middlewares/rateLimiter');

const {
  verificarOdontogramaInicial,
  hasInitialOdontogram,
  validarEntradasOdontograma,
  guardarOdontogramaInicial,
  obtenerHistorialInicial,
  agregarHistorialInicial,
  deleteInitialOdontogram,
  verificarOdontogramaClinico,
  obtenerHistorialClinico,
  saveClinicalHistoryEntries,
  deleteClinicalHistoryEntry,
  deleteClinicalOdontogramState,
  obtenerSnapshotPorId,
  manejarError
} = require('../controllers/odontogramaController');

const {
  _uploadMulter,
  uploadPng,
  handleMulterError,
  cleanupOnError
} = require('../middlewares/uploadImage');

/**
 * Base URL: /api/patients/:id/
 * Todas las rutas heredan el :id del paciente del router padre
 * 
 * Estructura de rutas:
 * /odontograma-inicial
 *   - GET    / -> Verificar estado actual
 *   - POST   / -> Guardar nuevo odontograma
 *   - GET    /history -> Obtener historial
 *   - POST   /history -> Agregar entrada al historial
 *   - GET    /history/:snapshotId -> Obtener snapshot específico
 * 
 * /odontograma-clinico
 *   - GET    / -> Verificar estado actual
 *   - POST   / -> Guardar nueva entrada
 *   - GET    /history -> Obtener historial
 *   - DELETE /history/:entryId -> Eliminar entrada específica
 */

// Middleware global para validar paciente
router.use(checkPatient);

// Comprobación rápida para el motor del canvas (mismo auth que el resto)
router.get(
  '/has-initial-odontogram',
  readLimiter,
  authorize(['odontogram.read']),
  hasInitialOdontogram
);

// Middleware para establecer el directorio de upload
const setUploadDir = (dir) => (req, res, next) => {
  req.uploadDir = dir;
  next();
};

// --- Odontograma Inicial ---
router
  .route('/odontograma-inicial')
  .get(readLimiter, authorize(['odontogram.read']), verificarOdontogramaInicial)
  .post(
    writeLimiter,
    requireClinicalRole,
    authorize(['odontogram.create', 'odontogram.write.draft']),
    setUploadDir('odontograma-inicial'),
    uploadPng.single('odontograma'),
    handleMulterError,
    validarEntradasOdontograma,
    guardarOdontogramaInicial
  )
  .delete(writeLimiter, authorize(['odontogram.delete']), deleteInitialOdontogram);

// Error handler para limpiar archivos subidos si falla el guardado
router.use('/odontograma-inicial', cleanupOnError);

// Historial del odontograma inicial
router
  .route('/odontograma-inicial/history')
  .get(readLimiter, authorize(['odontogram.read']), obtenerHistorialInicial)
  .post(
    writeLimiter,
    requireClinicalRole,
    authorize(['odontogram.create', 'odontogram.write.draft']),
    validarEntradasOdontograma,
    agregarHistorialInicial
  );

// Obtener un snapshot específico del historial inicial
router.get('/odontograma-inicial/history/:snapshotId', readLimiter, authorize(['odontogram.read']), obtenerSnapshotPorId);

// --- Odontograma Clínico ---
router
  .route('/odontograma-clinico')
  .get(readLimiter, authorize(['odontogram.read']), verificarOdontogramaClinico)
  .post(
    writeLimiter,
    requireClinicalRole,
    authorize(['odontogram.create', 'odontogram.write.draft']),
    validarEntradasOdontograma,
    saveClinicalHistoryEntries
  )
  .delete(writeLimiter, authorize(['odontogram.delete']), deleteClinicalOdontogramState);

// Historial del odontograma clínico
router
  .route('/odontograma-clinico/history')
  .get(readLimiter, authorize(['odontogram.read']), obtenerHistorialClinico);

// Eliminar entrada específica del historial clínico
router.delete('/odontograma-clinico/history/:entryId', writeLimiter, authorize(['odontogram.delete']), deleteClinicalHistoryEntry);

// Error handler específico para odontograma
router.use(manejarError);

module.exports = router;

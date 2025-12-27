const express = require('express');
const router = express.Router({ mergeParams: true });
const checkPatient = require('../middlewares/checkPatient');

const {
  verificarOdontogramaInicial,
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
  uploadMulter,
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

// Middleware para establecer el directorio de upload
const setUploadDir = (dir) => (req, res, next) => {
  req.uploadDir = dir;
  next();
};

// --- Odontograma Inicial ---
router
  .route('/odontograma-inicial')
  .get(verificarOdontogramaInicial)
  .post(
    setUploadDir('odontograma-inicial'),
    uploadPng.single('odontograma'),
    handleMulterError,
    validarEntradasOdontograma,
    cleanupOnError,
    guardarOdontogramaInicial
  )
  .delete(deleteInitialOdontogram);

// Historial del odontograma inicial
router
  .route('/odontograma-inicial/history')
  .get(obtenerHistorialInicial)
  .post(
    validarEntradasOdontograma,
    agregarHistorialInicial
  );

// Obtener un snapshot específico del historial inicial
router.get('/odontograma-inicial/history/:snapshotId', obtenerSnapshotPorId);

// --- Odontograma Clínico ---
router
  .route('/odontograma-clinico')
  .get(verificarOdontogramaClinico)
  .post(
    validarEntradasOdontograma,
    saveClinicalHistoryEntries
  )
  .delete(deleteClinicalOdontogramState);

// Historial del odontograma clínico
router
  .route('/odontograma-clinico/history')
  .get(obtenerHistorialClinico);

// Eliminar entrada específica del historial clínico
router.delete('/odontograma-clinico/history/:entryId', deleteClinicalHistoryEntry);

// Error handler específico para odontograma
router.use(manejarError);

module.exports = router;

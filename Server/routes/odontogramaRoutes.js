const express = require('express');
const router = express.Router({ mergeParams: true });
const checkPatient = require('../middlewares/checkPatient');
const { authorize, requireClinicalRole } = require('../middlewares/authorize');
const { writeLimiter, readLimiter } = require('../middlewares/rateLimiter');

const {
  verificarOdontogramaInicial,
  validarEntradasOdontograma,
  guardarOdontogramaInicial,
  obtenerHistorialInicial,
  verificarOdontogramaClinico,
  obtenerHistorialClinico,
  saveClinicalHistoryEntries,
  obtenerSnapshotPorId,
  manejarError
} = require('../controllers/odontogramaController');

// NOTA: el odontograma inicial ya NO sube imágenes. Antes guardaba un PNG del canvas
// junto con los datos; ahora sólo persiste las entradas (tooth/damage/surface/note/fecha)
// y el frontend renderiza el canvas read-only desde esos datos. Por eso ya no se
// importa el middleware de upload aquí.

/**
 * Base URL: /api/patients/:id/
 * Todas las rutas heredan el :id del paciente del router padre
 *
 * Estructura de rutas:
 * /odontograma-inicial
 *   - GET    / -> Verificar estado actual
 *   - POST   / -> Guardar nuevo odontograma (captura única)
 *   - GET    /history -> Obtener historial
 *   - GET    /history/:snapshotId -> Obtener snapshot específico
 *
 * /odontograma-clinico
 *   - GET    / -> Estado actual | ?listVersions=true | ?version=X
 *   - POST   / -> Guardar estado (crea versión inmutable si hay cambios)
 *   - GET    /history -> Obtener historial de versiones
 *
 * Eliminados (sin consumidores; ver notas en el controller):
 *   POST /odontograma-inicial/history, DELETE /odontograma-clinico,
 *   DELETE /odontograma-clinico/history/:entryId, GET /has-initial-odontogram
 */

// Middleware global para validar paciente
router.use(checkPatient);

// --- Odontograma Inicial ---
// El POST acepta JSON { entries: [...] }. Ya no recibe FormData con PNG.
// NO existe DELETE: el odontograma inicial es de captura única e inmutable
// (una sola vez por paciente, sin opción de archivar ni re-crear).
router
  .route('/odontograma-inicial')
  .get(readLimiter, authorize(['odontogram.read']), verificarOdontogramaInicial)
  .post(
    writeLimiter,
    requireClinicalRole,
    authorize(['odontogram.create', 'odontogram.write.draft']),
    validarEntradasOdontograma,
    guardarOdontogramaInicial
  );

// Historial del odontograma inicial (sólo lectura: el historial se alimenta
// exclusivamente desde el POST principal)
router
  .route('/odontograma-inicial/history')
  .get(readLimiter, authorize(['odontogram.read']), obtenerHistorialInicial);

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
  );

// Historial del odontograma clínico
router
  .route('/odontograma-clinico/history')
  .get(readLimiter, authorize(['odontogram.read']), obtenerHistorialClinico);

// Error handler específico para odontograma
router.use(manejarError);

module.exports = router;

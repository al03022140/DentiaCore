/**
 * Rutas de Exámenes — DentiaCore
 *
 * Previamente no estaba montado en config/routes.js.
 * Ahora incluye autorización por permisos.
 */
const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
const { authorize, requireClinicalRole } = require('../middlewares/authorize');
// La captura extemporánea se valida en el middleware GLOBAL (config/routes.js),
// que ya cubre estas rutas; antes había aquí un backdatedEntry() redundante.
const { writeLimiter, readLimiter } = require('../middlewares/rateLimiter');

// Lectura — cualquier rol clínico o admin
router.get('/', readLimiter, authorize(['exams.read']), examController.getAllExams);
router.get('/:id', readLimiter, authorize(['exams.read']), examController.getExamById);
router.get('/patient/:paciente_id', readLimiter, authorize(['exams.read']), examController.getExamsByPatient);

// Escritura — requiere rol clínico + permiso
router.post('/',
  writeLimiter,
  requireClinicalRole,
  authorize(['exams.create']),
  examController.createExam
);

router.put('/:id',
  writeLimiter,
  requireClinicalRole,
  authorize(['exams.update']),
  examController.updateExam
);

// Eliminar (soft delete) — solo admin/superadmin (wildcard)
router.delete('/:id',
  writeLimiter,
  authorize(['exams.delete']),
  examController.deleteExam
);

module.exports = router;

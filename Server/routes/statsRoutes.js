const express = require('express');
const statsController = require('../controllers/statsController');
const { authorize } = require('../middlewares/authorize');
const { readLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

// GET /api/stats/summary?from=&to=&group=day|week|month|year
router.get('/summary', readLimiter, authorize(['stats.read.own', 'stats.read.admin']), statsController.getSummary);

// GET /api/stats/revenue-by-service?from=&to=&group=day|week|month|year
router.get('/revenue-by-service', readLimiter, authorize(['stats.read.admin']), statsController.getRevenueByService);

// GET /api/stats/patients-trend?from=&to=&group=day|week|month|year
router.get('/patients-trend', readLimiter, authorize(['stats.read.admin']), statsController.getPatientsTrend);

// GET /api/stats/no-shows?from=&to=&group=day|week|month|year
router.get('/no-shows', readLimiter, authorize(['stats.read.admin']), statsController.getNoShows);

// GET /api/stats/cashbox-performance?from=&to=&group=day|week|month|year
router.get('/cashbox-performance', readLimiter, authorize(['stats.read.admin']), statsController.getCashboxPerformance);

// GET /api/stats/productivity?from=&to=&group=day|week|month|year
router.get('/productivity', readLimiter, authorize(['stats.read.admin']), statsController.getProductivity);

// GET /api/stats/net-earnings?from=&to=&group=day|week|month|year
router.get('/net-earnings', readLimiter, authorize(['stats.read.admin']), statsController.getNetEarnings);

// GET /api/stats/treatment-status?from=&to=&group=day|week|month|year
router.get('/treatment-status', readLimiter, authorize(['stats.read.admin']), statsController.getTreatmentStatus);

// GET /api/stats/inactive-patients
router.get('/inactive-patients', readLimiter, authorize(['stats.read.admin']), statsController.getInactivePatients);

// GET /api/stats/common-treatments?from=&to=
router.get('/common-treatments', readLimiter, authorize(['stats.read.admin']), statsController.getMostCommonTreatments);

// GET /api/stats/treatment-duration?from=&to=
router.get('/treatment-duration', readLimiter, authorize(['stats.read.admin']), statsController.getTreatmentDuration);

module.exports = router;

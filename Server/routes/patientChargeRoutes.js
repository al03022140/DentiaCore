const express = require('express');
const router = express.Router();
const patientChargeController = require('../controllers/patientChargeController');
const { authorize } = require('../middlewares/authorize');
const { writeLimiter, readLimiter } = require('../middlewares/rateLimiter');

router.get('/', readLimiter, authorize(['cash.read']), patientChargeController.getAllCharges);
router.get('/:patientId', readLimiter, authorize(['cash.read']), patientChargeController.getChargesByPatient);
router.post('/:patientId', writeLimiter, authorize(['cash.manage']), patientChargeController.createCharge);
router.post('/:chargeId/payment', writeLimiter, authorize(['cash.manage']), patientChargeController.addPayment);

module.exports = router;

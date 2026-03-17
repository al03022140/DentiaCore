const express = require('express');
const router = express.Router();
const patientChargeController = require('../controllers/patientChargeController');
const { authorize } = require('../middlewares/authorize');

router.get('/', authorize(['cash.read']), patientChargeController.getAllCharges);
router.get('/:patientId', authorize(['cash.read']), patientChargeController.getChargesByPatient);
router.post('/:patientId', authorize(['cash.manage']), patientChargeController.createCharge);
router.post('/:chargeId/payment', authorize(['cash.manage']), patientChargeController.addPayment);

module.exports = router;

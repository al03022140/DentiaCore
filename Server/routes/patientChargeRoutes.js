const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const router = express.Router();
const patientChargeController = require('../controllers/patientChargeController');
const { authorize } = require('../middlewares/authorize');
const { writeLimiter, readLimiter } = require('../middlewares/rateLimiter');

const withValidation = (rules) => [
  ...rules,
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Datos inválidos',
        errors: errors.array()
      });
    }
    next();
  }
];

router.get(
  '/',
  readLimiter,
  authorize(['cash.read']),
  withValidation([
    query('limit').optional().isInt({ min: 1, max: 500 }).toInt(),
    query('skip').optional().isInt({ min: 0, max: 100000 }).toInt(),
    query('pendingOnly').optional().isIn(['true', 'false'])
  ]),
  patientChargeController.getAllCharges
);
router.get(
  '/:patientId',
  readLimiter,
  authorize(['cash.read']),
  withValidation([
    param('patientId').isMongoId().withMessage('patientId inválido')
  ]),
  patientChargeController.getChargesByPatient
);
router.post(
  '/:patientId',
  writeLimiter,
  authorize(['cash.manage']),
  withValidation([
    param('patientId').isMongoId().withMessage('patientId inválido'),
    body('items').isArray({ min: 1, max: 50 }).withMessage('Debe incluir 1-50 items'),
    body('items.*.nombre').isString().trim().isLength({ min: 1, max: 120 })
      .withMessage('Nombre de item requerido (1-120 caracteres)'),
    body('items.*.cantidad').isInt({ min: 1, max: 1000 }).toInt()
      .withMessage('Cantidad entre 1 y 1000'),
    body('items.*.precioUnitario').isFloat({ min: 0, max: 100000000 }).toFloat()
      .withMessage('Precio entre 0 y 100,000,000'),
    body('appointmentId').optional({ nullable: true, values: 'falsy' }).isMongoId()
      .withMessage('appointmentId inválido'),
    body('fecha').optional().isISO8601().toDate(),
    body('confirmacion').isString().trim().notEmpty().withMessage('Confirmación requerida')
  ]),
  patientChargeController.createCharge
);
router.post(
  '/:chargeId/payment',
  writeLimiter,
  authorize(['cash.manage']),
  withValidation([
    param('chargeId').isMongoId().withMessage('chargeId inválido'),
    body('monto').isFloat({ gt: 0, max: 100000000 }).toFloat()
      .withMessage('Monto entre 0.01 y 100,000,000'),
    body('paymentMethod').isIn(['CASH', 'DIGITAL'])
      .withMessage('Método de pago debe ser CASH o DIGITAL'),
    body('confirmacion').isString().trim().notEmpty().withMessage('Confirmación requerida')
  ]),
  patientChargeController.addPayment
);
router.post(
  '/:chargeId/cancel',
  writeLimiter,
  authorize(['cash.manage']),
  withValidation([
    param('chargeId').isMongoId().withMessage('chargeId inválido'),
    body('motivo').isString().trim().isLength({ min: 3, max: 500 })
      .withMessage('Motivo debe tener entre 3 y 500 caracteres'),
    body('confirmacion').isString().trim().notEmpty().withMessage('Confirmación requerida'),
    body('reversePayments').optional().isBoolean().withMessage('reversePayments debe ser booleano')
  ]),
  patientChargeController.cancelCharge
);

module.exports = router;

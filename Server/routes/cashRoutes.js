const express = require('express');
const { body, query, validationResult } = require('express-validator');
const router = express.Router();
const cashController = require('../controllers/cashController');
const { authorize } = require('../middlewares/authorize');
const { writeLimiter, readLimiter } = require('../middlewares/rateLimiter');

// Helper de validación para responder 400 con detalles claros
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

router.get('/balance/monthly', readLimiter, authorize(['cash.read']), cashController.getMonthlyBalance);
router.get('/session/balance', readLimiter, authorize(['cash.read']), cashController.getSessionBalance);
router.get('/session/status', readLimiter, authorize(['cash.read']), cashController.getSessionStatus);
router.post(
	'/session/open',
	writeLimiter,
	authorize(['cash.manage']),
	withValidation([
		body('initialAmount')
			.optional()
			.isFloat({ min: 0 })
			.withMessage('El monto inicial debe ser un número mayor o igual a 0')
			.toFloat()
	]),
	cashController.openBox
);
router.post('/session/close', writeLimiter, authorize(['cash.manage']), cashController.closeBox);
router.post(
	'/movements',
	writeLimiter,
	authorize(['cash.manage']),
	withValidation([
		body('amount')
			.exists().withMessage('El monto es obligatorio')
			.isFloat({ gt: 0 }).withMessage('El monto debe ser un número mayor a 0')
			.toFloat(),
		body('type')
			.isIn(['INCOME', 'EXPENSE']).withMessage('Tipo debe ser INCOME o EXPENSE'),
		body('paymentMethod')
			.isIn(['CASH', 'DIGITAL']).withMessage('Método de pago debe ser CASH o DIGITAL'),
		body('concept')
			.isString().withMessage('Concepto debe ser texto')
			.trim()
			.notEmpty().withMessage('Concepto es obligatorio'),
		body('patientId')
			.optional({ values: 'falsy' })
			.isMongoId().withMessage('patientId debe ser un ObjectId válido')
	]),
	cashController.addMovement
);
router.get(
	'/movements',
	readLimiter,
	authorize(['cash.read']),
	withValidation([
		query('patientId')
			.optional()
			.isMongoId().withMessage('patientId debe ser un ObjectId válido')
	]),
	cashController.getLastMovements
);
router.put(
	'/movements/:id',
	writeLimiter,
	authorize(['cash.manage']),
	withValidation([
		body('amount')
			.optional()
			.isFloat({ gt: 0 }).withMessage('El monto debe ser un número mayor a 0')
			.toFloat(),
		body('paymentMethod')
			.optional()
			.isIn(['CASH', 'DIGITAL']).withMessage('Método de pago debe ser CASH o DIGITAL'),
		body('concept')
			.optional()
			.isString().withMessage('Concepto debe ser texto')
			.trim()
			.notEmpty().withMessage('Concepto no puede estar vacío'),
		body('patientId')
			.optional({ nullable: true })
			.custom(v => v === null || /^[a-f\d]{24}$/i.test(String(v)))
			.withMessage('patientId debe ser un ObjectId válido o null'),
		body('reason')
			.isString().withMessage('Motivo debe ser texto')
			.trim()
			.isLength({ min: 3 }).withMessage('Motivo es obligatorio (mínimo 3 caracteres)')
	]),
	cashController.updateMovement
);

module.exports = router;

const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const cashController = require('../controllers/cashController');

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

router.get('/balance/monthly', cashController.getMonthlyBalance);
router.get('/session/status', cashController.getSessionStatus);
router.post(
	'/session/open',
	withValidation([
		body('initialAmount')
			.optional()
			.isFloat({ min: 0 })
			.withMessage('El monto inicial debe ser un número mayor o igual a 0')
			.toFloat()
	]),
	cashController.openBox
);
router.post('/session/close', cashController.closeBox);
router.post(
	'/movements',
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
router.get('/movements', cashController.getLastMovements);

module.exports = router;

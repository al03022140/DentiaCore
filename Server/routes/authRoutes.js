const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { validationResult } = require('express-validator');
const authController = require('../controllers/authController');
const authenticate = require('../middlewares/authenticate');

const router = express.Router();

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    message: 'Demasiados intentos de login. Intente nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

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
    return next();
  }
];

router.post(
  '/login',
  loginRateLimit,
  withValidation([
    body('email').isEmail().withMessage('Email inválido'),
    body('contraseña').isString().notEmpty().withMessage('Contraseña requerida')
  ]),
  authController.login
);

router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

// ── PIN y Modo Cortina (roles.MD §9.3) ────────────────────────
router.post('/set-pin', authenticate, withValidation([
  body('pin').isString().isLength({ min: 4, max: 4 }).matches(/^\d{4}$/).withMessage('PIN debe ser 4 dígitos')
]), authController.setPin);

router.post('/verify-pin', authenticate, withValidation([
  body('pin').isString().isLength({ min: 4, max: 4 }).matches(/^\d{4}$/).withMessage('PIN debe ser 4 dígitos')
]), authController.verifyPin);

router.post('/lock-screen', authenticate, authController.lockScreen);
router.post('/unlock-screen', authenticate, authController.unlockScreen);

module.exports = router;

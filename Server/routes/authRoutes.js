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

const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    message: 'Demasiadas solicitudes de restablecimiento. Intente nuevamente en 15 minutos.'
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

// ── Password Reset (rate limited, no auth required) ───────────
router.post(
  '/forgot-password',
  passwordResetRateLimit,
  withValidation([
    body('email').isEmail().withMessage('Email inválido')
  ]),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  passwordResetRateLimit,
  withValidation([
    body('token').isString().notEmpty().withMessage('Token requerido'),
    body('newPassword').isString().isLength({ min: 8 }).withMessage('Contraseña inválida (mín. 8 caracteres)')
  ]),
  authController.resetPassword
);

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

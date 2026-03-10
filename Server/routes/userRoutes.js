const express = require('express');
const { body, param, validationResult } = require('express-validator');
const usersController = require('../controllers/usersController');
const authorize = require('../middlewares/authorize');

const router = express.Router();

const withValidation = (rules) => [
  ...rules,
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Datos inválidos', errors: errors.array() });
    }
    return next();
  }
];

router.get('/', authorize(['users.read']), usersController.getAllUsers);

router.post(
  '/',
  authorize(['users.create']),
  withValidation([
    body('nombre').isString().notEmpty().withMessage('Nombre requerido'),
    body('email').isEmail().withMessage('Email inválido'),
    body('contraseña').isString().isLength({ min: 8 }).withMessage('Contraseña inválida'),
    body('rol').isString().notEmpty().withMessage('Rol requerido')
  ]),
  usersController.createUser
);

router.get(
  '/:id',
  authorize(['users.read']),
  withValidation([param('id').isMongoId().withMessage('ID inválido')]),
  usersController.getUserById
);

router.put(
  '/:id',
  authorize(['users.update']),
  withValidation([param('id').isMongoId().withMessage('ID inválido')]),
  usersController.updateUser
);

router.patch(
  '/:id/disable',
  authorize(['users.disable']),
  withValidation([param('id').isMongoId().withMessage('ID inválido')]),
  usersController.disableUser
);

module.exports = router;

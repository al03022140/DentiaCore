/**
 * Rutas para [ENTIDAD]
 * Sigue las convenciones de nomenclatura del proyecto
 * 
 * Convenciones:
 * - Rutas: kebab-case
 * - Parámetros: camelCase
 * - Middlewares: camelCase
 * - Validaciones: descriptivas en español
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');

// Importar controlador
const [entidad]Ctrl = require('../controllers/[entidad]Controller');

// Importar middlewares
const checkPatient = require('../middlewares/checkPatient');
const {
  ValidationError,
  FileTooLargeError,
  UnsupportedMediaTypeError
} = require('../helpers/odontograma');

// Middleware de validación de ID
const validateId = (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ 
      success: false, 
      error: { 
        code: 'INVALID_ID', 
        message: 'ID de [entidad] inválido' 
      } 
    });
  }
  next();
};

// Middleware de validación de datos requeridos
const validateRequired[Entidad]Data = (req, res, next) => {
  const { nombre } = req.body;
  
  if (!nombre || nombre.trim() === '') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_REQUIRED_FIELDS',
        message: 'El nombre es obligatorio',
        fields: ['nombre']
      }
    });
  }
  
  // Validaciones adicionales específicas
  if (nombre.length < 2) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'El nombre debe tener al menos 2 caracteres'
      }
    });
  }
  
  next();
};

// Configuración de Multer para archivos (si aplica)
const uploadArchivos = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '..', 'uploads', '[entidades]');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `[entidad]-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const tiposPermitidos = ['image/jpeg', 'image/png', 'application/pdf'];
    if (tiposPermitidos.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new UnsupportedMediaTypeError('Solo se aceptan imágenes JPG, PNG o archivos PDF'));
    }
  }
});

// Middleware para manejar errores de Multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'El archivo excede el tamaño máximo permitido (5MB)'
        }
      });
    }
    return res.status(400).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: 'Error al subir el archivo'
      }
    });
  }
  
  // Manejar errores personalizados
  if (err instanceof UnsupportedMediaTypeError) {
    return res.status(415).json({
      success: false,
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: err.message
      }
    });
  }
  
  if (err instanceof ValidationError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message
      }
    });
  }
  
  if (err instanceof FileTooLargeError) {
    return res.status(413).json({
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: err.message
      }
    });
  }
  
  next(err);
};

/**
 * @swagger
 * components:
 *   schemas:
 *     [Entidad]:
 *       type: object
 *       required:
 *         - nombre
 *       properties:
 *         nombre:
 *           type: string
 *           description: Nombre de la [entidad]
 *           example: "Ejemplo de [entidad]"
 *         descripcion:
 *           type: string
 *           description: Descripción de la [entidad]
 *           example: "Descripción detallada"
 *         estado:
 *           type: string
 *           enum: [Activo, Inactivo, Pendiente, Completado]
 *           description: Estado actual de la [entidad]
 *           example: "Activo"
 *     [Entidad]Response:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         [entidad]:
 *           $ref: '#/components/schemas/[Entidad]'
 *         message:
 *           type: string
 *           example: "[Entidad] obtenida exitosamente"
 *     [Entidades]ListResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         [entidades]:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/[Entidad]'
 *         pagination:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               example: 100
 *             page:
 *               type: integer
 *               example: 1
 *             limit:
 *               type: integer
 *               example: 10
 *             pages:
 *               type: integer
 *               example: 10
 */

/**
 * @swagger
 * /api/[entidades]:
 *   get:
 *     summary: Obtener todas las [entidades]
 *     tags: [[Entidades]]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Elementos por página
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [Activo, Inactivo, Pendiente, Completado]
 *         description: Filtrar por estado
 *     responses:
 *       200:
 *         description: Lista de [entidades] obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/[Entidades]ListResponse'
 *       500:
 *         description: Error interno del servidor
 *   post:
 *     summary: Crear nueva [entidad]
 *     tags: [[Entidades]]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/[Entidad]'
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               archivo:
 *                 type: string
 *                 format: binary
 *                 description: Archivo adjunto (opcional)
 *     responses:
 *       201:
 *         description: [Entidad] creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/[Entidad]Response'
 *       400:
 *         description: Datos inválidos
 *       409:
 *         description: [Entidad] ya existe
 */

// ── Rutas básicas de [entidades] ───────────────────────────────────
router
  .route('/')
  .get([entidad]Ctrl.getAll[Entidades])
  .post(
    uploadArchivos.single('archivo'), 
    handleMulterError, 
    validateRequired[Entidad]Data, 
    [entidad]Ctrl.create[Entidad]
  );

/**
 * @swagger
 * /api/[entidades]/{id}:
 *   get:
 *     summary: Obtener [entidad] por ID
 *     tags: [[Entidades]]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la [entidad]
 *     responses:
 *       200:
 *         description: [Entidad] obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/[Entidad]Response'
 *       404:
 *         description: [Entidad] no encontrada
 *       400:
 *         description: ID inválido
 *   put:
 *     summary: Actualizar [entidad]
 *     tags: [[Entidades]]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la [entidad]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/[Entidad]'
 *     responses:
 *       200:
 *         description: [Entidad] actualizada exitosamente
 *       404:
 *         description: [Entidad] no encontrada
 *       400:
 *         description: Datos inválidos
 *   delete:
 *     summary: Eliminar [entidad]
 *     tags: [[Entidades]]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la [entidad]
 *     responses:
 *       200:
 *         description: [Entidad] eliminada exitosamente
 *       404:
 *         description: [Entidad] no encontrada
 *       400:
 *         description: ID inválido
 */

// ── Rutas de [entidad] específica ─────────────────────────────────
router
  .route('/:id')
  .all(validateId)
  .get([entidad]Ctrl.get[Entidad]ById)
  .put(
    uploadArchivos.single('archivo'), 
    handleMulterError, 
    validateRequired[Entidad]Data, 
    [entidad]Ctrl.update[Entidad]
  )
  .delete([entidad]Ctrl.delete[Entidad]);

// ── Rutas adicionales específicas ─────────────────────────────────

/**
 * @swagger
 * /api/[entidades]/estado/{estado}:
 *   get:
 *     summary: Obtener [entidades] por estado
 *     tags: [[Entidades]]
 *     parameters:
 *       - in: path
 *         name: estado
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Activo, Inactivo, Pendiente, Completado]
 *         description: Estado a filtrar
 *     responses:
 *       200:
 *         description: [Entidades] filtradas por estado
 */
router.get('/estado/:estado', (req, res, next) => {
  const estadosValidos = ['Activo', 'Inactivo', 'Pendiente', 'Completado'];
  if (!estadosValidos.includes(req.params.estado)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_STATUS',
        message: 'Estado inválido',
        validStates: estadosValidos
      }
    });
  }
  next();
}, [entidad]Ctrl.get[Entidades]ByEstado);

/**
 * @swagger
 * /api/[entidades]/buscar:
 *   get:
 *     summary: Buscar [entidades] por término
 *     tags: [[Entidades]]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Término de búsqueda
 *     responses:
 *       200:
 *         description: Resultados de búsqueda
 */
router.get('/buscar', (req, res, next) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_SEARCH_TERM',
        message: 'El término de búsqueda debe tener al menos 2 caracteres'
      }
    });
  }
  next();
}, [entidad]Ctrl.buscar[Entidades]);

/**
 * @swagger
 * /api/[entidades]/estadisticas:
 *   get:
 *     summary: Obtener estadísticas de [entidades]
 *     tags: [[Entidades]]
 *     responses:
 *       200:
 *         description: Estadísticas obtenidas exitosamente
 */
router.get('/estadisticas', [entidad]Ctrl.getEstadisticas[Entidades]);

// ── Rutas de archivos (si aplica) ─────────────────────────────────
router.post('/:id/archivos', 
  validateId,
  uploadArchivos.array('archivos', 5), 
  handleMulterError, 
  [entidad]Ctrl.upload[Entidad]Files
);

router.delete('/:id/archivos/:archivoId', 
  validateId,
  [entidad]Ctrl.delete[Entidad]File
);

// Middleware de manejo de errores global para estas rutas
router.use((err, req, res, next) => {
  console.error('❌ Error en rutas de [entidades]:', err);
  
  // Error de validación de Mongoose
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Error de validación',
        details: Object.values(err.errors).map(e => e.message)
      }
    });
  }
  
  // Error de duplicación
  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_ERROR',
        message: 'Ya existe un registro con estos datos'
      }
    });
  }
  
  // Error genérico
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Error interno del servidor'
    }
  });
});

module.exports = router;

/**
 * INSTRUCCIONES DE USO:
 * 
 * 1. Reemplazar [ENTIDAD] con el nombre de la entidad en mayúsculas
 * 2. Reemplazar [Entidad] con el nombre de la entidad en PascalCase
 * 3. Reemplazar [entidad] con el nombre de la entidad en camelCase
 * 4. Reemplazar [entidades] con el plural de la entidad en camelCase
 * 5. Reemplazar [Entidades] con el plural de la entidad en PascalCase
 * 6. Adaptar las validaciones según los campos específicos
 * 7. Configurar Multer según los tipos de archivo necesarios
 * 8. Ajustar la documentación Swagger según los campos reales
 * 9. Implementar rutas adicionales según las necesidades
 * 10. Configurar middlewares específicos si es necesario
 * 
 * Ejemplo para "Tratamiento":
 * - [ENTIDAD] → TRATAMIENTO
 * - [Entidad] → Tratamiento
 * - [entidad] → tratamiento
 * - [entidades] → tratamientos
 * - [Entidades] → Tratamientos
 * 
 * NOTAS IMPORTANTES:
 * - Mantener rutas en kebab-case
 * - Validaciones claras y mensajes en español
 * - Documentación Swagger completa
 * - Manejo de errores consistente
 * - Middlewares reutilizables
 * - Respuestas estructuradas con success/error
 */
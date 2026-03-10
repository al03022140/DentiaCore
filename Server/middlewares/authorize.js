const { hasPermission, isAdminRole, isClinicalRole } = require('../utils/permissions');

/**
 * Middleware de autorización por permisos.
 *
 * @param {string[]} requiredPermissions - Permisos requeridos (OR — al menos uno).
 * @param {object}   [options]
 * @param {boolean}  [options.requireMotivo] - Si true, exige `req.body.motivo` (superadmin).
 * @returns Express middleware
 */
const authorize = (requiredPermissions = [], options = {}) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }

  const role = req.user.role;

  // Superadmin y administrador pasan las verificaciones de permisos clínica
  if (isAdminRole(role)) {
    // Superadmin requiere motivo en toda operación de escritura
    if (role === 'superadmin' && options.requireMotivo && req.method !== 'GET') {
      if (!req.body?.motivo) {
        return res.status(400).json({
          message: 'El rol superadmin requiere un campo "motivo" en cada operación de escritura'
        });
      }
    }
    return next();
  }

  if (!hasPermission(req.user.permissions, requiredPermissions)) {
    return res.status(403).json({ message: 'Permisos insuficientes para esta operación' });
  }

  return next();
};

/**
 * Middleware que restringe campos de paciente según permiso.
 * Si el usuario tiene `patients.read.basic` pero NO `patients.read`,
 * filtra los campos clínicos de la respuesta.
 *
 * Se aplica DESPUÉS de que el controller haya obtenido los datos.
 */
const filterPatientFields = (req, res, next) => {
  if (!req.user) return next();

  const perms = req.user.permissions || [];
  const role = req.user.role;

  // Admins y roles clínicos ven todo
  if (isAdminRole(role) || isClinicalRole(role)) return next();

  // Si tiene patients.read completo, no filtra
  if (hasPermission(perms, ['patients.read'])) return next();

  // Si solo tiene patients.read.basic, marcamos para filtrar
  if (hasPermission(perms, ['patients.read.basic'])) {
    req.filterClinicalData = true;
  }

  return next();
};

/**
 * Campos permitidos para `patients.read.basic` (recepcionista).
 * Todo lo demás se elimina de la respuesta.
 */
const BASIC_PATIENT_FIELDS = [
  '_id', 'paciente_id', 'primer_nombre', 'otros_nombres',
  'apellido_paterno', 'apellido_materno', 'fecha_nacimiento',
  'edad', 'sexo', 'photoURL', 'documento', 'contacto',
  'contactos_emergencia', 'createdAt', 'updatedAt',
  'fullName', 'edadCalculada', 'emailActual', 'telefonoActual',
];

/**
 * Filtra campos clínicos de un objeto paciente.
 * Devuelve solo los campos básicos (contacto).
 */
const sanitizePatientForBasicRead = (patient) => {
  if (!patient) return patient;
  const obj = typeof patient.toObject === 'function' ? patient.toObject() : { ...patient };
  const filtered = {};
  for (const key of BASIC_PATIENT_FIELDS) {
    if (obj[key] !== undefined) filtered[key] = obj[key];
  }
  return filtered;
};

/**
 * Middleware que requiere que el usuario sea un rol clínico
 * (doctor o asistente) para acceder a datos clínicos.
 * NOM-004 Art. 5.7 + LFPDPPP Art. 9
 */
const requireClinicalRole = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }
  if (isAdminRole(req.user.role) || isClinicalRole(req.user.role)) {
    return next();
  }
  return res.status(403).json({
    message: 'Acceso restringido a personal clínico (NOM-004 Art. 5.7)'
  });
};

module.exports = authorize;
module.exports.authorize = authorize;
module.exports.filterPatientFields = filterPatientFields;
module.exports.sanitizePatientForBasicRead = sanitizePatientForBasicRead;
module.exports.requireClinicalRole = requireClinicalRole;
module.exports.BASIC_PATIENT_FIELDS = BASIC_PATIENT_FIELDS;

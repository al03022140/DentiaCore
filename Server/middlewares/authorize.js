const { hasPermission, isAdminRole, isClinicalRole, normalizeRole } = require('../utils/permissions');

/**
 * Middleware de autorización por permisos.
 *
 * Reglas:
 * - `superadmin` (programador/soporte) — bypasa el chequeo de permisos pero
 *   DEBE incluir `motivo` en el body para toda escritura (POST/PUT/PATCH/DELETE).
 *   Roles.MD §2: "Toda operación realizada con este rol debe generar una
 *   entrada en el log de auditoría con `motivo` obligatorio".
 * - `administrador` (dueño de clínica) — NO bypasa. Sus permisos están
 *   declarados explícitamente en `permissions.js` (sin wildcard). El admin
 *   NO puede escribir contenido clínico (NOM-013: exclusividad del dentista).
 * - Los demás roles pasan por `hasPermission`.
 *
 * @param {string[]} requiredPermissions - Permisos requeridos (OR — al menos uno).
 * @returns Express middleware
 */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const authorize = (requiredPermissions = []) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }

  const role = normalizeRole(req.user.role);

  // superadmin bypasea TODOS los permisos pero exige `motivo` en escrituras.
  if (role === 'superadmin') {
    if (WRITE_METHODS.has(req.method)) {
      const motivo = req.body?.motivo;
      if (!motivo || typeof motivo !== 'string' || motivo.trim().length < 3) {
        return res.status(400).json({
          message: 'El rol superadmin requiere un campo "motivo" (≥3 caracteres) en cada operación de escritura'
        });
      }
    }
    return next();
  }

  // El administrador YA NO bypasea: cae al chequeo normal de permisos.
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
 * Campos que el recepcionista puede ESCRIBIR cuando sólo tiene
 * `patients.create.basic` / `patients.update.basic`. Nada del expediente
 * clínico (encuesta médica, antecedentes, evaluación dental, etc.).
 * roles.MD §2 (recepcionista): "Crear pacientes (ficha básica de
 * identificación, sin historia clínica)".
 */
const BASIC_PATIENT_WRITE_FIELDS = [
  'documento',
  'primer_nombre', 'otros_nombres', 'apellido_paterno', 'apellido_materno',
  'fecha_nacimiento', 'sexo',
  'estado_civil', 'nacionalidad', 'lugar_nacimiento', 'escolaridad', 'ocupacion',
  'email',
  'situacion_laboral',
  'contacto',
  'contactos_emergencia',
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
module.exports.BASIC_PATIENT_WRITE_FIELDS = BASIC_PATIENT_WRITE_FIELDS;

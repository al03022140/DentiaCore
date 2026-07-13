const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../utils/crypto');
const {
  getEffectivePermissions,
  hasPermission,
  isAdminRole,
  isClinicalRole,
} = require('../utils/permissions');
const Usuario = require('../models/users');
const ClinicSettings = require('../models/clinicSettings');

const getJwtIssuer = () => process.env.JWT_ISSUER || 'dentia-core';

/**
 * Gate de autenticación + AUTORIZACIÓN para los archivos de /uploads (PHI).
 *
 * Hallazgo C-1: /uploads se servía público. Primero se cerró exigiendo una
 * sesión válida; ahora además se aplica autorización por tipo de archivo:
 *
 *   - /uploads/pacientes/<id>/profile-pic/...  → foto de contacto (BÁSICO):
 *       basta una sesión válida. La foto se muestra en muchas listas de la UI
 *       (citas, caja, próximo paciente) vía <img>, así que NO se restringe por
 *       permiso para no romper esas miniaturas.
 *   - /uploads/pacientes/<id>/<otra-subcarpeta>/... → expediente CLÍNICO
 *       (odontograma, adjuntos, firmas de notas/HC): exige `patients.read` o
 *       rol clínico/admin. Así un rol sin acceso al expediente (p. ej. caja)
 *       no puede descargar archivos clínicos adivinando la URL.
 *   - Resto (/uploads/logos, /uploads/firmas a nivel raíz): sesión válida.
 *
 * Doble forma de autenticación: header `Authorization: Bearer <accessToken>`
 * (axios/fetch de blobs) o cookie httpOnly `refreshToken` (que el navegador
 * envía con `<img>` en mismo origen). El access token ya trae role+permissions;
 * la cookie solo trae el id, así que para autorizar contenido clínico vía cookie
 * se cargan los permisos efectivos desde la BD.
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, getJwtSecret(), { issuer: getJwtIssuer(), algorithms: ['HS256'] });
  } catch (_e) {
    return null;
  }
};

// Subcarpetas de paciente consideradas NO clínicas (nivel contacto/básico).
const BASIC_PATIENT_SUBDIRS = new Set(['profile-pic']);

/**
 * Clasifica una ruta relativa a /uploads en 'clinical' | 'basic' | 'non-patient'.
 * Pura y determinista (exportada para pruebas).
 * @param {string} relPath  ej. '/pacientes/<id>/odontograma-inicial/<file>'
 */
const classifyUploadPath = (relPath) => {
  const parts = String(relPath || '').split('/').filter(Boolean);
  // SEC-03: la firma digital del doctor (PNG legalmente vinculante, NOM-004
  // Art. 5.10 / NOM-013) NO es un archivo genérico de sesión: se trata como
  // recurso clínico para que un rol sin acceso al expediente (p. ej. recepción)
  // no pueda descargarla adivinando la URL. Los logos (marca de la clínica)
  // siguen siendo 'non-patient' (basta sesión).
  if (parts[0] === 'firmas') return 'clinical';
  if (parts[0] !== 'pacientes') return 'non-patient';
  const subdir = parts[2] || '';
  return BASIC_PATIENT_SUBDIRS.has(subdir) ? 'basic' : 'clinical';
};

// ¿Hay una sesión válida? (sin resolver permisos) — para rutas no clínicas.
const hasValidSession = (req) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const payload = verifyToken(authHeader.slice(7).trim());
    if (payload && payload.type !== 'refresh') return true;
  }
  const cookieToken = req.cookies && req.cookies.refreshToken;
  if (cookieToken) {
    const payload = verifyToken(cookieToken);
    if (payload && payload.type === 'refresh') return true;
  }
  return false;
};

// Resuelve { role, permissions } del solicitante para decisiones de autorización.
// Bearer: directo del payload. Cookie: cargando usuario + permisos efectivos.
const resolveActor = async (req) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const payload = verifyToken(authHeader.slice(7).trim());
    if (payload && payload.type !== 'refresh') {
      return { role: payload.role, permissions: payload.permissions || [] };
    }
  }
  const cookieToken = req.cookies && req.cookies.refreshToken;
  if (cookieToken) {
    const payload = verifyToken(cookieToken);
    if (payload && payload.type === 'refresh' && payload.sub) {
      const user = await Usuario.findById(payload.sub)
        .select('rol permissions active')
        .lean();
      if (!user || user.active === false) return null;
      let roleOverrides = null;
      try {
        const settings = await ClinicSettings.getSettings();
        roleOverrides = settings && settings.rolePermissionOverrides;
      } catch (_e) {
        roleOverrides = null; // sin overrides → permisos base del rol
      }
      return { role: user.rol, permissions: getEffectivePermissions(user, roleOverrides) };
    }
  }
  return null;
};

// ¿El actor puede leer el expediente clínico de pacientes?
// Pura (exportada para pruebas).
const canAccessClinical = (actor) =>
  !!actor &&
  (isAdminRole(actor.role) ||
    isClinicalRole(actor.role) ||
    hasPermission(actor.permissions || [], ['patients.read']));

const uploadsAuth = async (req, res, next) => {
  try {
    // req.path es relativo al mount '/uploads'.
    const level = classifyUploadPath(req.path);

    if (level === 'clinical') {
      const actor = await resolveActor(req);
      if (!actor) {
        return res.status(401).json({ message: 'No autorizado para acceder a este archivo' });
      }
      if (!canAccessClinical(actor)) {
        return res.status(403).json({ message: 'No tiene permiso para acceder a este archivo clínico' });
      }
      return next();
    }

    // 'basic' (foto) y 'non-patient' (logos, firmas raíz): basta sesión válida.
    if (!hasValidSession(req)) {
      return res.status(401).json({ message: 'No autorizado para acceder a este archivo' });
    }
    return next();
  } catch (_e) {
    return res.status(500).json({ message: 'Error de autorización de archivo' });
  }
};

module.exports = uploadsAuth;
module.exports.classifyUploadPath = classifyUploadPath;
module.exports.canAccessClinical = canAccessClinical;

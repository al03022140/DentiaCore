/**
 * Sistema de Roles y Permisos — DentiaCore
 *
 * Basado en: NOM-004-SSA3-2012, NOM-024-SSA3-2012,
 *            NOM-013-SSA1-2015, LFPDPPP (2025).
 *
 * Cada rol respeta el principio de mínimo privilegio (LFPDPPP Art. 6).
 * Ver roles.MD en la raíz del proyecto para la documentación completa.
 */

const ROLE_PERMISSIONS = {
  // ─── Solo para el programador / soporte técnico ───────────────
  superadmin: [
    '*',                 // wildcard clínica
    'system.*',          // config técnica, migraciones
    'audit.read.full',   // logs completos incluyendo sistema
    'maintenance.*',     // respaldos, restauración, scripts
    'session.lock',
  ],

  // ─── Dueño / Director de la clínica ──────────────────────────
  administrador: [
    '*',                 // todos los permisos de clínica
    // NO tiene system.* ni maintenance.*
    'session.lock',
  ],

  // ─── Cirujano Dentista (NOM-013) ─────────────────────────────
  doctor: [
    'patients.read',
    'patients.create',
    'patients.update',
    // NO patients.delete — NOM-004 Art. 5.4: solo admin puede archivar
    'odontogram.read',
    'odontogram.create',
    'odontogram.update',
    'periodontogram.read',
    'periodontogram.create',
    'periodontogram.update',
    'consultas.read',
    'consultas.create',
    'consultas.update',
    'exams.read',
    'exams.create',
    'exams.update',
    'appointments.read',
    'appointments.create',
    'appointments.update',
    // NO appointments.delete — solo admin/recepcionista
    'stats.read.own',
    // NO cash.read — LFPDPPP Art. 6: proporcionalidad, no necesario para función clínica
    'draft.approve',            // transicionar DRAFT → OFICIAL con firma
    'drafts.batch_sign',        // firmar borradores en lote (Centro de Firmas Pendientes)
    'notes.create.backdated',   // captura extemporánea — requiere motivo
    'notes.template.use',       // plantillas de evolución Anti-Olvidos
    'session.lock',             // Modo Cortina
    // Legacy periodontogram permissions (compatibilidad)
    'read_periodontogram',
    'create_periodontogram',
    'update_periodontogram',
  ],

  // ─── Asistente Dental (NOM-013: bajo supervisión directa) ────
  asistente: [
    'patients.read',
    'odontogram.read',
    'odontogram.write.draft',        // captura en borrador durante procedimiento
    'periodontogram.read',
    'periodontogram.write.draft',    // captura en borrador durante procedimiento
    'consultas.read',
    'consultas.create.draft',        // redacción de nota en borrador
    'consultas.update.draft',        // edición de borrador propio
    'appointments.read',
    'notes.template.use',            // plantillas de evolución Anti-Olvidos
    'session.lock',                  // Modo Cortina
    // Legacy
    'read_periodontogram',
  ],

  // ─── Personal administrativo ─────────────────────────────────
  recepcionista: [
    'patients.read.basic',   // solo datos de contacto, NO expediente clínico
    'patients.create.basic',
    'patients.update.basic',
    'appointments.read',
    'appointments.create',
    'appointments.update',
    'appointments.delete',
    'cash.read',
    'cash.manage',
    'stats.read.admin',
    'session.lock',                  // Modo Cortina
  ],
};

/** Todos los roles válidos del sistema */
const VALID_ROLES = Object.keys(ROLE_PERMISSIONS);

const normalizeRole = (role) => (role || '').toString().trim().toLowerCase();

const getPermissionsForRole = (role) => {
  const normalizedRole = normalizeRole(role);
  return ROLE_PERMISSIONS[normalizedRole] || [];
};

const mergePermissions = (basePermissions = [], extraPermissions = []) => {
  const merged = new Set([...(basePermissions || []), ...(extraPermissions || [])]);
  return Array.from(merged);
};

const getEffectivePermissions = (user) => {
  if (!user) return [];
  const basePermissions = getPermissionsForRole(user.rol || user.role);
  return mergePermissions(basePermissions, user.permissions || []);
};

/**
 * Verifica si el usuario tiene al menos uno de los permisos requeridos.
 * Soporta wildcards jerárquicos: 'patients.*' cubre 'patients.read', etc.
 */
const hasPermission = (userPermissions = [], requiredPermissions = []) => {
  if (!requiredPermissions.length) return true;
  if (!userPermissions) return false;
  if (userPermissions.includes('*')) return true;

  return requiredPermissions.some((required) => {
    // Coincidencia exacta
    if (userPermissions.includes(required)) return true;

    // Wildcard jerárquico: 'patients.*' cubre 'patients.read.basic'
    const parts = required.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const prefix = parts.slice(0, i).join('.') + '.*';
      if (userPermissions.includes(prefix)) return true;
    }

    // Permiso padre implícito: 'patients.read' cubre 'patients.read.basic'
    if (required.includes('.')) {
      const parentPerm = required.split('.').slice(0, -1).join('.');
      if (userPermissions.includes(parentPerm)) return true;
    }

    return false;
  });
};

/**
 * Verifica si un rol es de tipo administrador (administrador o superadmin).
 */
const isAdminRole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === 'administrador' || normalized === 'superadmin' || normalized === 'admin';
};

/**
 * Verifica si un rol es clínico (doctor o asistente).
 */
const isClinicalRole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === 'doctor' || normalized === 'asistente';
};

module.exports = {
  ROLE_PERMISSIONS,
  VALID_ROLES,
  normalizeRole,
  getPermissionsForRole,
  getEffectivePermissions,
  hasPermission,
  isAdminRole,
  isClinicalRole,
};

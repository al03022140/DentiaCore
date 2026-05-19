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
  // Lista EXPLÍCITA (no wildcard `*`). roles.MD §3 (matriz) limita al
  // administrador a R sobre contenido clínico — no puede crear/editar
  // odontogramas, periodontogramas, consultas ni exámenes. Eso es
  // exclusivo del cirujano dentista (NOM-013 + NOM-004 Art. 5.10).
  administrador: [
    // Pacientes — CRUD completo (D = soft-delete)
    'patients.read',
    'patients.create',
    'patients.update',
    'patients.delete',
    // Lectura del contenido clínico (sin escritura)
    'odontogram.read',
    'periodontogram.read',
    'consultas.read',
    'exams.read',
    // Citas — CRUD completo
    'appointments.read',
    'appointments.create',
    'appointments.update',
    'appointments.delete',
    // Caja
    'cash.read',
    'cash.manage',
    // Estadísticas — todas
    'stats.read.admin',
    'stats.read.own',
    // Usuarios — CRUD (soft-delete vía disable)
    'users.read',
    'users.create',
    'users.update',
    'users.disable',
    // Configuración
    'settings.read',
    'settings.update',
    // Auditoría (clinic-scope; system events siguen siendo de superadmin)
    'audit.read.full',
    // Modo Cortina (LFPDPPP Art. 19)
    'session.lock',
    // Legacy periodontogram (compatibilidad)
    'read_periodontogram',
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
    'notes.template.manage',    // CRUD de plantillas personales
    'settings.read',            // leer configuración de clínica
    'professional.update',      // actualizar su propio perfil profesional
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
    'exams.read',                    // matriz §3: asistente tiene R sobre exámenes
    'appointments.read',
    'notes.template.use',            // plantillas de evolución Anti-Olvidos
    'settings.read',                 // leer configuración de clínica
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
    'settings.read',                 // leer configuración de clínica
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

/**
 * Calcula los permisos efectivos del usuario:
 * 1. Si existe un override de rol en ClinicSettings.rolePermissionOverrides
 *    para este rol → ese array es AUTORITATIVO (reemplaza la base de
 *    ROLE_PERMISSIONS). Esto permite que el admin pueda tanto agregar
 *    como QUITAR permisos del rol desde la UI de "Cuentas y Permisos".
 * 2. Si no existe override → se usan los permisos base del rol.
 * 3. + Overrides individuales del usuario (user.permissions) — siempre
 *    aditivos sobre el conjunto del rol.
 *
 * @param {Object} user - documento de usuario
 * @param {Object|Map} [roleOverrides] - rolePermissionOverrides de ClinicSettings
 */
const getEffectivePermissions = (user, roleOverrides) => {
  if (!user) return [];
  const role = normalizeRole(user.rol || user.role);

  // ¿Tiene override autoritativo? Aceptamos array vacío como "todo desactivado".
  let override = null;
  if (roleOverrides) {
    const raw = roleOverrides instanceof Map
      ? roleOverrides.get(role)
      : roleOverrides[role];
    if (Array.isArray(raw)) override = raw;
  }

  const rolePermissions = override !== null ? override : getPermissionsForRole(role);
  return mergePermissions(rolePermissions, user.permissions || []);
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

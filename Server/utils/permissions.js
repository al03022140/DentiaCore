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

  // ─── Doctor + Administrador (Director clínico — el dueño-dentista) ──
  // Unión de permisos de `doctor` y `administrador`. Es el dentista que
  // además administra la clínica: puede crear/editar contenido clínico
  // (NOM-013) Y gestionar cuentas, caja, configuración, etc.
  // Jerarquía: solo `superadmin` puede crear o tocar cuentas con este rol.
  doctor_admin: [
    // Pacientes — CRUD completo
    'patients.read', 'patients.create', 'patients.update', 'patients.delete',
    // Clínico (de doctor)
    'odontogram.read', 'odontogram.create', 'odontogram.update',
    'periodontogram.read', 'periodontogram.create', 'periodontogram.update',
    'consultas.read', 'consultas.create', 'consultas.update',
    'exams.read', 'exams.create', 'exams.update',
    // Citas — CRUD completo (delete de admin)
    'appointments.read', 'appointments.create', 'appointments.update', 'appointments.delete',
    // Caja (de admin)
    'cash.read', 'cash.manage',
    // Estadísticas — propias + administrativas
    'stats.read.own', 'stats.read.admin',
    // Usuarios — CRUD (de admin)
    'users.read', 'users.create', 'users.update', 'users.disable',
    // Configuración — read + update (update de admin)
    'settings.read', 'settings.update',
    'professional.update',
    // Auditoría (de admin)
    'audit.read.full',
    // Borradores y firma (de doctor)
    'draft.approve', 'drafts.batch_sign',
    // Notas (de doctor)
    'notes.create.backdated', 'notes.template.use', 'notes.template.manage',
    // Modo Cortina
    'session.lock',
    // Legacy
    'read_periodontogram', 'create_periodontogram', 'update_periodontogram',
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
    // Gestión de cuentas — para consultorios pequeños donde el doctor
    // administra al asistente y a la recepcionista. La jerarquía de roles
    // (usersController.checkPrivilegeEscalation) impide que asigne roles
    // superiores al suyo o toque cuentas administrador/superadmin.
    'users.read',
    'users.create',
    'users.update',
    'users.disable',
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
 * Roles privilegiados cuya base de permisos es INALIENABLE: un override solo
 * puede AÑADIR permisos (UNION con la base), nunca quitarlos. Son los roles que
 * la UI de "Cuentas y Permisos" NO expone como editables — solo el superadmin
 * debería tocarlos, y se gestionan en código. Evita que un override viejo o mal
 * guardado deje a `doctor_admin` (o al administrador) sin Caja, Estadísticas, etc.
 */
const OVERRIDE_PROTECTED_ROLES = ['superadmin', 'administrador', 'doctor_admin'];

const isOverrideProtectedRole = (role) =>
  OVERRIDE_PROTECTED_ROLES.includes(normalizeRole(role));

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

  const base = getPermissionsForRole(role);

  // Roles protegidos (superadmin/administrador/doctor_admin): la base es
  // inalienable. El override sólo SUMA — nunca reduce la base. Garantiza, p. ej.,
  // que doctor_admin SIEMPRE conserve cash.read/cash.manage (Caja en el sidebar).
  if (isOverrideProtectedRole(role)) {
    return mergePermissions(mergePermissions(base, override || []), user.permissions || []);
  }

  // Roles editables (doctor/asistente/recepcionista): el override, si existe, es
  // autoritativo y puede tanto agregar como QUITAR permisos.
  const rolePermissions = override !== null ? override : base;
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
 * Verifica si un rol es de tipo administrador (administrador, doctor_admin o superadmin).
 * `doctor_admin` cuenta como administrador para todas las gates donde se
 * necesita capacidad administrativa (gestión de cuentas, caja, etc.).
 */
const isAdminRole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === 'administrador'
    || normalized === 'superadmin'
    || normalized === 'admin'
    || normalized === 'doctor_admin';
};

/**
 * Verifica si un rol es clínico (doctor, asistente o doctor_admin).
 * `doctor_admin` también es clínico porque practica como dentista
 * (NOM-013 Art. 5.10).
 */
const isClinicalRole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === 'doctor'
    || normalized === 'asistente'
    || normalized === 'doctor_admin';
};

/**
 * Verifica si un rol es FIRMANTE clínico: el profesional dentista que puede
 * firmar registros oficiales y, por tanto, el único que tiene cédula
 * profesional y firma digital (NOM-004 Art. 5.10 + NOM-013).
 *
 * Solo `doctor` y `doctor_admin`. Quedan EXCLUIDOS:
 *  - `administrador`: dirige la clínica pero NO es dentista → no firma ni
 *    sube firma, y no aparece en el selector de doctores de las notas.
 *  - `asistente`: captura en borrador bajo supervisión, no firma como autor.
 *  - `recepcionista`: sin acceso a contenido clínico.
 *
 * Es el mismo conjunto que posee `draft.approve`; usar este helper mantiene
 * la regla en un único lugar y evita gates inconsistentes.
 */
const isSignerRole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === 'doctor' || normalized === 'doctor_admin';
};

/**
 * Catálogo de todos los permisos conocidos del sistema (unión de todos los
 * roles). Se usa como lista blanca al asignar overrides de permisos.
 */
const ALL_KNOWN_PERMISSIONS = Array.from(
  new Set(Object.values(ROLE_PERMISSIONS).flat())
);

/**
 * Permisos peligrosos que SOLO un superadmin puede otorgar. Conceden control
 * total (wildcard de clínica, configuración técnica, mantenimiento) y romperían
 * por completo la jerarquía de roles si los asignara cualquier otro actor.
 */
const SUPERADMIN_ONLY_PERMISSIONS = ['*', 'system.*', 'maintenance.*'];

/**
 * Valida una solicitud para asignar `requestedPermissions` (override de rol o de
 * usuario individual). Previene escalada de privilegios (C-2):
 *  1. `permissions` debe ser un array de strings.
 *  2. Solo se aceptan permisos conocidos (lista blanca `ALL_KNOWN_PERMISSIONS`).
 *  3. Los permisos peligrosos solo los puede otorgar un superadmin.
 *  4. Un actor no-superadmin no puede OTORGAR un permiso que él mismo no posee
 *     (no se puede dar lo que no se tiene → no hay auto-escalada). La regla
 *     aplica SOLO a los permisos AÑADIDOS respecto al conjunto efectivo ACTUAL
 *     del rol/usuario objetivo (`targetCurrentPermissions`): mantener un permiso
 *     que el objetivo ya posee — o quitárselo — no es otorgar nada nuevo. Sin
 *     esta distinción, un administrador no podía guardar el rol Doctor (cuyos
 *     defaults incluyen escrituras clínicas que él no posee) ni siquiera para
 *     QUITAR un toggle → 403 siempre.
 *
 * @param {string[]} requestedPermissions - permisos a asignar (del cliente)
 * @param {Object} actor - { role, permissions } del usuario autenticado (req.user)
 * @param {string[]} [targetCurrentPermissions] - conjunto efectivo ACTUAL del
 *        rol/usuario objetivo (defaults del rol + overrides existentes)
 * @returns {{ valid: boolean, message?: string }}
 */
const validatePermissionAssignment = (requestedPermissions, actor = {}, targetCurrentPermissions = []) => {
  if (!Array.isArray(requestedPermissions)) {
    return { valid: false, message: 'permissions debe ser un array' };
  }
  if (!requestedPermissions.every((p) => typeof p === 'string')) {
    return { valid: false, message: 'permissions debe contener solo cadenas de texto' };
  }

  const actorRole = normalizeRole(actor.role || actor.rol);
  const isSuperadmin = actorRole === 'superadmin';
  const actorPermissions = actor.permissions || [];

  for (const perm of requestedPermissions) {
    // 2. Lista blanca: rechazar permisos desconocidos/inventados
    if (!ALL_KNOWN_PERMISSIONS.includes(perm)) {
      return { valid: false, message: `Permiso desconocido: ${perm}` };
    }

    // 3. Permisos peligrosos: solo superadmin
    if (SUPERADMIN_ONLY_PERMISSIONS.includes(perm) && !isSuperadmin) {
      return { valid: false, message: `No tiene permitido otorgar el permiso: ${perm}` };
    }

    // 4. No se puede otorgar lo que no se tiene (superadmin tiene '*' → todo).
    //    Solo cuenta como "otorgar" si el objetivo NO lo posee ya.
    const alreadyHeldByTarget = hasPermission(targetCurrentPermissions, [perm]);
    if (!isSuperadmin && !alreadyHeldByTarget && !hasPermission(actorPermissions, [perm])) {
      return { valid: false, message: `No puede otorgar un permiso que usted no posee: ${perm}` };
    }
  }

  return { valid: true };
};

module.exports = {
  ROLE_PERMISSIONS,
  VALID_ROLES,
  ALL_KNOWN_PERMISSIONS,
  SUPERADMIN_ONLY_PERMISSIONS,
  OVERRIDE_PROTECTED_ROLES,
  isOverrideProtectedRole,
  normalizeRole,
  getPermissionsForRole,
  getEffectivePermissions,
  hasPermission,
  isAdminRole,
  isClinicalRole,
  isSignerRole,
  validatePermissionAssignment,
};

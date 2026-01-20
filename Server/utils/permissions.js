const ROLE_PERMISSIONS = {
  administrador: ['*'],
  doctor: [
    'patients.read',
    'patients.create',
    'patients.update',
    'odontogram.read',
    'odontogram.create',
    'odontogram.update',
    'periodontogram.read',
    'periodontogram.create',
    'periodontogram.update',
    'consultas.read',
    'consultas.create',
    'consultas.update',
    'stats.read',
    'read_periodontogram',
    'create_periodontogram',
    'update_periodontogram',
    'delete_periodontogram'
  ],
  asistente: [
    'patients.read',
    'odontogram.read',
    'periodontogram.read',
    'consultas.read',
    'read_periodontogram'
  ],
  recepcionista: [
    'patients.read',
    'patients.create',
    'patients.update',
    'consultas.read',
    'consultas.create',
    'consultas.update',
    'cash.read',
    'cash.manage',
    'stats.read'
  ]
};

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

const hasPermission = (userPermissions = [], requiredPermissions = []) => {
  if (!requiredPermissions.length) return true;
  if (!userPermissions) return false;
  if (userPermissions.includes('*')) return true;
  return requiredPermissions.some((permission) => userPermissions.includes(permission));
};

module.exports = {
  ROLE_PERMISSIONS,
  getPermissionsForRole,
  getEffectivePermissions,
  hasPermission
};

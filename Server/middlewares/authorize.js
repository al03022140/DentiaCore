const { hasPermission } = require('../utils/permissions');

const isAdminRole = (role) => {
  const normalized = (role || '').toString().toLowerCase();
  return normalized === 'admin' || normalized === 'administrador';
};

const authorize = (requiredPermissions = []) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }

  if (isAdminRole(req.user.role)) {
    return next();
  }

  if (!hasPermission(req.user.permissions, requiredPermissions)) {
    return res.status(403).json({ message: 'Permisos insuficientes para esta operación' });
  }

  return next();
};

module.exports = authorize;

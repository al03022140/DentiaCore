const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../utils/crypto');

const getJwtIssuer = () => process.env.JWT_ISSUER || 'dentia-core';

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return res.status(401).json({ message: 'Token de autenticación requerido' });
  }

  try {
    // algorithms fijo (defensa en profundidad contra confusión de algoritmo).
    const payload = jwt.verify(token, getJwtSecret(), { issuer: getJwtIssuer(), algorithms: ['HS256'] });

    // Rechazar refresh tokens en rutas protegidas: solo los access tokens
    // (que no llevan `type`) deben autorizar el acceso a la API.
    if (payload.type === 'refresh') {
      return res.status(401).json({ message: 'Token inválido o expirado' });
    }

    req.user = {
      id: payload.sub,
      role: payload.role,
      nombre: payload.nombre || null,
      permissions: payload.permissions || []
    };
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
};

module.exports = authenticate;

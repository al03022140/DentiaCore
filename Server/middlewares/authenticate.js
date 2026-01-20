const jwt = require('jsonwebtoken');

const getJwtSecret = () => process.env.JWT_SECRET || 'dev-secret';

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return res.status(401).json({ message: 'Token de autenticación requerido' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = {
      id: payload.sub,
      role: payload.role,
      permissions: payload.permissions || []
    };
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
};

module.exports = authenticate;

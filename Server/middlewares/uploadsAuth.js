const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../utils/crypto');

const getJwtIssuer = () => process.env.JWT_ISSUER || 'dentia-core';

/**
 * Gate de autenticación para los archivos servidos desde /uploads (PHI).
 *
 * Hallazgo C-1: /uploads se servía de forma totalmente pública, permitiendo
 * descargar adjuntos, odontogramas, periodontogramas y fotos de pacientes sin
 * sesión. Esto cierra ese hueco exigiendo una sesión válida.
 *
 * Reto: el frontend referencia varias de estas rutas directamente como
 * `<img src="/uploads/...">`, y un `<img>` del navegador NO envía el header
 * `Authorization`. Por eso aceptamos DOS formas de autenticación:
 *   1. Header `Authorization: Bearer <accessToken>` — peticiones axios / fetch
 *      de blobs (descargas, vistas previas autenticadas).
 *   2. Cookie httpOnly `refreshToken` — el navegador la envía automáticamente
 *      con las peticiones de subrecursos (`<img>`, `<a download>`) cuando el
 *      cliente y la API comparten origen, como ocurre en producción (Express
 *      sirve Client/dist y /uploads desde el mismo host).
 *
 * Nota de despliegue: en desarrollo, si el cliente (Vite :5173) y la API
 * (:5002) están en orígenes distintos, la cookie `SameSite=Lax` no viaja con
 * los `<img>` cross-origin; las miniaturas que dependen de la cookie pueden dar
 * 401 en dev. La migración recomendada (fuera de este parche) es servir esas
 * imágenes como blobs autenticados, igual que ya hace la firma digital
 * (`fetchFirmaBlobUrl`).
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, getJwtSecret(), { issuer: getJwtIssuer() });
  } catch (_e) {
    return null;
  }
};

const uploadsAuth = (req, res, next) => {
  // 1) Bearer token (access token) en el header Authorization
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const payload = verifyToken(authHeader.slice(7).trim());
    // Un access token válido no lleva `type: 'refresh'`
    if (payload && payload.type !== 'refresh') {
      return next();
    }
  }

  // 2) Cookie de sesión httpOnly (refresh token) — la envía el `<img>` en
  //    mismo origen. Verifica firma + issuer; debe ser de tipo refresh.
  const cookieToken = req.cookies && req.cookies.refreshToken;
  if (cookieToken) {
    const payload = verifyToken(cookieToken);
    if (payload && payload.type === 'refresh') {
      return next();
    }
  }

  return res.status(401).json({ message: 'No autorizado para acceder a este archivo' });
};

module.exports = uploadsAuth;

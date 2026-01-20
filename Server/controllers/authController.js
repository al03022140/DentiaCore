const jwt = require('jsonwebtoken');
const Usuario = require('../models/users');
const { getEffectivePermissions } = require('../utils/permissions');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME_MINUTES = 15;

const getJwtSecret = () => process.env.JWT_SECRET || 'dev-secret';
const getAccessTtl = () => process.env.JWT_ACCESS_TTL || '15m';
const getRefreshTtl = () => process.env.JWT_REFRESH_TTL || '7d';
const getJwtIssuer = () => process.env.JWT_ISSUER || 'dentia-core';

const parseDurationToMs = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  const match = /^([0-9]+)\s*(ms|s|m|h|d)?$/i.exec(value.toString().trim());
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = (match[2] || 'ms').toLowerCase();
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  return amount * (multipliers[unit] || 1);
};

const buildCookieOptions = () => {
  const maxAge = parseDurationToMs(getRefreshTtl());
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: String(process.env.COOKIE_SECURE || 'false').toLowerCase() === 'true',
    maxAge: maxAge || undefined
  };
};

const signAccessToken = (user, permissions) => {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.rol,
      permissions
    },
    getJwtSecret(),
    {
      expiresIn: getAccessTtl(),
      issuer: getJwtIssuer()
    }
  );
};

const signRefreshToken = (user) => {
  return jwt.sign(
    {
      sub: user._id.toString(),
      type: 'refresh'
    },
    getJwtSecret(),
    {
      expiresIn: getRefreshTtl(),
      issuer: getJwtIssuer()
    }
  );
};

const respondWithTokens = async (res, user) => {
  const permissions = getEffectivePermissions(user);
  const accessToken = signAccessToken(user, permissions);
  const refreshToken = signRefreshToken(user);

  user.refreshToken = refreshToken;
  user.refreshTokenExpiresAt = new Date(Date.now() + parseDurationToMs(getRefreshTtl()));
  await user.save();

  res.cookie('refreshToken', refreshToken, buildCookieOptions());

  return res.json({
    accessToken,
    user: {
      id: user._id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      permissions
    }
  });
};

const login = async (req, res) => {
  const { email, contraseña } = req.body || {};

  if (!email || !contraseña) {
    return res.status(400).json({ message: 'Email y contraseña son requeridos' });
  }

  const user = await Usuario.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    return res.status(401).json({ message: 'Credenciales inválidas' });
  }

  if (user.active === false) {
    return res.status(403).json({ message: 'Usuario desactivado' });
  }

  if (user.lockUntil && user.lockUntil > Date.now()) {
    return res.status(423).json({ message: 'Cuenta bloqueada temporalmente' });
  }

  const passwordMatches = await user.compararContraseña(contraseña);
  if (!passwordMatches) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockUntil = Date.now() + LOCK_TIME_MINUTES * 60 * 1000;
      user.failedLoginAttempts = 0;
    }
    await user.save();
    return res.status(401).json({ message: 'Credenciales inválidas' });
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  user.lastLoginAt = new Date();

  return respondWithTokens(res, user);
};

const refresh = async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) {
    return res.status(401).json({ message: 'Refresh token requerido' });
  }

  let payload;
  try {
    payload = jwt.verify(token, getJwtSecret());
  } catch (error) {
    return res.status(401).json({ message: 'Refresh token inválido o expirado' });
  }

  if (payload.type !== 'refresh') {
    return res.status(401).json({ message: 'Refresh token inválido' });
  }

  const user = await Usuario.findById(payload.sub);
  if (!user || user.active === false) {
    return res.status(401).json({ message: 'Refresh token inválido' });
  }

  if (user.refreshToken !== token) {
    return res.status(401).json({ message: 'Refresh token inválido' });
  }

  return respondWithTokens(res, user);
};

const logout = async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (token) {
    try {
      const payload = jwt.verify(token, getJwtSecret());
      const user = await Usuario.findById(payload.sub);
      if (user) {
        user.refreshToken = null;
        user.refreshTokenExpiresAt = null;
        await user.save();
      }
    } catch (error) {
      // Ignorar errores de token al cerrar sesión
    }
  }

  res.clearCookie('refreshToken', buildCookieOptions());
  return res.status(204).send();
};

const me = async (req, res) => {
  const user = await Usuario.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }

  const permissions = getEffectivePermissions(user);
  return res.json({
    id: user._id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
    permissions
  });
};

module.exports = {
  login,
  refresh,
  logout,
  me
};

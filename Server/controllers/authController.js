const jwt = require('jsonwebtoken');
const Usuario = require('../models/users');
const ClinicSettings = require('../models/clinicSettings');
const { getEffectivePermissions } = require('../utils/permissions');
const auditLogger = require('../middlewares/auditLogger');
const { hashToken, generateSecureToken, getJwtSecret, validatePasswordStrength } = require('../utils/crypto');
const logger = require('../utils/logger');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME_MINUTES = 15;
const PASSWORD_RESET_TTL_MINUTES = 30;

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
      nombre: user.nombre || null,
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
  const settings = await ClinicSettings.getSettings();
  const roleOverrides = settings.rolePermissionOverrides || {};
  const permissions = getEffectivePermissions(user, roleOverrides);
  const accessToken = signAccessToken(user, permissions);
  const refreshToken = signRefreshToken(user);

  // Store hashed refresh token — never store raw tokens in DB
  user.refreshTokenHash = hashToken(refreshToken);
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

const login = async (req, res, next) => {
  try {
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

    // Registrar login fallido en auditoría (NOM-024)
    auditLogger.registrarManual(
      { user: { id: user._id, role: user.rol, nombre: user.nombre }, ip: req.ip },
      'login_fallido',
      { resourceType: 'usuario', resourceId: user._id, detalles: { intentos: user.failedLoginAttempts } }
    ).catch(() => {});

    return res.status(401).json({ message: 'Credenciales inválidas' });
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  user.lastLoginAt = new Date();

  // Registrar login exitoso en auditoría
  auditLogger.registrarManual({ user: { id: user._id, role: user.rol, nombre: user.nombre }, ip: req.ip }, 'login_exitoso', {
    resourceType: 'usuario',
    resourceId: user._id,
  }).catch(() => {});

  return respondWithTokens(res, user);
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) {
    return res.status(401).json({ message: 'Refresh token requerido' });
  }

  let payload;
  try {
    payload = jwt.verify(token, getJwtSecret());
  } catch (_error) {
    return res.status(401).json({ message: 'Refresh token inválido o expirado' });
  }

  if (payload.type !== 'refresh') {
    return res.status(401).json({ message: 'Refresh token inválido' });
  }

  const user = await Usuario.findById(payload.sub);
  if (!user || user.active === false) {
    return res.status(401).json({ message: 'Refresh token inválido' });
  }

  // Compare hashed refresh token
  if (user.refreshTokenHash !== hashToken(token)) {
    // Possible token reuse attack — invalidate all sessions for this user
    user.refreshTokenHash = null;
    user.refreshTokenExpiresAt = null;
    await user.save();
    logger.warn(`Refresh token reuse detected for user ${user._id}`);
    return res.status(401).json({ message: 'Refresh token inválido' });
  }

  return respondWithTokens(res, user);
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
  const token = req.cookies?.refreshToken;
  if (token) {
    try {
      const payload = jwt.verify(token, getJwtSecret());
      const user = await Usuario.findById(payload.sub);
      if (user) {
        user.refreshTokenHash = null;
        user.refreshTokenExpiresAt = null;
        await user.save();
      }
    } catch (_error) {
      // Ignorar errores de token al cerrar sesión
    }
  }

  // Registrar logout en auditoría (NOM-024)
  if (req.user) {
    auditLogger.registrarManual(
      req,
      'logout',
      { resourceType: 'usuario', resourceId: req.user.id }
    ).catch(() => {});
  }

  res.clearCookie('refreshToken', buildCookieOptions());
  return res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const me = async (req, res, next) => {
  try {
  const user = await Usuario.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }

  const settings = await ClinicSettings.getSettings();
  const roleOverrides = settings.rolePermissionOverrides || {};
  const permissions = getEffectivePermissions(user, roleOverrides);
  return res.json({
    id: user._id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
    permissions
  });
  } catch (error) {
    next(error);
  }
};

// ── PIN: Establecer o cambiar PIN (roles.MD §9.3) ──────────────
const setPin = async (req, res, next) => {
  try {
  const { pin, contraseña } = req.body || {};

  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ message: 'El PIN debe ser exactamente 4 dígitos numéricos' });
  }

  const user = await Usuario.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

  // Requiere contraseña para cambiar PIN
  if (contraseña) {
    const valid = await user.compararContraseña(contraseña);
    if (!valid) return res.status(401).json({ message: 'Contraseña incorrecta' });
  } else if (user.pinHash) {
    // Si ya tiene PIN, requiere contraseña para cambiarlo
    return res.status(400).json({ message: 'Se requiere contraseña para cambiar el PIN' });
  }

  await user.setPin(pin);
  await user.save();

  auditLogger.registrarManual(req, 'cambio_pin', {
    resourceType: 'usuario',
    resourceId: user._id,
  }).catch(() => {});

  return res.json({ message: 'PIN establecido correctamente' });
  } catch (error) {
    next(error);
  }
};

// ── PIN: Verificar PIN (Modo Cortina desbloqueo) ────────────────
const MAX_PIN_ATTEMPTS = 5;

const verifyPin = async (req, res, next) => {
  try {
  const { pin } = req.body || {};

  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ message: 'PIN inválido', valid: false });
  }

  const user = await Usuario.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

  if (!user.pinHash) {
    return res.status(400).json({ message: 'El usuario no tiene PIN configurado', valid: false });
  }

  if (user.pinFailedAttempts >= MAX_PIN_ATTEMPTS) {
    auditLogger.registrarManual(req, 'pin_fallo', {
      resourceType: 'session',
      detalles: { razon: 'PIN bloqueado por máximo de intentos' },
    }).catch(() => {});

    return res.status(423).json({
      message: 'PIN bloqueado por demasiados intentos fallidos. Inicie sesión nuevamente.',
      valid: false,
      locked: true,
    });
  }

  const valid = await user.verificarPin(pin);
  if (!valid) {
    user.pinFailedAttempts = (user.pinFailedAttempts || 0) + 1;
    await user.save();

    auditLogger.registrarManual(req, 'pin_fallo', {
      resourceType: 'session',
      detalles: { intentos: user.pinFailedAttempts },
    }).catch(() => {});

    return res.status(401).json({
      message: 'PIN incorrecto',
      valid: false,
      intentosRestantes: MAX_PIN_ATTEMPTS - user.pinFailedAttempts,
    });
  }

  // PIN correcto → resetear intentos
  user.pinFailedAttempts = 0;
  await user.save();

  return res.json({ valid: true, message: 'PIN verificado correctamente' });
  } catch (error) {
    next(error);
  }
};

// ── Modo Cortina: Bloquear / Desbloquear pantalla ───────────────
const lockScreen = async (req, res, next) => {
  try {
    await auditLogger.registrarManual(req, 'pantalla_bloqueada', {
      resourceType: 'session',
      trigger: req.body?.trigger || 'manual',
    });

    return res.json({ locked: true, message: 'Pantalla bloqueada' });
  } catch (error) {
    next(error);
  }
};

const unlockScreen = async (req, res, next) => {
  try {
    // El PIN se verifica antes con verifyPin; este endpoint solo registra el evento
    await auditLogger.registrarManual(req, 'pantalla_desbloqueada', {
      resourceType: 'session',
      trigger: 'manual',
    });

    return res.json({ locked: false, message: 'Pantalla desbloqueada' });
  } catch (error) {
    next(error);
  }
};

// ── Password Reset: Request ─────────────────────────────────
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body || {};

    // Always return the same response to prevent user enumeration
    const genericResponse = { message: 'Si el email existe, se ha enviado un enlace de restablecimiento.' };

    if (!email) {
      return res.status(400).json({ message: 'Email es requerido' });
    }

    const user = await Usuario.findOne({ email: email.toLowerCase().trim(), active: true });
    if (!user) {
      return res.json(genericResponse);
    }

    // Generate secure reset token
    const rawToken = generateSecureToken(32);
    user.passwordResetToken = hashToken(rawToken);
    user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
    await user.save();

    // Log the reset request (token is logged server-side only for admin retrieval in dev)
    logger.info(`Password reset requested for ${user.email}. Token expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.`);
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[DEV ONLY] Reset token for ${user.email}: ${rawToken}`);
    }

    auditLogger.registrarManual(
      { user: { id: user._id, role: user.rol, nombre: user.nombre }, ip: req.ip },
      'password_reset_solicitado',
      { resourceType: 'usuario', resourceId: user._id }
    ).catch(() => {});

    // TODO: Integrate email sending here. Send rawToken in a reset URL to the user's email.
    // Example: await sendEmail(user.email, 'Password Reset', `Reset link: ${CLIENT_URL}/reset-password?token=${rawToken}`);

    return res.json(genericResponse);
  } catch (error) {
    next(error);
  }
};

// ── Password Reset: Confirm ─────────────────────────────────
const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body || {};

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token y nueva contraseña son requeridos' });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return res.status(400).json({ message: strength.message });
    }

    const hashedToken = hashToken(token);
    const user = await Usuario.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
      active: true
    });

    if (!user) {
      return res.status(400).json({ message: 'Token inválido o expirado' });
    }

    // Set new password and clear reset token + all sessions
    user.contraseña = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.refreshTokenHash = null;
    user.refreshTokenExpiresAt = null;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastPasswordChangeAt = new Date();
    await user.save();

    auditLogger.registrarManual(
      { user: { id: user._id, role: user.rol, nombre: user.nombre }, ip: req.ip },
      'password_reset_completado',
      { resourceType: 'usuario', resourceId: user._id }
    ).catch(() => {});

    res.clearCookie('refreshToken', buildCookieOptions());
    return res.json({ message: 'Contraseña restablecida correctamente. Inicie sesión nuevamente.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  refresh,
  logout,
  me,
  setPin,
  verifyPin,
  lockScreen,
  unlockScreen,
  forgotPassword,
  resetPassword,
};

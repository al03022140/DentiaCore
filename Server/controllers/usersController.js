const Usuario = require('../models/users');
const ClinicSettings = require('../models/clinicSettings');
const { validatePasswordStrength } = require('../utils/crypto');
const { isAdminRole, validatePermissionAssignment, getEffectivePermissions } = require('../utils/permissions');

// Role hierarchy: higher index = more privileged
// doctor_admin va entre doctor y administrador: el dentista-director tiene
// más capacidades clínicas que el doctor "puro", pero queda subordinado al
// administrador (dueño/gestor del consultorio que también puede crearlo).
const ROLE_HIERARCHY = ['recepcionista', 'asistente', 'doctor', 'doctor_admin', 'administrador', 'superadmin'];

const getRoleLevel = (role) => {
  const idx = ROLE_HIERARCHY.indexOf(role);
  return idx >= 0 ? idx : -1;
};

/**
 * Prevent privilege escalation:
 * - Only superadmin can create/modify superadmin accounts
 * - Cannot assign a role higher than your own
 * - Cannot modify users with an equal or higher role (except self)
 */
const checkPrivilegeEscalation = (actorRole, targetCurrentRole, targetNewRole, isSelf = false) => {
  const actorLevel = getRoleLevel(actorRole);

  // Only superadmin can touch superadmin accounts
  if (targetCurrentRole === 'superadmin' && actorRole !== 'superadmin') {
    return 'No tiene permisos para modificar cuentas de superadmin';
  }

  // Cannot modify users whose CURRENT role is equal or higher than yours
  // (except editing your own account). Sin esto, un `doctor` (que tiene
  // users.update) podía hacer PUT sobre el `administrador` y resetearle la
  // contraseña → toma de control de una cuenta de mayor privilegio.
  // El superadmin queda exento (puede gestionar a todos).
  if (!isSelf && actorRole !== 'superadmin' &&
      targetCurrentRole && getRoleLevel(targetCurrentRole) >= actorLevel) {
    return 'No puede modificar usuarios con un rol igual o superior al suyo';
  }

  // Cannot assign role higher than your own
  if (targetNewRole && getRoleLevel(targetNewRole) > actorLevel) {
    return 'No puede asignar un rol superior al suyo';
  }

  // Cannot self-escalate role
  if (isSelf && targetNewRole && targetNewRole !== targetCurrentRole) {
    return 'No puede cambiar su propio rol';
  }

  return null;
};

const sanitizeUser = (user) => {
  if (!user) return null;
  const source = user.toObject ? user.toObject() : user;
  const {
    contraseña: _pw,
    pinHash,
    refreshTokenHash,
    previousRefreshTokenHash,
    refreshTokenExpiresAt,
    failedLoginAttempts,
    lockUntil,
    pinFailedAttempts,
    passwordResetToken,
    passwordResetExpires,
    __v,
    ...rest
  } = source;
  return {
    ...rest,
    hasPin: Boolean(pinHash)
  };
};

const getAllUsers = async (req, res) => {
  try {
    const users = await Usuario.find().sort({ createdAt: -1 }).select('-contraseña');
    // rolePermissions = lo que otorga el rol (sin overrides individuales). La UI
    // de "Por Usuario" lo usa para mostrar como activos-bloqueados los permisos
    // que ya trae el rol y dejar editables solo los adicionales.
    const { rolePermissionOverrides } = await ClinicSettings.getSettings();
    res.json(users.map((u) => ({
      ...sanitizeUser(u),
      rolePermissions: getEffectivePermissions({ rol: u.rol, permissions: [] }, rolePermissionOverrides),
    })));
  } catch (_error) {
    res.status(500).json({ message: 'Error al obtener usuarios' });
  }
};

/**
 * GET /users/doctors
 * Lista mínima de usuarios con rol clínico-firmable (doctor / doctor_admin)
 * para que el asistente sepa a quién pedir la firma. Sólo expone campos
 * estrictamente necesarios (NOM-024 + LFPDPPP Art. 6, proporcionalidad).
 */
const listDoctors = async (req, res) => {
  try {
    const doctors = await Usuario.find({
      rol: { $in: ['doctor', 'doctor_admin'] },
      active: true,
    })
      // M-5: no exponer la cédula profesional (PII) a cualquier rol; el
      // asistente solo necesita el nombre y si el doctor tiene firma.
      .select('_id nombre firmaDigitalUrl rol')
      .sort({ nombre: 1 })
      .lean();
    res.json(doctors.map((d) => ({
      id: d._id,
      nombre: d.nombre,
      rol: d.rol,
      hasFirma: Boolean(d.firmaDigitalUrl),
    })));
  } catch (error) {
    console.error('[users.listDoctors] Error:', error);
    res.status(500).json({ message: 'Error al listar doctores' });
  }
};

const createUser = async (req, res) => {
  try {
    const {
      nombre, email, contraseña, rol, pin, permissions, active,
      cedulaProfesional, especialidad, universidad, registroSSA
    } = req.body || {};

    if (!nombre || !email || !contraseña || !rol || !pin) {
      return res.status(400).json({ message: 'Nombre, email, contraseña, PIN y rol son requeridos' });
    }

    // Prevent privilege escalation
    const escalationErr = checkPrivilegeEscalation(req.user.role, null, rol);
    if (escalationErr) {
      return res.status(403).json({ message: escalationErr });
    }

    // Prevent privilege escalation via the `permissions` field (C-2):
    // an actor cannot grant dangerous or self-not-held permissions. La regla
    // solo aplica a permisos que EXCEDEN el conjunto efectivo del rol asignado
    // (defaults + override del rol): incluir lo que el rol ya posee no es otorgar.
    if (permissions !== undefined) {
      const { rolePermissionOverrides } = await ClinicSettings.getSettings();
      const rolePerms = getEffectivePermissions({ rol }, rolePermissionOverrides);
      const permCheck = validatePermissionAssignment(permissions, req.user, rolePerms);
      if (!permCheck.valid) {
        return res.status(403).json({ message: permCheck.message });
      }
    }

    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ message: 'El PIN debe ser exactamente 4 dígitos numéricos' });
    }

    // NOM-004 Art. 5.10: cédula profesional obligatoria para cualquier rol
    // que practique clínicamente (doctor y doctor_admin).
    if ((rol === 'doctor' || rol === 'doctor_admin') && (!cedulaProfesional || !String(cedulaProfesional).trim())) {
      return res.status(400).json({
        message: 'La cédula profesional es obligatoria para crear una cuenta de doctor.'
      });
    }

    const strength = validatePasswordStrength(contraseña);
    if (!strength.valid) {
      return res.status(400).json({ message: strength.message });
    }

    const existing = await Usuario.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ message: 'Ya existe un usuario con ese email' });
    }

    const user = new Usuario({
      nombre,
      email: email.toLowerCase().trim(),
      contraseña,
      rol,
      permissions: permissions || [],
      active: active !== undefined ? Boolean(active) : true,
      ...(cedulaProfesional ? { cedulaProfesional: String(cedulaProfesional).trim() } : {}),
      ...(especialidad ? { especialidad: String(especialidad).trim() } : {}),
      ...(universidad ? { universidad: String(universidad).trim() } : {}),
      ...(registroSSA ? { registroSSA: String(registroSSA).trim() } : {})
    });

    await user.setPin(pin);

    await user.save();
    return res.status(201).json(sanitizeUser(user));
  } catch (error) {
    // Errores comunes con mensajes útiles (ValidationError, duplicate key)
    if (error?.name === 'ValidationError') {
      const firstMsg = Object.values(error.errors || {})[0]?.message || error.message;
      return res.status(400).json({ message: firstMsg });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Ya existe un usuario con ese email' });
    }
    console.error('[users.createUser] Error inesperado:', error);
    res.status(500).json({ message: error?.message || 'Error al crear usuario' });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await Usuario.findById(req.params.id).select('-contraseña');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    return res.json(sanitizeUser(user));
  } catch (_error) {
    res.status(500).json({ message: 'Error al obtener usuario' });
  }
};

const updateUser = async (req, res) => {
  try {
    const {
      nombre, email, contraseña, rol, permissions, active,
      cedulaProfesional, especialidad, universidad, registroSSA
    } = req.body || {};
    const user = await Usuario.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Prevent privilege escalation
    const isSelf = req.user.id === user._id.toString();
    const escalationErr = checkPrivilegeEscalation(req.user.role, user.rol, rol, isSelf);
    if (escalationErr) {
      return res.status(403).json({ message: escalationErr });
    }

    // Prevent privilege escalation via the `permissions` field (C-2):
    // an actor cannot grant dangerous or self-not-held permissions, and
    // cannot edit their own individual permission overrides. La regla solo
    // aplica a permisos AÑADIDOS respecto a los efectivos ACTUALES del usuario
    // objetivo (rol + overrides): mantener o quitar lo que ya posee no es otorgar.
    if (permissions !== undefined) {
      if (isSelf) {
        return res.status(403).json({ message: 'No puede modificar sus propios permisos' });
      }
      const { rolePermissionOverrides } = await ClinicSettings.getSettings();
      const currentEffective = getEffectivePermissions(user, rolePermissionOverrides);
      const permCheck = validatePermissionAssignment(permissions, req.user, currentEffective);
      if (!permCheck.valid) {
        return res.status(403).json({ message: permCheck.message });
      }
    }

    // Validar unicidad de email si se está cambiando
    if (email !== undefined && email.toLowerCase().trim() !== user.email.toLowerCase().trim()) {
      const emailTaken = await Usuario.findOne({ email: email.toLowerCase().trim(), _id: { $ne: user._id } });
      if (emailTaken) {
        return res.status(409).json({ message: 'Ya existe otro usuario con ese email' });
      }
    }

    // Si el rol final es doctor o doctor_admin, exigir cédula.
    const finalRol = rol !== undefined ? rol : user.rol;
    const finalCedula = cedulaProfesional !== undefined ? cedulaProfesional : user.cedulaProfesional;
    if ((finalRol === 'doctor' || finalRol === 'doctor_admin') && (!finalCedula || !String(finalCedula).trim())) {
      return res.status(400).json({
        message: 'La cédula profesional es obligatoria para cuentas de doctor.'
      });
    }

    if (nombre !== undefined) user.nombre = nombre;
    if (email !== undefined) user.email = email.toLowerCase().trim();
    if (rol !== undefined) user.rol = rol;
    if (permissions !== undefined) user.permissions = permissions;
    if (active !== undefined) user.active = Boolean(active);
    if (cedulaProfesional !== undefined) user.cedulaProfesional = String(cedulaProfesional).trim() || null;
    if (especialidad !== undefined) user.especialidad = especialidad ? String(especialidad).trim() : null;
    if (universidad !== undefined) user.universidad = universidad ? String(universidad).trim() : null;
    if (registroSSA !== undefined) user.registroSSA = registroSSA ? String(registroSSA).trim() : null;
    if (contraseña) {
      const strength = validatePasswordStrength(contraseña);
      if (!strength.valid) {
        return res.status(400).json({ message: strength.message });
      }
      user.contraseña = contraseña;
      user.lastPasswordChangeAt = new Date();
      // SEC-01: invalidar TODAS las sesiones (incl. previousRefreshTokenHash).
      user.revokeAllSessions();
    }

    await user.save();
    return res.json(sanitizeUser(user));
  } catch (error) {
    if (error?.name === 'ValidationError') {
      const firstMsg = Object.values(error.errors || {})[0]?.message || error.message;
      return res.status(400).json({ message: firstMsg });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Ya existe otro usuario con ese email' });
    }
    console.error('[users.updateUser] Error inesperado:', error);
    res.status(500).json({ message: error?.message || 'Error al actualizar usuario' });
  }
};

const disableUser = async (req, res) => {
  try {
    const user = await Usuario.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Prevent self-disable
    if (req.user.id === user._id.toString()) {
      return res.status(403).json({ message: 'No puede desactivar su propia cuenta' });
    }

    // Misma regla anti-escalada que updateUser: no se puede desactivar a un
    // usuario de rol igual o superior (cubre superadmin y el caso doctor →
    // administrador). El superadmin puede desactivar a cualquiera.
    const escalationErr = checkPrivilegeEscalation(req.user.role, user.rol, undefined, false);
    if (escalationErr) {
      return res.status(403).json({ message: escalationErr });
    }

    user.active = false;
    // SEC-01: al desactivar, revocar TODAS las sesiones (incl. previousRefreshTokenHash).
    user.revokeAllSessions();
    await user.save();

    return res.json(sanitizeUser(user));
  } catch (error) {
    console.error('[users.disableUser] Error inesperado:', error);
    res.status(500).json({ message: error?.message || 'Error al desactivar usuario' });
  }
};

module.exports = {
  getAllUsers,
  listDoctors,
  createUser,
  getUserById,
  updateUser,
  disableUser
};

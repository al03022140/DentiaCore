const Usuario = require('../models/users');
const { validatePasswordStrength } = require('../utils/crypto');
const { isAdminRole } = require('../utils/permissions');

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
    res.json(users.map(sanitizeUser));
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
      .select('_id nombre cedulaProfesional firmaDigitalUrl rol')
      .sort({ nombre: 1 })
      .lean();
    res.json(doctors.map((d) => ({
      id: d._id,
      nombre: d.nombre,
      cedulaProfesional: d.cedulaProfesional || null,
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
      // Invalidate existing sessions on password change
      user.refreshTokenHash = null;
      user.refreshTokenExpiresAt = null;
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

    // Prevent disabling superadmin accounts by non-superadmins
    if (user.rol === 'superadmin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'No tiene permisos para desactivar cuentas de superadmin' });
    }

    // Prevent self-disable
    if (req.user.id === user._id.toString()) {
      return res.status(403).json({ message: 'No puede desactivar su propia cuenta' });
    }

    user.active = false;
    user.refreshTokenHash = null;
    user.refreshTokenExpiresAt = null;
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

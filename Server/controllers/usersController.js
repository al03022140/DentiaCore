const Usuario = require('../models/users');

const sanitizeUser = (user) => {
  if (!user) return null;
  const { contraseña: _pw, __v, ...rest } = user.toObject ? user.toObject() : user;
  return rest;
};

const getAllUsers = async (req, res) => {
  try {
    const users = await Usuario.find().sort({ createdAt: -1 }).select('-contraseña');
    res.json(users.map(sanitizeUser));
  } catch (_error) {
    res.status(500).json({ message: 'Error al obtener usuarios' });
  }
};

const createUser = async (req, res) => {
  try {
    const { nombre, email, contraseña, rol, permissions, active } = req.body || {};

    if (!nombre || !email || !contraseña || !rol) {
      return res.status(400).json({ message: 'Nombre, email, contraseña y rol son requeridos' });
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
      active: active !== undefined ? Boolean(active) : true
    });

    await user.save();
    return res.status(201).json(sanitizeUser(user));
  } catch (_error) {
    res.status(500).json({ message: 'Error al crear usuario' });
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
    const { nombre, email, contraseña, rol, permissions, active } = req.body || {};
    const user = await Usuario.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Validar unicidad de email si se está cambiando
    if (email !== undefined && email.toLowerCase().trim() !== user.email.toLowerCase().trim()) {
      const emailTaken = await Usuario.findOne({ email: email.toLowerCase().trim(), _id: { $ne: user._id } });
      if (emailTaken) {
        return res.status(409).json({ message: 'Ya existe otro usuario con ese email' });
      }
    }

    if (nombre !== undefined) user.nombre = nombre;
    if (email !== undefined) user.email = email.toLowerCase().trim();
    if (rol !== undefined) user.rol = rol;
    if (permissions !== undefined) user.permissions = permissions;
    if (active !== undefined) user.active = Boolean(active);
    if (contraseña) {
      user.contraseña = contraseña;
      user.lastPasswordChangeAt = new Date();
    }

    await user.save();
    return res.json(sanitizeUser(user));
  } catch (_error) {
    res.status(500).json({ message: 'Error al actualizar usuario' });
  }
};

const disableUser = async (req, res) => {
  try {
    const user = await Usuario.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    user.active = false;
    user.refreshToken = null;
    user.refreshTokenExpiresAt = null;
    await user.save();

    return res.json(sanitizeUser(user));
  } catch (_error) {
    res.status(500).json({ message: 'Error al desactivar usuario' });
  }
};

module.exports = {
  getAllUsers,
  createUser,
  getUserById,
  updateUser,
  disableUser
};

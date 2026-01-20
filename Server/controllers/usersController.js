const Usuario = require('../models/users');

const sanitizeUser = (user) => {
  if (!user) return null;
  const { contraseña, __v, ...rest } = user.toObject ? user.toObject() : user;
  return rest;
};

const getAllUsers = async (req, res) => {
  const users = await Usuario.find().sort({ createdAt: -1 }).select('-contraseña');
  res.json(users.map(sanitizeUser));
};

const createUser = async (req, res) => {
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
    email,
    contraseña,
    rol,
    permissions: permissions || [],
    active: active !== undefined ? Boolean(active) : true
  });

  await user.save();
  return res.status(201).json(sanitizeUser(user));
};

const getUserById = async (req, res) => {
  const user = await Usuario.findById(req.params.id).select('-contraseña');
  if (!user) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }
  return res.json(sanitizeUser(user));
};

const updateUser = async (req, res) => {
  const { nombre, email, contraseña, rol, permissions, active } = req.body || {};
  const user = await Usuario.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }

  if (nombre !== undefined) user.nombre = nombre;
  if (email !== undefined) user.email = email;
  if (rol !== undefined) user.rol = rol;
  if (permissions !== undefined) user.permissions = permissions;
  if (active !== undefined) user.active = Boolean(active);
  if (contraseña) {
    user.contraseña = contraseña;
    user.lastPasswordChangeAt = new Date();
  }

  await user.save();
  return res.json(sanitizeUser(user));
};

const disableUser = async (req, res) => {
  const user = await Usuario.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }

  user.active = false;
  user.refreshToken = null;
  user.refreshTokenExpiresAt = null;
  await user.save();

  return res.json(sanitizeUser(user));
};

module.exports = {
  getAllUsers,
  createUser,
  getUserById,
  updateUser,
  disableUser
};

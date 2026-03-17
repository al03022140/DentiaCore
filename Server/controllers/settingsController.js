const ClinicSettings = require('../models/clinicSettings');
const Usuario = require('../models/users');
const path = require('path');
const fsExtra = require('fs-extra');
const { resolveUploadsPath } = require('../utils/uploads');

let bcrypt;
try { bcrypt = require('bcrypt'); } catch (_e) { bcrypt = require('bcryptjs'); }

// ── Clinic Settings ──────────────────────────────────────────

exports.getSettings = async (req, res) => {
  try {
    const settings = await ClinicSettings.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener configuración', error: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const allowed = [
      'clinicName', 'address', 'phone', 'logoUrl',
      'inactivityTimeout', 'maxLoginAttempts', 'lockDuration',
      'defaultAppointmentDuration', 'businessHours', 'workDays',
      'cashCategories', 'currency', 'serviceCatalog'
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const settings = await ClinicSettings.updateSettings(updates);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar configuración', error: error.message });
  }
};

// ── Role Permissions ─────────────────────────────────────────

exports.getRolePermissions = async (req, res) => {
  try {
    const settings = await ClinicSettings.getSettings();
    res.json(settings.rolePermissionOverrides || {});
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener permisos por rol', error: error.message });
  }
};

exports.updateRolePermissions = async (req, res) => {
  try {
    const { role } = req.params;
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ message: 'permissions debe ser un array' });
    }
    const settings = await ClinicSettings.getSettings();
    settings.rolePermissionOverrides.set(role, permissions);
    await settings.save();
    res.json({ message: 'Permisos actualizados', role, permissions });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar permisos del rol', error: error.message });
  }
};

// ── User Preferences ─────────────────────────────────────────

exports.updateMyPreferences = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const allowed = ['theme', 'defaultAppointmentDuration', 'prescriptionDefaults', 'reminders'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[`preferences.${key}`] = req.body[key];
    }
    const user = await Usuario.findByIdAndUpdate(userId, { $set: updates }, { new: true })
      .select('-contraseña -refreshToken -pinHash');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar preferencias', error: error.message });
  }
};

// ── Password Change ──────────────────────────────────────────

exports.changeMyPassword = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Se requiere contraseña actual y nueva' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }
    const user = await Usuario.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const isMatch = await user.compararContraseña(currentPassword);
    if (!isMatch) return res.status(401).json({ message: 'Contraseña actual incorrecta' });

    user.contraseña = newPassword;
    user.lastPasswordChangeAt = new Date();
    await user.save();
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar contraseña', error: error.message });
  }
};

// ── PIN Change ───────────────────────────────────────────────

exports.changeMyPin = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { pin } = req.body;
    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ message: 'El PIN debe ser exactamente 4 dígitos' });
    }
    const user = await Usuario.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    await user.setPin(pin);
    await user.save();
    res.json({ message: 'PIN actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar PIN', error: error.message });
  }
};

// ── Professional Profile ─────────────────────────────────────

exports.updateProfessionalProfile = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const allowed = ['cedulaProfesional', 'especialidad', 'universidad', 'registroSSA'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const user = await Usuario.findByIdAndUpdate(userId, { $set: updates }, { new: true })
      .select('-contraseña -refreshToken -pinHash');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar perfil profesional', error: error.message });
  }
};

// ── Firma Digital ────────────────────────────────────────────

exports.uploadFirma = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se proporcionó imagen de firma' });

    const userId = req.user._id || req.user.id;
    const user = await Usuario.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    // Eliminar firma anterior si existe
    if (user.firmaDigitalUrl) {
      const oldPath = resolveUploadsPath('firmas', path.basename(user.firmaDigitalUrl));
      await fsExtra.remove(oldPath).catch(() => {});
    }

    user.firmaDigitalUrl = req.file.filename;
    await user.save();
    res.json({ message: 'Firma subida correctamente', firmaDigitalUrl: user.firmaDigitalUrl });
  } catch (error) {
    res.status(500).json({ message: 'Error al subir firma', error: error.message });
  }
};

exports.deleteFirma = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const user = await Usuario.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    if (user.firmaDigitalUrl) {
      const filePath = resolveUploadsPath('firmas', path.basename(user.firmaDigitalUrl));
      await fsExtra.remove(filePath).catch(() => {});
      user.firmaDigitalUrl = null;
      await user.save();
    }
    res.json({ message: 'Firma eliminada' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar firma', error: error.message });
  }
};

exports.getFirma = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!/^[a-f\d]{24}$/i.test(userId)) {
      return res.status(400).json({ message: 'ID de usuario inválido' });
    }
    const user = await Usuario.findById(userId).select('firmaDigitalUrl nombre');
    if (!user || !user.firmaDigitalUrl) {
      return res.status(404).json({ message: 'Firma no encontrada' });
    }
    const filePath = resolveUploadsPath('firmas', path.basename(user.firmaDigitalUrl));
    if (!await fsExtra.pathExists(filePath)) {
      return res.status(404).json({ message: 'Archivo de firma no encontrado' });
    }
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener firma', error: error.message });
  }
};

// ── Update My Profile (name, email) ─────────────────────────

exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const allowed = ['nombre', 'email'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const user = await Usuario.findByIdAndUpdate(userId, { $set: updates }, { new: true, runValidators: true })
      .select('-contraseña -refreshToken -pinHash');
    res.json(user);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'El correo electrónico ya está en uso' });
    }
    res.status(500).json({ message: 'Error al actualizar perfil', error: error.message });
  }
};

// ── User Permission Overrides (admin) ────────────────────────

exports.updateUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!/^[a-f\d]{24}$/i.test(userId)) {
      return res.status(400).json({ message: 'ID de usuario inválido' });
    }
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ message: 'permissions debe ser un array' });
    }
    const user = await Usuario.findByIdAndUpdate(userId, { $set: { permissions } }, { new: true })
      .select('-contraseña -refreshToken -pinHash');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar permisos', error: error.message });
  }
};

// ── Logo Clínica ─────────────────────────────────────────────

exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se proporcionó imagen de logo' });

    const settings = await ClinicSettings.getSettings();

    // Eliminar logo anterior si existe
    if (settings.logoUrl) {
      const oldPath = resolveUploadsPath('logos', path.basename(settings.logoUrl));
      await fsExtra.remove(oldPath).catch(() => {});
    }

    settings.logoUrl = req.file.filename;
    await settings.save();
    res.json({ message: 'Logo subido correctamente', logoUrl: settings.logoUrl });
  } catch (error) {
    res.status(500).json({ message: 'Error al subir logo', error: error.message });
  }
};

exports.deleteLogo = async (req, res) => {
  try {
    const settings = await ClinicSettings.getSettings();
    if (settings.logoUrl) {
      const filePath = resolveUploadsPath('logos', path.basename(settings.logoUrl));
      await fsExtra.remove(filePath).catch(() => {});
      settings.logoUrl = null;
      await settings.save();
    }
    res.json({ message: 'Logo eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar logo', error: error.message });
  }
};

exports.getLogo = async (req, res) => {
  try {
    const settings = await ClinicSettings.getSettings();
    if (!settings.logoUrl) {
      return res.status(404).json({ message: 'Logo no configurado' });
    }
    const filePath = resolveUploadsPath('logos', path.basename(settings.logoUrl));
    if (!await fsExtra.pathExists(filePath)) {
      return res.status(404).json({ message: 'Archivo de logo no encontrado' });
    }
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener logo', error: error.message });
  }
};

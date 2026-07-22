const ClinicSettings = require('../models/clinicSettings');
const { devError } = require('../utils/httpError');
const Usuario = require('../models/users');
const AuditLog = require('../models/auditLog');
const path = require('path');
const fsExtra = require('fs-extra');
const { resolveUploadsPath } = require('../utils/uploads');
const { validateMimeByMagicBytes } = require('../utils/fileMagicBytes');
const { validatePasswordStrength } = require('../utils/crypto');
const {
  VALID_ROLES, normalizeRole, validatePermissionAssignment, isOverrideProtectedRole,
  getPermissionsForRole, getEffectivePermissions
} = require('../utils/permissions');

let bcrypt;
try { bcrypt = require('bcrypt'); } catch (_e) { bcrypt = require('bcryptjs'); }

// ── Clinic Settings ──────────────────────────────────────────

exports.getSettings = async (req, res) => {
  try {
    const settings = await ClinicSettings.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener configuración', error: devError(error) });
  }
};

const SETTINGS_ALLOWED_KEYS = [
  'clinicName', 'address', 'phone', 'logoUrl',
  'inactivityTimeout', 'maxLoginAttempts', 'lockDuration',
  'defaultAppointmentDuration', 'businessHours', 'workDays',
  'cashCategories', 'currency', 'serviceCatalog'
];

// Resume cambios en un diff campo-a-campo para el audit log. Compara
// valores serializados — para arrays/objetos basta detectar inequalidad
// estructural; no hace falta deep-diff en este nivel.
const diffSettings = (before, after) => {
  const camposEditados = [];
  const changes = {};
  for (const key of SETTINGS_ALLOWED_KEYS) {
    const a = JSON.stringify(before?.[key] ?? null);
    const b = JSON.stringify(after?.[key] ?? null);
    if (a !== b) {
      camposEditados.push(key);
      changes[key] = { from: before?.[key] ?? null, to: after?.[key] ?? null };
    }
  }
  return { camposEditados, changes };
};

exports.updateSettings = async (req, res) => {
  try {
    const updates = {};
    for (const key of SETTINGS_ALLOWED_KEYS) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No hay cambios para aplicar' });
    }

    const before = (await ClinicSettings.getSettings()).toObject();
    let settings;
    try {
      settings = await ClinicSettings.updateSettings(updates);
    } catch (err) {
      // Errores de validación del schema (enum currency, min/max, required)
      if (err?.name === 'ValidationError') {
        const firstField = Object.keys(err.errors || {})[0];
        const msg = firstField ? err.errors[firstField].message : err.message;
        return res.status(400).json({ message: msg || 'Datos inválidos' });
      }
      throw err;
    }

    const after = settings.toObject();
    const { camposEditados, changes } = diffSettings(before, after);

    // Audit log de cambios en configuración (NOM-024). Sólo lo escribimos
    // si hubo cambios reales para no inundar la colección con no-ops.
    if (camposEditados.length > 0 && req.user?.id) {
      try {
        await AuditLog.registrar({
          userId: req.user.id,
          userName: req.user.nombre || null,
          userRole: req.user.role || null,
          evento: 'modificacion_registro',
          resourceType: 'configuracion',
          resourceId: settings._id,
          camposEditados,
          detalles: { changes },
          motivo: typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : null,
          ip: req.ip || null
        });
      } catch (auditErr) {
        // Audit failure no debe bloquear la operación — sólo loguear.
        console.error('[settings] Error registrando audit log:', auditErr.message);
      }
    }

    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar configuración', error: devError(error) });
  }
};

// ── Role Permissions ─────────────────────────────────────────

exports.getRolePermissions = async (req, res) => {
  try {
    const settings = await ClinicSettings.getSettings();
    res.json(settings.rolePermissionOverrides || {});
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener permisos por rol', error: devError(error) });
  }
};

exports.updateRolePermissions = async (req, res) => {
  try {
    const { role } = req.params;
    const { permissions } = req.body;

    // Validar que el rol exista (evita crear overrides para roles inventados)
    if (!VALID_ROLES.includes(normalizeRole(role))) {
      return res.status(400).json({ message: `Rol inválido: ${role}` });
    }

    // Roles protegidos (doctor_admin/administrador/superadmin) no son editables
    // desde aquí: su base de permisos se gestiona en código y es inalienable
    // (ver OVERRIDE_PROTECTED_ROLES en utils/permissions.js). Bloquear evita
    // overrides que confundan o intenten reducir permisos estructurales.
    if (isOverrideProtectedRole(role)) {
      return res.status(403).json({
        message: 'Este rol no es editable; sus permisos se gestionan en código.'
      });
    }

    // Prevenir escalada de privilegios (C-2): lista blanca de permisos +
    // el actor no puede otorgar permisos peligrosos ni AÑADIR permisos que él
    // mismo no posea. La regla se evalúa contra el conjunto efectivo ACTUAL
    // del rol (override existente o, si nunca se configuró, sus defaults):
    // mantener o quitar permisos que el rol ya tiene NO es otorgar — sin esto
    // un administrador no podía guardar el rol Doctor (403 siempre).
    const settings = await ClinicSettings.getSettings();
    const existingOverride = settings.rolePermissionOverrides.get(normalizeRole(role));
    const currentRolePerms = Array.isArray(existingOverride)
      ? existingOverride
      : getPermissionsForRole(role);
    const check = validatePermissionAssignment(permissions, req.user, currentRolePerms);
    if (!check.valid) {
      return res.status(403).json({ message: check.message });
    }

    settings.rolePermissionOverrides.set(normalizeRole(role), permissions);
    await settings.save();
    res.json({ message: 'Permisos actualizados', role: normalizeRole(role), permissions });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar permisos del rol', error: devError(error) });
  }
};

// ── User Preferences ─────────────────────────────────────────

exports.updateMyPreferences = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const allowed = ['theme', 'defaultAppointmentDuration', 'prescriptionDefaults', 'reminders', 'signatureInput'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[`preferences.${key}`] = req.body[key];
    }
    const user = await Usuario.findByIdAndUpdate(userId, { $set: updates }, { new: true })
      .select('-contraseña -refreshTokenHash -previousRefreshTokenHash -pinHash -passwordResetToken');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar preferencias', error: devError(error) });
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

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return res.status(400).json({ message: strength.message });
    }

    const user = await Usuario.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const isMatch = await user.compararContraseña(currentPassword);
    if (!isMatch) return res.status(401).json({ message: 'Contraseña actual incorrecta' });

    user.contraseña = newPassword;
    user.lastPasswordChangeAt = new Date();
    // SEC-01: invalidar TODAS las sesiones (incl. previousRefreshTokenHash) —
    // forzar re-login con la nueva contraseña sin dejar un token previo vivo.
    user.revokeAllSessions();
    await user.save();
    res.json({ message: 'Contraseña actualizada correctamente. Inicie sesión nuevamente.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar contraseña', error: devError(error) });
  }
};

// ── PIN Change ───────────────────────────────────────────────

exports.changeMyPin = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { pin, currentPassword } = req.body;
    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ message: 'El PIN debe ser exactamente 4 dígitos' });
    }
    if (!currentPassword) {
      return res.status(400).json({ message: 'Se requiere la contraseña actual para cambiar el PIN' });
    }
    const user = await Usuario.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const isMatch = await user.compararContraseña(currentPassword);
    if (!isMatch) return res.status(401).json({ message: 'Contraseña actual incorrecta' });

    await user.setPin(pin);
    await user.save();
    res.json({ message: 'PIN actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar PIN', error: devError(error) });
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
      .select('-contraseña -refreshTokenHash -previousRefreshTokenHash -pinHash -passwordResetToken');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar perfil profesional', error: devError(error) });
  }
};

// ── Firma Digital ────────────────────────────────────────────

exports.uploadFirma = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se proporcionó imagen de firma' });

    // BE-03: validar el contenido real por magic bytes, no solo el MIME que
    // declara el cliente (la firma es un activo legal NOM-004). Mismo patrón que
    // attachmentController. Se borra el archivo si el sniff no coincide.
    const firmaSniff = await validateMimeByMagicBytes(req.file.path, req.file.mimetype);
    if (!firmaSniff.ok) {
      await fsExtra.remove(req.file.path).catch(() => {});
      return res.status(415).json({ message: 'El archivo de firma no es una imagen PNG/JPG válida' });
    }

    const userId = req.user._id || req.user.id;
    // Sólo necesitamos el filename anterior para limpiarlo del disco; no hace
    // falta cargar (ni revalidar) el documento completo.
    const user = await Usuario.findById(userId).select('firmaDigitalUrl');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    // Eliminar firma anterior si existe
    if (user.firmaDigitalUrl) {
      const oldPath = resolveUploadsPath('firmas', path.basename(user.firmaDigitalUrl));
      await fsExtra.remove(oldPath).catch(() => {});
    }

    // Persistencia ATÓMICA de un único campo que controla el servidor (el
    // filename lo genera multer). Se usa findByIdAndUpdate con
    // runValidators:false a propósito: `user.save()` revalida TODO el documento
    // y dispara el hook pre('save'), de modo que CUALQUIER campo legado/inválido
    // ajeno a la firma (p.ej. un enum viejo en preferences, o un email que ya no
    // cumple el regex) abortaba la subida con un 500 aunque la firma fuera
    // correcta. Aquí no hay nada del usuario que validar.
    const updated = await Usuario.findByIdAndUpdate(
      userId,
      { $set: { firmaDigitalUrl: req.file.filename } },
      { new: true, runValidators: false }
    );
    if (!updated) return res.status(404).json({ message: 'Usuario no encontrado' });

    res.json({ message: 'Firma subida correctamente', firmaDigitalUrl: updated.firmaDigitalUrl });
  } catch (error) {
    // Si quedara una validación previa (p.ej. exigir cédula antes de firmar),
    // devolvemos un 400 legible en vez del 500 genérico. El cliente muestra
    // `data.message` (ProfessionalProfileSection.jsx:305).
    if (error && error.name === 'ValidationError') {
      const detalle = Object.values(error.errors || {}).map((e) => e.message).join(' ');
      return res.status(400).json({
        message: detalle || 'No se pudo guardar la firma: revisa tu perfil profesional (cédula, etc.).'
      });
    }
    res.status(500).json({ message: 'Error al subir firma', error: devError(error) });
  }
};

exports.deleteFirma = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    // Sólo necesitamos el filename para borrarlo del disco; no cargamos ni
    // revalidamos el documento completo.
    const user = await Usuario.findById(userId).select('firmaDigitalUrl');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    if (user.firmaDigitalUrl) {
      const filePath = resolveUploadsPath('firmas', path.basename(user.firmaDigitalUrl));
      await fsExtra.remove(filePath).catch(() => {});
      // Limpieza ATÓMICA del único campo, igual que en uploadFirma: evitamos
      // `user.save()` (revalida TODO el documento y dispara el pre('save')) para
      // que un campo legado/inválido ajeno a la firma no aborte el borrado.
      // `null` es el valor "sin firma" del esquema (firmaDigitalUrl default:null,
      // users.js:110) y lo que esperan los chequeos `!!firmaDigitalUrl` del
      // cliente (hasFirma, ProfessionalProfileSection.jsx:41/68).
      await Usuario.findByIdAndUpdate(
        userId,
        { $set: { firmaDigitalUrl: null } },
        { new: true, runValidators: false }
      );
    }
    res.json({ message: 'Firma eliminada' });
  } catch (error) {
    // Mismo trato que uploadFirma: 400 legible ante ValidationError, 500 sólo
    // para errores inesperados.
    if (error && error.name === 'ValidationError') {
      const detalle = Object.values(error.errors || {}).map((e) => e.message).join(' ');
      return res.status(400).json({
        message: detalle || 'No se pudo eliminar la firma: revisa tu perfil profesional.'
      });
    }
    res.status(500).json({ message: 'Error al eliminar firma', error: devError(error) });
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
    res.status(500).json({ message: 'Error al obtener firma', error: devError(error) });
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
      .select('-contraseña -refreshTokenHash -previousRefreshTokenHash -pinHash -passwordResetToken');
    res.json(user);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'El correo electrónico ya está en uso' });
    }
    res.status(500).json({ message: 'Error al actualizar perfil', error: devError(error) });
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
    // Permisos del rol revocados para este usuario (grant/deny). Restar acceso
    // no es escalada, así que no pasa por validatePermissionAssignment; solo lo
    // saneamos a un array de strings.
    const deniedPermissions = Array.isArray(req.body.deniedPermissions)
      ? req.body.deniedPermissions.filter((p) => typeof p === 'string')
      : [];

    const targetUser = await Usuario.findById(userId).select('rol permissions');
    if (!targetUser) return res.status(404).json({ message: 'Usuario no encontrado' });

    // Prevenir escalada de privilegios (C-2): lista blanca de permisos +
    // el actor no puede otorgar permisos peligrosos ni AÑADIR permisos que él
    // mismo no posea. La regla se evalúa contra los permisos efectivos ACTUALES
    // del usuario objetivo (rol + overrides): mantener o quitar permisos que
    // ya posee NO es otorgar.
    const settings = await ClinicSettings.getSettings();
    const currentEffective = getEffectivePermissions(targetUser, settings.rolePermissionOverrides);
    const check = validatePermissionAssignment(permissions, req.user, currentEffective);
    if (!check.valid) {
      return res.status(403).json({ message: check.message });
    }

    const user = await Usuario.findByIdAndUpdate(userId, { $set: { permissions, deniedPermissions } }, { new: true })
      .select('-contraseña -refreshTokenHash -previousRefreshTokenHash -pinHash -passwordResetToken');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar permisos', error: devError(error) });
  }
};

// ── Logo Clínica ─────────────────────────────────────────────

exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se proporcionó imagen de logo' });

    // BE-04: mismo sniff de magic bytes que la firma (el logo se sirve estático).
    const logoSniff = await validateMimeByMagicBytes(req.file.path, req.file.mimetype);
    if (!logoSniff.ok) {
      await fsExtra.remove(req.file.path).catch(() => {});
      return res.status(415).json({ message: 'El archivo de logo no es una imagen válida' });
    }

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
    res.status(500).json({ message: 'Error al subir logo', error: devError(error) });
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
    res.status(500).json({ message: 'Error al eliminar logo', error: devError(error) });
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
    res.status(500).json({ message: 'Error al obtener logo', error: devError(error) });
  }
};
